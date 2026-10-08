"""Isolated, reproducible HTTP soak test. Uses installed Docker images and httpx.
Run with the service's .venv/bin/python scripts/sustained_load.py --seconds 600.
Never connects to the team database. Test containers/network are always removed.
"""

import argparse
import asyncio
import json
import math
import random
import statistics
import subprocess
import tempfile
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import httpx

SERVICE = Path(__file__).resolve().parents[1]
ROOT = SERVICE.parents[1]
P = "/wikiwatch-service/v1"
PASSWORD = "isolated-load-password-123"
NS = uuid.UUID("9ff80931-9e22-48c3-8647-460f9666d4b2")


def key(value):
    return str(uuid.uuid5(NS, str(value)))


def command(*args):
    result = subprocess.run(list(args), text=True, capture_output=True)
    if result.returncode:
        Path("/tmp/wikiwatch-load-setup-error.log").write_text(result.stderr + result.stdout)
        raise subprocess.CalledProcessError(
            result.returncode, list(args), output=result.stdout, stderr=result.stderr
        )
    return result.stdout.strip()


SEED = """import asyncio
from datetime import timedelta
from sqlalchemy import insert
from app.core.database import SessionLocal, engine
from app.models import Member, Edit, Audit, Event, Thread, Comment
from app.models.entities import now
from app.core.security import hash_password
from uuid import UUID, uuid5
ns=UUID("9ff80931-9e22-48c3-8647-460f9666d4b2")
def key(value):return str(uuid5(ns,str(value)))
async def run():
 async with SessionLocal() as db:
  for name,role in [("reviewer1","reviewer"),("reviewer2","reviewer"),("lead","lead"),("admin","admin")]:
   db.add(Member(id=key(name),name="Load "+name,email=name+"@example.org",role=role,active=True,password_hash=hash_password("isolated-load-password-123")))
  await db.flush()
  stamp=now()
  for start in range(0,9000,500):
   await db.execute(insert(Edit),[dict(id=key(i),wiki=["enwiki","arwiki","jawiki"][i%3],title="Load article "+str(i),editor="Load editor",comment="Public change metadata",old_rev=0,new_rev=100000+i,page_id=i+1,namespace=0,bot=False,delta=(i%500)-250,occurred_at=stamp-timedelta(seconds=i%3600),status="unclaimed",version=1,archived=False,reason="",return_reason="") for i in range(start,start+500)])
  for start in range(0,90000,1000):
   await db.execute(insert(Audit),[dict(actor_id=key("admin"),action="load.fixture",target=key(i%9000),detail={},created_at=stamp) for i in range(start,start+1000)])
   await db.execute(insert(Event),[dict(kind="load.fixture",target=key(i%9000),created_at=stamp) for i in range(start,start+1000)])
  # Maximum-size Unicode discussions exercise bounded response serialization.
  for article in range(5):
   for index in range(20):
    thread=key("thread:"+str(article)+":"+str(index))
    db.add(Thread(id=thread,edit_id=key(article),author_id=key("reviewer1"),anchor=dict(wiki=["enwiki","arwiki","jawiki"][article%3],old_rev=0,new_rev=100000+article,side="new",start_line=1,end_line=1),resolved=False,version=20,deleted=False))
    await db.flush()
    await db.execute(insert(Comment),[dict(id=key(thread+":"+str(j)),thread_id=thread,author_id=key("reviewer1"),body="測🙂"*2500) for j in range(20)])
  await db.commit()
 await engine.dispose()
asyncio.run(run())
"""


class Run:
    def __init__(self, args):
        self.args = args
        self.prefix = "wikiwatch-load-" + uuid.uuid4().hex[:10]
        self.api = self.prefix + "-api"
        self.db = self.prefix + "-db"
        self.histogram = Counter()
        self.latencies = defaultdict(list)
        self.failures = []
        self.samples = []
        self.tokens = {}
        self.revision = 200000
        self.stop = False
        self.burst_results = []
        self.client = None

    async def docker(self, *args):
        return await asyncio.to_thread(command, "docker", *args)

    async def setup(self):
        await self.docker("network", "create", self.prefix)
        await self.docker(
            "run",
            "-d",
            "--name",
            self.db,
            "--network",
            self.prefix,
            "--memory",
            "512m",
            "--cpus",
            "1",
            "-e",
            "POSTGRES_DB=loadtest",
            "-e",
            "POSTGRES_USER=loadtest",
            "-e",
            "POSTGRES_PASSWORD=isolated-load-only",
            "postgres:16-alpine",
        )
        for _ in range(60):
            try:
                await self.docker("exec", self.db, "pg_isready", "-U", "loadtest", "-d", "loadtest")
                break
            except subprocess.CalledProcessError:
                await asyncio.sleep(1)
        await self.docker(
            "run",
            "-d",
            "--name",
            self.api,
            "--network",
            self.prefix,
            "--memory",
            "512m",
            "--cpus",
            "1",
            "-p",
            "127.0.0.1::8000",
            "-e",
            f"WIKIWATCH_DATABASE_URL=postgresql+asyncpg://loadtest:isolated-load-only@{self.db}:5432/loadtest",
            "-e",
            "WIKIWATCH_SEED_ON_DEPLOY=false",
            "wikiwatch-service-api:latest",
        )
        port = json.loads(await self.docker("inspect", self.api))[0]["NetworkSettings"]["Ports"][
            "8000/tcp"
        ][0]["HostPort"]
        self.origin = "http://127.0.0.1:" + port
        self.client = httpx.AsyncClient(
            base_url=self.origin,
            timeout=25,
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=80),
        )
        for _ in range(60):
            try:
                response = await self.client.get(P + "/health")
                if response.status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            await asyncio.sleep(1)
        else:
            raise RuntimeError("Isolated API did not become healthy")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "seed_load.py"
            path.write_text(SEED)
            await self.docker("cp", str(path), self.api + ":/tmp/seed_load.py")
            await self.docker(
                "exec", "-e", "PYTHONPATH=/app", self.api, "python", "/tmp/seed_load.py"
            )
        for name in ["reviewer1", "reviewer2", "lead", "admin"]:
            response = await self.client.post(
                P + "/auth/login", json={"email": name + "@example.org", "password": PASSWORD}
            )
            response.raise_for_status()
            self.tokens[name] = response.json()["data"]["access_token"]
        self.before = await self.database()
        print(
            "Setup complete: isolated PostgreSQL, 9,000 edits, 90,000 audit/events, 2,000 maximum-length Unicode comments.",
            flush=True,
        )

    async def request(
        self,
        path,
        role="reviewer1",
        method="GET",
        body=None,
        label=None,
        expected=(200, 201, 409, 429, 503),
    ):
        begin = time.perf_counter()
        status = 0
        try:
            response = await self.client.request(
                method,
                P + path,
                headers={"Authorization": "Bearer " + self.tokens[role]},
                json=body,
            )
            status = response.status_code
            if status not in expected and len(self.failures) < 25:
                self.failures.append(
                    {"path": path.split("?")[0], "status": status, "body": response.text[:160]}
                )
            if status in (200, 201) and "application/json" in response.headers.get(
                "content-type", ""
            ):
                data = response.json().get("data")
            else:
                data = None
            return status, data
        except httpx.HTTPError as error:
            if len(self.failures) < 25:
                self.failures.append(
                    {"path": path.split("?")[0], "status": 0, "error": type(error).__name__}
                )
            return 0, None
        finally:
            category = label or path.split("?")[0]
            self.histogram[str(status)] += 1
            self.latencies[category].append((time.perf_counter() - begin, status))

    def edit_input(self):
        self.revision += 1
        return {
            "wiki": "enwiki",
            "title": "Load admitted " + str(self.revision),
            "editor": "Load editor",
            "old_rev": 0,
            "new_rev": self.revision,
            "page_id": self.revision,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "comment": "Load-only metadata",
        }

    async def claims(self):
        outcomes = []
        for i in range(20, 40):
            body = {"operation": "claim", "version": 1}
            pair = await asyncio.gather(
                *(
                    self.request(f"/edits/{key(i)}/transition", role, "POST", body, "claim_race")
                    for role in ["reviewer1", "reviewer2"]
                )
            )
            outcomes.append(sorted(status for status, _ in pair))
        if any(pair != [200, 409] for pair in outcomes):
            raise RuntimeError("A claim race did not produce exactly one winner")
        return {"races": len(outcomes), "exactly_one_winner": True}

    async def operation(self, rng):
        choice = rng.randrange(100)
        if choice < 18:
            await self.request(
                f"/edits?offset={rng.randrange(0, 80) * 100}&limit=100", label="queue_page"
            )
        elif choice < 30:
            await self.request(
                "/edits?owner_id=" + key("reviewer1") + "&limit=100", label="my_claims"
            )
        elif choice < 45:
            await self.request("/events?after=90000&limit=100", label="events")
        elif choice < 50:
            await self.request("/auth/me", label="identity")
        elif choice < 55:
            await self.request("/health", label="health")
        elif choice < 65:
            await self.request("/board", "lead", label="board")
        elif choice < 75:
            await self.request("/workload", "lead", label="workload")
        elif choice < 85:
            await self.request("/activity?minutes=60", "admin", label="activity")
        elif choice < 90:
            await self.request(
                f"/edits/{key(rng.randrange(5))}/threads?limit=5", label="large_discussions"
            )
        elif choice < 95:
            await self.request(
                "/edits/admit", method="POST", body={"edits": [self.edit_input()]}, label="admit"
            )
        else:
            role = rng.choice(["reviewer1", "reviewer2"])
            path = f"/edits/{key(rng.randrange(200, 250))}"
            status, edit = await self.request(path, role, label="review_read")
            if status != 200:
                return
            op = (
                "claim"
                if edit["status"] == "unclaimed"
                else "release"
                if edit["owner_id"] == key(role)
                else None
            )
            if op:
                await self.request(
                    path + "/transition",
                    role,
                    "POST",
                    {"version": edit["version"], "operation": op},
                    "review_write",
                )

    async def worker(self, number, deadline):
        rng = random.Random(1729 + number)
        while time.monotonic() < deadline:
            begin = time.monotonic()
            await self.operation(rng)
            await asyncio.sleep(max(0, 0.5 - (time.monotonic() - begin)))

    async def bursts(self, begin, deadline):
        for minute in [2, 4, 6, 8]:
            target = begin + self.args.seconds * minute / 10
            await asyncio.sleep(max(0, target - time.monotonic()))
            snapshot = self.histogram.copy()
            end = min(deadline, time.monotonic() + 10)

            async def surge(number):
                while time.monotonic() < end:
                    started = time.monotonic()
                    await self.request(
                        "/edits?limit=100" if number % 2 else "/board", "lead", label="burst_read"
                    )
                    await asyncio.sleep(max(0, 1 - (time.monotonic() - started)))

            await asyncio.gather(*(surge(i) for i in range(64)))
            status, _ = await self.request("/health", label="recovery_health", expected=(200,))
            self.burst_results.append(
                {
                    "elapsed_seconds": round(time.monotonic() - begin),
                    "statuses": dict(self.histogram - snapshot),
                    "health_recovered": status == 200,
                }
            )
            print("Burst complete; recovery health HTTP " + str(status), flush=True)
        await asyncio.sleep(max(0, begin + self.args.seconds * 0.9 - time.monotonic()))

        # Exercise bounded expensive password verification while reads continue.
        async def invalid_login():
            started = time.perf_counter()
            response = await self.client.post(
                P + "/auth/login",
                json={"email": "reviewer1@example.org", "password": "incorrect-load-password"},
            )
            self.histogram[str(response.status_code)] += 1
            self.latencies["auth_burst"].append(
                (time.perf_counter() - started, response.status_code)
            )
            if response.status_code not in (401, 429, 503):
                self.failures.append({"path": "/auth/login", "status": response.status_code})

        await asyncio.gather(*(invalid_login() for _ in range(40)))
        self.burst_results.append({"kind": "password_verification", "requests": 40})

    async def sample(self, begin):
        while not self.stop:
            records = []
            for container in [self.api, self.db]:
                # Cgroup values include allocations, cache and observed peak; no RSS guesses.
                value = await self.docker(
                    "exec",
                    container,
                    "sh",
                    "-c",
                    "cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.events",
                )
                parts = value.splitlines()
                records.append(
                    {
                        "container": "api" if container == self.api else "database",
                        "bytes": int(parts[0]),
                        "peak_bytes": int(parts[1]),
                        "memory_events": dict(line.split() for line in parts[2:]),
                    }
                )
            self.samples.append(
                {"elapsed_seconds": round(time.monotonic() - begin, 2), "metrics": records}
            )
            if len(self.samples) % 6 == 0:
                print(
                    json.dumps(
                        {
                            "elapsed_seconds": round(time.monotonic() - begin),
                            "requests": sum(self.histogram.values()),
                            "statuses": dict(self.histogram),
                            "memory_mib": {
                                r["container"]: round(r["bytes"] / 1048576, 1) for r in records
                            },
                        }
                    ),
                    flush=True,
                )
            await asyncio.sleep(5)

    async def database(self):
        sql = """SELECT json_build_object('bytes',pg_database_size(current_database()),
        'edits',(SELECT count(*) FROM edits),'active_edits',(SELECT count(*) FROM edits WHERE NOT archived),
        'audit',(SELECT count(*) FROM audit),'events',(SELECT count(*) FROM events),
        'sessions',(SELECT count(*) FROM sessions),'comments',(SELECT count(*) FROM comments),
        'threads',(SELECT count(*) FROM threads),
        'duplicate_revisions',(SELECT count(*) FROM (SELECT wiki,new_rev FROM edits GROUP BY wiki,new_rev HAVING count(*)>1) x),
        'invalid_ownership',(SELECT count(*) FROM edits e LEFT JOIN members m ON m.id=e.owner_id WHERE
        (e.status='unclaimed' AND e.owner_id IS NOT NULL) OR (e.status!='unclaimed' AND (m.id IS NULL OR m.role!='reviewer' OR NOT m.active))),
        'thread_overflow',(SELECT count(*) FROM (SELECT edit_id FROM threads GROUP BY edit_id HAVING count(*)>20) x),
        'comment_overflow',(SELECT count(*) FROM (SELECT thread_id FROM comments GROUP BY thread_id HAVING count(*)>20) x))"""
        return json.loads(
            await self.docker(
                "exec", self.db, "psql", "-U", "loadtest", "-d", "loadtest", "-At", "-c", sql
            )
        )

    async def capacity(self):
        snapshot = await self.database()
        remaining = 10000 - snapshot["active_edits"]
        while remaining > 16:
            count = min(100, remaining - 16)
            status, _ = await self.request(
                "/edits/admit",
                method="POST",
                body={"edits": [self.edit_input() for _ in range(count)]},
                label="capacity_fill",
                expected=(200,),
            )
            if status != 200:
                raise RuntimeError("Could not prepare last-slot capacity check")
            remaining -= count
        candidates = remaining + 16
        result = await asyncio.gather(
            *(
                self.request(
                    "/edits/admit",
                    method="POST",
                    body={"edits": [self.edit_input()]},
                    label="capacity_race",
                )
                for _ in range(candidates)
            )
        )
        retried = []
        for status, data in result:
            if status == 503:
                await asyncio.sleep(0.2)
                status, data = await self.request(
                    "/edits/admit",
                    method="POST",
                    body={"edits": [self.edit_input()]},
                    label="capacity_retry",
                    expected=(200, 409),
                )
            retried.append((status, data))
        result = retried
        final = await self.database()
        if final["active_edits"] != 10000:
            raise RuntimeError("Queue did not stop at its exact configured capacity")
        return {
            "competing_requests": candidates,
            "statuses": dict(Counter(str(s) for s, _ in result)),
            "active_edits": final["active_edits"],
        }

    @staticmethod
    def percentile(values, percent):
        if not values:
            return None
        return round(sorted(values)[max(0, math.ceil(len(values) * percent) - 1)] * 1000, 2)

    async def run(self):
        try:
            await self.setup()
            race = await self.claims()
            self.started_utc = datetime.now(timezone.utc).isoformat()
            begin = time.monotonic()
            sampler = asyncio.create_task(self.sample(begin))
            await asyncio.gather(
                *(self.worker(i, begin + self.args.seconds) for i in range(12)),
                self.bursts(begin, begin + self.args.seconds),
            )
            self.stop = True
            await sampler
            elapsed = time.monotonic() - begin
            soak_after = await self.database()
            capacity = await self.capacity()
            after = await self.database()
            containers = json.loads(await self.docker("inspect", self.api, self.db))
            status, _ = await self.request("/health", label="final_health", expected=(200,))
            memory = {}
            for name in ["api", "database"]:
                series = [
                    (s["elapsed_seconds"], r["bytes"])
                    for s in self.samples
                    for r in s["metrics"]
                    if r["container"] == name
                ]
                first = [value for stamp, value in series if stamp <= 60]
                last = [value for stamp, value in series if stamp >= self.args.seconds - 60]
                peak = max(
                    r["peak_bytes"]
                    for s in self.samples
                    for r in s["metrics"]
                    if r["container"] == name
                )
                memory[name] = {
                    "observed_peak_mib": round(peak / 1048576, 2),
                    "first_minute_median_mib": round(statistics.median(first) / 1048576, 2),
                    "last_minute_median_mib": round(statistics.median(last) / 1048576, 2),
                    "median_growth_mib": round(
                        (statistics.median(last) - statistics.median(first)) / 1048576, 2
                    ),
                }
            latency = {}
            for label, samples in self.latencies.items():
                successful = [value for value, status in samples if status in (200, 201)]
                latency[label] = {
                    "requests": len(samples),
                    "statuses": dict(Counter(str(s) for _, s in samples)),
                    "successful_p50_ms": self.percentile(successful, 0.5),
                    "successful_p95_ms": self.percentile(successful, 0.95),
                    "successful_p99_ms": self.percentile(successful, 0.99),
                    "maximum_ms": round(max(value for value, _ in samples) * 1000, 2),
                }
            invariants = all(
                after[name] == 0
                for name in [
                    "duplicate_revisions",
                    "invalid_ownership",
                    "thread_overflow",
                    "comment_overflow",
                ]
            )
            bounded = (
                after["active_edits"] <= 10000
                and after["edits"] <= 20000
                and after["audit"] <= 100000
                and after["events"] <= 100000
            )
            oom = any(c["State"]["OOMKilled"] or c["RestartCount"] for c in containers) or any(
                int(r["memory_events"].get("oom_kill", 0))
                for s in self.samples
                for r in s["metrics"]
            )
            checks = {
                "no_unexpected_http_errors": not self.failures,
                "database_invariants": invariants,
                "storage_caps": bounded,
                "audit_and_events_atomic": after["audit"] == after["events"],
                "no_oom_or_restarts": not oom,
                "api_peak_below_400_mib": memory["api"]["observed_peak_mib"] < 400,
                "api_median_growth_below_32_mib": memory["api"]["median_growth_mib"] < 32,
                "healthy_after_bursts": all(
                    x.get("health_recovered", True) for x in self.burst_results
                ),
                "healthy_at_end": status == 200,
            }
            report = {
                "started_utc": self.started_utc,
                "duration_seconds": round(elapsed, 2),
                "configuration": {
                    "steady_clients": 12,
                    "target_operations_per_second": 24,
                    "burst_clients": 64,
                    "burst_seconds": 10,
                    "api_cpus": 1,
                    "api_memory_mib": 512,
                    "database_cpus": 1,
                    "database_memory_mib": 512,
                    "api_image_id": containers[0]["Image"],
                    "database_image_id": containers[1]["Image"],
                },
                "statuses": dict(self.histogram),
                "requests": sum(self.histogram.values()),
                "latencies": latency,
                "memory": memory,
                "database_before": self.before,
                "database_after_soak": soak_after,
                "database_after_capacity_probe": after,
                "claim_races": race,
                "capacity_race": capacity,
                "bursts": self.burst_results,
                "checks": checks,
                "unexpected_errors": self.failures,
                "memory_samples": self.samples,
            }
            self.args.output.parent.mkdir(parents=True, exist_ok=True)
            self.args.output.write_text(json.dumps(report, indent=2) + "\n")
            print(
                json.dumps(
                    {
                        "report": str(self.args.output),
                        "checks": checks,
                        "memory": memory,
                        "requests": report["requests"],
                    }
                ),
                flush=True,
            )
            return 0 if all(checks.values()) else 1
        finally:
            if self.client:
                await self.client.aclose()
            for name in [self.api, self.db]:
                try:
                    await self.docker("rm", "-f", name)
                except subprocess.CalledProcessError:
                    pass
            try:
                await self.docker("network", "rm", self.prefix)
            except subprocess.CalledProcessError:
                pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seconds", type=int, default=600)
    parser.add_argument("--output", type=Path, default=ROOT / "docs" / "load-test-results.json")
    args = parser.parse_args()
    if args.seconds < 120:
        parser.error("Use at least 120 seconds; a sustained validation run should use 600 or more")
    raise SystemExit(asyncio.run(Run(args).run()))


if __name__ == "__main__":
    main()
