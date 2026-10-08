"""Isolated worst-case CSV export probe; never connects to the team database.
Run .venv/bin/python scripts/export_load.py --concurrency 2 --output ../../docs/export-load-test-results.json
"""

import argparse
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import sustained_load as load

# Maximum legal Unicode flag reasons, on all 10,000 exportable records.
load.SEED = load.SEED.replace(
    "detail={},created_at=stamp",
    'detail={"reason":"測🙂"*2500} if i<10000 else {},created_at=stamp',
)


async def main(args):
    run = load.Run(SimpleNamespace(seconds=120, output=Path("/tmp/export-probe-unused.json")))
    samples = []
    stop = False

    async def sample():
        while not stop:
            try:
                raw = await run.docker(
                    "exec",
                    run.api,
                    "sh",
                    "-c",
                    "cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.events",
                )
                lines = raw.splitlines()
                samples.append(
                    {
                        "current_mib": int(lines[0]) / 1048576,
                        "peak_mib": int(lines[1]) / 1048576,
                        "events": dict(line.split() for line in lines[2:]),
                    }
                )
            except Exception:
                pass
            await asyncio.sleep(0.3)

    async def download():
        size = 0
        try:
            async with run.client.stream(
                "GET",
                load.P + "/audit/export?limit=10000",
                headers={"Authorization": "Bearer " + run.tokens["admin"]},
                timeout=60,
            ) as response:
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                return {"status": response.status_code, "bytes": size}
        except Exception as error:
            return {"status": 0, "bytes": size, "error": type(error).__name__}

    task = None
    try:
        await run.setup()
        task = asyncio.create_task(sample())
        results = await asyncio.gather(*(download() for _ in range(args.concurrency)))
        stop = True
        await task
        state = json.loads(await run.docker("inspect", run.api))[0]["State"]
        health = await run.request("/health", expected=(200,))
        report = {
            "concurrency": args.concurrency,
            "endpoint": "/audit/export?limit=10000",
            "audit_rows_with_maximum_unicode_reasons": 10000,
            "api_memory_limit_mib": 512,
            "downloads": results,
            "peak_api_mib": max((s["peak_mib"] for s in samples), default=None),
            "oom_killed": state["OOMKilled"],
            "container_running": state["Running"],
            "healthy_after": health[0] == 200,
            "samples": samples,
        }
        report["passed"] = (
            all(r["status"] == 200 and r["bytes"] > 100000000 for r in results)
            and not state["OOMKilled"]
            and report["healthy_after"]
        )
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({k: v for k, v in report.items() if k != "samples"}), flush=True)
        return report["passed"]
    finally:
        stop = True
        if task:
            await task
        if run.client:
            await run.client.aclose()
        for name in [run.api, run.db]:
            try:
                await run.docker("rm", "-f", name)
            except Exception:
                pass
        try:
            await run.docker("network", "rm", run.prefix)
        except Exception:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, choices=range(1, 5), default=2)
    parser.add_argument(
        "--output", type=Path, default=Path("../../docs/export-load-test-results.json")
    )
    raise SystemExit(0 if asyncio.run(main(parser.parse_args())) else 1)
