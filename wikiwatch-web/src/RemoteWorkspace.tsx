import ThemeToggle from "./ThemeToggle";
import {mergeFeedRows} from "./feedState";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  API_HOST,
  ApiError,
  backend,
  backendRole,
  editFromAPI,
  memberFromAPI,
  serverStore,
} from "./backend";
import {
  Board,
  Feed,
  MyClaims,
  Workload,
  EditActivity,
  Members,
  AuditLog,
} from "./App";
import Login from "./Login";
import InstallApp from "./InstallApp";
import ReviewPage from "./ReviewPage";
import { LoginSkeleton } from "./components/ui/loader";
import { openReviewImmediately, mergeAdmittedEdits, MAX_REVIEW_BATCH } from "./reviewOpening";
import { LiveData } from "./LiveData";
import { guardedRoute, roleTabs } from "./auth";
import { reviewHash, workspaceHash } from "./routes";
import {
  observe,
  type Action,
  type Edit,
  type Member,
  type Store,
} from "./model";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { Flag, Menu, LogOut, WifiOff } from "lucide-react";
const labels = { patroller: "Reviewer", lead: "Team lead", admin: "Admin" };
const empty = (me: Member): Store => ({
  edits: [],
  claims: [],
  members: [me],
  audit: [],
  observations: [],
  arrivals: 0,
});
const cacheKey = (me: Member) => `wikiwatch-server-cache:${API_HOST}:${me.id}`;
function cached(me: Member) {
  try {
    const store = JSON.parse(localStorage.getItem(cacheKey(me)) || "null");
    if (store && Array.isArray(store.edits) && Array.isArray(store.members))
      return store as Store;
  } catch {}
  return empty(me);
}
export default function RemoteApp() {
  const [account, setAccount] = useState<Member | null>(null),
    [checking, setChecking] = useState(!!backend.tokens),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    if (!backend.tokens) return;
    backend
      .me()
      .then((me) => {
        if (active) setAccount(me);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          backend.save(null);
          setMessage("Your session expired. Sign in again.");
        } else if (backend.tokens?.member) {
          setAccount(memberFromAPI(backend.tokens.member));
          setMessage(
            "API unavailable. Showing saved data until the connection returns.",
          );
        } else setMessage(error.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  function logout(reason = "") {
    void backend.logout().catch(() => {});
    setAccount(null);
    setMessage(reason);
    location.hash = "#/login";
  }
  if (checking) return <LoginSkeleton />;
  return account ? (
    <RemoteWorkspace key={account.id} account={account} updateAccount={setAccount} logout={logout} />
  ) : (
    <Login
      members={[]}
      message={message}
      remoteLogin={async (email, password) => {
        const me = await backend.login(email, password);
        setMessage("");
        setAccount(me);
      }}
      onLogin={() => {}}
    />
  );
}
export function RemoteWorkspace({
  account,
  logout,
  updateAccount,
}: {
  account: Member;
  updateAccount: (member: Member) => void;
  logout: (reason?: string) => void;
}) {
  const [store, setStore] = useState<Store>(() => cached(account)),
    [queue, setQueue] = useState<Store>(() => cached(account)),
    [activity, setActivity] = useState<any>(null),
    [route, setRoute] = useState(() => guardedRoute(account).route),
    [batch, setBatch] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [apiState, setApiState] = useState("Connecting"),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [devOpen, setDevOpen] = useState(false),
    [navOpen, setNavOpen] = useState(false),
    [streamState, setStreamState] = useState("Connecting"),
    [preferences, setPreferences] = useState<any>(null),
    [activityMinutes, setActivityMinutes] = useState(60);
  const apiStatus = useRef(apiState);
  apiStatus.current = apiState;
  const current = useRef(store);
  current.current = store;
  const pending = useRef(false),
    cursor = useRef(0),
    syncing = useRef<Promise<void> | null>(null),
    inspected = useRef(new Set<string>()),
    admitBuffer = useRef(new Map<string, Edit>());
  const observed = useRef(new Set<string>());
  const admitting = useRef(false);
  const admissionVersion = useRef(0);
  const lastSync = useRef(0);
  const connectionNotice = useRef("");
  const activeReviewIds = useRef(new Set<string>());
  activeReviewIds.current = new Set(route.reviewId ? [route.reviewId, ...batch] : []);
  useEffect(() => {
    const update = (e: Event) => setPreferences((e as CustomEvent).detail);
    window.addEventListener("wikiwatch-preferences-changed", update);
    return () =>
      window.removeEventListener("wikiwatch-preferences-changed", update);
  }, []);
  const refreshKey = useRef("");
  const requestedMinutes = useRef(activityMinutes);
  requestedMinutes.current = activityMinutes;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    while (syncing.current) {
      if (refreshKey.current === String(activityMinutes)) return syncing.current;
      await syncing.current.catch(() => {});
    }
    if (!mounted.current) return;
    refreshKey.current = String(activityMinutes);
    const run = (async () => {
      const snapshotVersion = admissionVersion.current;
      const me = await backend.me();
      if (!mounted.current || me.id !== account.id || (backend.tokens && backend.tokens.member.id !== account.id)) return;
      if (!me.active || me.role !== account.role) {
        logout("Your workspace access changed. Sign in again.");
        return;
      }
      updateAccount(me);
      const [rows, members, audit, metrics, prefs] =
        await Promise.all([
          backend.all("/edits"),
          backend.all(
            account.role === "patroller" ? "/members/directory" : "/members",
          ),
          account.role === "admin"
            ? backend.all("/audit?newest=true", 1000)
            : Promise.resolve([]),
          account.role === "admin"
            ? backend.request(`/activity?minutes=${activityMinutes}`)
            : Promise.resolve(null),
          backend.request("/preferences/me"),
        ]);
      // An older refresh must not overwrite an edit just saved in the background.
      if (!mounted.current || requestedMinutes.current !== activityMinutes || snapshotVersion !== admissionVersion.current) return;
      if (!members.some((m) => m.id === me.id)) members.push({...me, role: backendRole(me.role)});
      else
        members[members.findIndex((m) => m.id === me.id)] = {
          ...members.find((m) => m.id === me.id),
          ...me,
          role: backendRole(me.role),
        };
      const shared = serverStore(rows, members, audit);
      // Counts and workload derive from this same edit snapshot, avoiding
      // conflicting totals from independently timed API reads.
      setPreferences(prefs);
      setQueue(shared);
      setActivity(
        metrics ? { ...metrics, windowMinutes: activityMinutes } : null,
      );
      setStore((previous) => {
        const saved = new Map(previous.edits.map((e) => [e.id, e]));
        return {
          ...previous,
          ...shared,
          edits: [
            ...shared.edits.map((e) => {
              const old = saved.get(e.id);
              return old?.contentStatus === "ready"
                ? {
                    ...old,
                    ...e,
                    before: old.before,
                    after: old.after,
                    contentStatus: "ready" as const,
                  }
                : e;
            }),
            ...previous.edits
              .filter(
                (e) => !e.backendId && !shared.edits.some((s) => s.id === e.id),
              )
              .filter((e, i) => i < 200 || activeReviewIds.current.has(e.id)),
          ],
          observations: previous.observations,
          arrivals: previous.arrivals,
        };
      });
      const recoveredNotice = connectionNotice.current;
      setNotice(previous => previous === recoveredNotice ? "" : previous);
      connectionNotice.current = "";
      lastSync.current = Date.now();
      setApiState("Connected");
      window.dispatchEvent(new Event("wikiwatch-team-update"));
    })();
    syncing.current = run;
    try {
      await run;
    } catch (error) {
      setApiState("Unavailable");
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        (!backend.tokens || backend.tokens.member.id === account.id)
      )
        logout("Your session expired. Sign in again.");
      throw error;
    } finally {
      if (syncing.current === run) syncing.current = null;
    }
  }, [account.id, account.role, activityMinutes]);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    let delay = 5000,
      polling = false;
    const poll = async () => {
      if (stopped || polling) return;
      if (document.hidden || !navigator.onLine) {
        timer = setTimeout(poll, 5000);
        return;
      }
      polling = true;
      try {
        let changed = false;
        do {
          const page = await backend.request(`/events?after=${cursor.current}`);
          changed ||= page.items.length > 0;
          cursor.current = page.next_cursor;
          if (!page.has_more) break;
        } while (!stopped);
        if (changed || apiStatus.current !== "Connected" || Date.now() - lastSync.current >= 30000) await refresh();
        delay = 5000;
      } catch (error) {
        setApiState("Unavailable");
        if (
          !stopped &&
          error instanceof ApiError &&
          error.status === 401 &&
          (!backend.tokens || backend.tokens.member.id === account.id)
        )
          logout("Your session expired. Sign in again.");
        delay = Math.min(60000, delay * 2);
      } finally {
        polling = false;
        if (!stopped) timer = setTimeout(poll, delay);
      }
    };
    void (async () => {
      const head = await backend.request("/events?latest=true");
      if (stopped) return;
      cursor.current = head.next_cursor;
      await refresh();
    })().catch((error) => { if (!stopped) { connectionNotice.current = error.message; setNotice(error.message); } });
    timer = setTimeout(poll, 5000);
    const wake = () => {
      clearTimeout(timer);
      void poll();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh]);
  useEffect(() => {
    const change = () => {
      const checked = guardedRoute(account);
      if (location.hash !== checked.hash)
        history.replaceState(null, "", checked.hash);
      setRoute(checked.route);
      setBatch(
        new URLSearchParams(checked.hash.split("?")[1] || "")
          .get("batch")
          ?.split(",")
          .filter(Boolean).slice(0, MAX_REVIEW_BATCH) || [],
      );
      if (checked.denied) setNotice("This page is not available to your role.");
    };
    change();
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [account.id, account.role]);
  useEffect(() => {
    const change = () => setOffline(!navigator.onLine);
    window.addEventListener("offline", change);
    window.addEventListener("online", change);
    return () => {
      window.removeEventListener("offline", change);
      window.removeEventListener("online", change);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
    try {
      const retained = store.edits.filter(e => e.backendId).slice(0, 500);
      const ids = new Set(retained.map(e => e.id));
      localStorage.setItem(cacheKey(account), JSON.stringify({
        ...empty(account), members: store.members,
        edits: retained.map(e => ({...e, before: "", after: "", contentStatus: "unloaded"})),
        claims: store.claims.filter(c => ids.has(c.editId)),
      }));
    } catch {}
    }, 2000);
    return () => clearTimeout(timer);
  }, [store, account.id]);
  useEffect(() => {
    if (account.role !== "lead") return;
    const timer = setInterval(() => {
      if (
        document.hidden ||
        offline ||
        pending.current ||
        admitting.current ||
        !admitBuffer.current.size
      )
        return;
      const edits = [...admitBuffer.current.values()].slice(0, 10);
      admitting.current = true;
      void backend
        .admit(edits)
        .then((rows) => {
          edits.forEach(e => admitBuffer.current.delete(e.id));
          admissionVersion.current++;
          setStore(previous => mergeAdmittedEdits(previous, rows));
          setQueue(previous => mergeAdmittedEdits(previous, rows));
        })
        .catch((error) => {
          if (error instanceof ApiError && error.status === 409) admitBuffer.current.clear();
          setNotice(`Queue admission: ${error.message}`);
        })
        .finally(() => { admitting.current = false; });
    }, 30000);
    return () => clearInterval(timer);
  }, [account.role, offline, refresh]);
  function navigate(tab: string) {
    location.hash = workspaceHash(account.role, tab, account.id);
    setNavOpen(false);
  }
  async function openReview(edit: Edit, ids: string[] = [edit.id]) {
    if (ids.length > MAX_REVIEW_BATCH) { setNotice("Choose at most 20 edits for one review batch."); return; }
    if (pending.current) return;
    if (offline || apiState !== "Connected") {
      if (edit.backendId) {
        location.hash = reviewHash(
          edit.wiki,
          edit.id,
          account.role,
          account.id,
          route.tab,
        );
        return;
      }
      setNotice("Reconnect before opening a new edit in the shared queue.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const selected = ids
        .map(
          (id) =>
            current.current.edits.find((e) => e.id === id) ||
            (id === edit.id ? edit : undefined),
        )
        .filter(Boolean) as Edit[];
      setNotice("");
      await openReviewImmediately(
        selected,
        () => {
          location.hash =
            reviewHash(edit.wiki, edit.id, account.role, account.id, route.tab) +
            (ids.length > 1 ? "&batch=" + encodeURIComponent(ids.join(",")) : "");
        },
        (edits) => backend.admit(edits),
        (rows) => {
          admissionVersion.current++;
          setStore((previous) => mergeAdmittedEdits(previous, rows));
          setQueue((previous) => mergeAdmittedEdits(previous, rows));
        },
      );
    } catch (error) {
      setNotice("Could not save this edit to the team queue: " + (error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function act(action: Action) {
    if (pending.current || offline || apiState !== "Connected") {
      setNotice("Reconnect before changing team records.");
      return false;
    }
    if ("actor" in action && action.actor !== account.id) return false;
    if (action.type === "verify" && !inspected.current.has(action.editId)) {
      setNotice(
        "Open the diff and inspect its source before verifying the flag.",
      );
      return false;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (action.type === "addMember")
        await backend.request("/members", {
          method: "POST",
          body: {
            name: action.member.name,
            email: action.member.email,
            role: backendRole(action.member.role),
            password: action.password,
          },
        });
      else if (action.type === "member")
        await backend.request(`/members/${action.id}`, {
          method: "PATCH",
          body: {
            ...(action.role ? { role: backendRole(action.role) } : {}),
            ...(action.active !== undefined ? { active: action.active } : {}),
          },
        });
      else if (action.type !== "event") {
        const edit = current.current.edits.find((e) => e.id === action.editId);
        if (!edit) throw Error("Edit is unavailable. Reload the queue.");
        const row = await backend.transition(edit, action);
        admissionVersion.current++;
        setStore(previous => mergeAdmittedEdits(previous, [row]));
        setQueue(previous => mergeAdmittedEdits(previous, [row]));
      }
      setNotice("Changes saved to the team database.");
      await refresh().catch((error) =>
        setNotice(
          "Saved to the database, but the view could not refresh: " +
            error.message,
        ),
      );
      return true;
    } catch (error) {
      setNotice((error as Error).message);
      if (error instanceof ApiError && error.status === 409)
        await refresh().catch(() => {});
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function ingest(edits: Edit[], count: boolean) {
    if (account.role === "lead")
      for (const e of edits.filter((e) => e.wiki === "en" && !e.bot)) {
        admitBuffer.current.set(e.id, e);
        if (admitBuffer.current.size > 100)
          admitBuffer.current.delete(admitBuffer.current.keys().next().value!);
      }
    setStore((s) => {
      const old = new Map(s.edits.map((e) => [e.id, e]));
      const incoming = edits.map((e) =>
        old.get(e.id)?.backendId ? { ...e, ...old.get(e.id) } : e,
      );
      const fresh = count
        ? incoming.filter((e) => {
            if (observed.current.has(e.id)) return false;
            observed.current.add(e.id);
            return true;
          })
        : [];
      if (observed.current.size > 100000)
        observed.current = new Set([...observed.current].slice(-50000));
      return {
        ...s,
        edits: mergeFeedRows(s.edits, incoming, activeReviewIds.current),
        observations: count ? observe(s.observations, fresh) : s.observations,
        arrivals: (s.arrivals || 0) + (count ? fresh.length : 0),
      };
    });
  }
  const review = store.edits.find((e) => e.id === route.reviewId),
    blocked = offline || busy || apiState !== "Connected";
  const activityStore: Store = {
    ...queue,
    observations: (activity?.points || []).map((p: any) => ({
      key: p.minute + p.wiki,
      wiki: p.wiki.replace(/wiki$/, ""),
      title: "Admitted edits",
      time: Date.parse(p.minute),
      count: p.edits,
    })),
    observationStart: Date.now() - 3600000,
  };
  const nav = (
    <nav aria-label="Workspace sections" className="grid gap-1">
      {roleTabs[account.role].map((tab) => (
        <Button
          key={tab}
          variant={tab === route.tab ? "secondary" : "ghost"}
          className="justify-start"
          aria-current={tab === route.tab ? "page" : undefined}
          onClick={() => navigate(tab)}
        >
          {tab}
          {tab === "My Claims" && <span className="ml-auto min-w-6 text-right tabular-nums" aria-label="My claim count">{apiState === "Connecting" ? "—" : queue.claims.filter(c => c.owner === account.id).length}</span>}
        </Button>
      ))}
    </nav>
  );
  return (
    <div className="app-shell">
      <header className="border-b bg-card">
        <div className="px-3 lg:px-7 py-3 flex items-center gap-2">
          <button
            onClick={() => navigate(roleTabs[account.role][0])}
            className="flex items-center gap-2 font-semibold text-lg mr-auto"
          >
            <Flag className="h-5 w-5 text-primary" />
            WikiWatch
          </button>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {labels[account.role]}
          </span>
          <ThemeToggle />
          <InstallApp className="hidden lg:inline-flex" />
          <Button
            className="lg:hidden"
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logout()}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <div className="app-body flex lg:flex-row">
        <aside className="workspace-nav hidden lg:flex flex-col w-56 shrink-0 border-r bg-card p-4 gap-5">
          <div>
            <p className="font-medium text-sm">{account.name}</p>
            <p className="text-xs text-muted-foreground">
              {labels[account.role]}
            </p>
          </div>
          {nav}
          <div className="mt-auto text-xs text-muted-foreground">
            Team API: {apiState}
          </div>
          <Button variant="ghost" onClick={() => setDevOpen(true)}>
            Dev mode
          </Button>
        </aside>
        <main className="workspace-main flex-1 min-w-0 p-3 md:p-5 max-w-[1600px] mx-auto w-full">
          {!route.reviewId && (
            <div className="workspace-heading flex justify-between mb-3 gap-3">
              <div>
                <h1 className="text-xl md:text-2xl font-semibold">
                  {route.tab}
                </h1>
                <p className="text-xs text-muted-foreground mt-2">
                  {route.tab === "Live feed"
                    ? "Public Wikipedia stream"
                    : route.tab === "Edit Activity"
                      ? "Wikipedia edits admitted to the shared team queue"
                      : "Shared team database"}
                </p>
              </div>
              <div className="flex gap-2">
                <span className="text-xs text-muted-foreground">
                  {apiState}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setDevOpen(true)}
                >
                  Dev mode
                </Button>
              </div>
            </div>
          )}
          {(offline || apiState === "Unavailable") && (
            <p role="status" className="border rounded-lg p-3 text-sm mb-3">
              <WifiOff className="h-4 w-4 inline mr-2" />
              Saved data is available. Reconnect before changing team records.
            </p>
          )}
          <LiveData
            shared
            enabled={account.role !== "admin"}
            offline={offline}
            open={devOpen}
            onOpenChange={setDevOpen}
            onStatusChange={setStreamState}
            ingest={ingest}
            sourceControls={
              <div className="text-xs space-y-2">
                <p>API host: {API_HOST}</p>
                <p>
                  Team API: {apiState} · Stream: {streamState}
                </p>
                <a
                  className="underline"
                  href={API_HOST + "/wikiwatch-service/v1/swagger"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Swagger
                </a>
                <p>
                  Lead's visible tab admits up to 10 non-bot English article
                  edits every 30 seconds. Opening another edit also admits it.
                  The board shows database edits only.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void refresh().catch((e) => setNotice(e.message))
                  }
                >
                  Refresh team data
                </Button>
              </div>
            }
          />
          {route.reviewId && review && !review.backendId && !busy && (
            <div role="status" className="border rounded-lg p-3 text-sm mb-3">
              This edit has not been saved. Save it before claiming or commenting.
              {!busy && !offline && apiState === "Connected" && (
                <Button variant="outline" size="sm" className="ml-2"
                  onClick={() => void openReview(review, batch.length ? batch : [review.id])}>
                  Retry saving
                </Button>
              )}
            </div>
          )}
          <div
            className={`workspace-panel ${route.reviewId ? "review-panel" : route.tab === "Live feed" ? "feed-panel" : route.tab === "Claim Board" ? "board-panel" : ["Workload", "Edit Activity"].includes(route.tab) ? "dashboard-panel" : "table-panel"}`}
            data-workspace-scroll={route.reviewId ? "true" : undefined}
          >
            {route.reviewId ? (
              review ? (
                <ReviewPage
                  key={review.id}
                  edit={review}
                  store={store}
                  actor={account.id}
                  role={account.role}
                  act={act}
                  offline={offline || apiState !== "Connected"}
                  actionsDisabled={busy}
                  batchIds={batch.length ? batch : undefined}
                  onLoaded={(id, edit) => {
                    inspected.current.add(id);
                    if (edit)
                      setStore((previous) => ({
                        ...previous,
                        edits: previous.edits.map((e, index) =>
                          e.id !== id && !activeReviewIds.current.has(e.id) && index >= 30
                            ? {...e, before: "", after: "", contentStatus: "unloaded" as const}
                            : e.id === id
                            ? {
                                ...e,
                                before: edit.before,
                                after: edit.after,
                                contentStatus: "ready",
                                pageId: edit.pageId ?? e.pageId,
                              }
                            : e,
                        ),
                      }));
                  }}
                  onBack={() => navigate(route.tab)}
                  remote
                  preferences={preferences}
                />
              ) : (
                <p role="status">
                  This revision is not in the active queue.{" "}
                  <Button onClick={() => navigate(route.tab)}>Back</Button>
                </p>
              )
            ) : (
              <>
                {route.tab === "Live feed" && (
                  <Feed
                    store={{
                      ...store,
                      edits: [...store.edits].sort((a, b) => b.time - a.time),
                    }}
                    role={account.role}
                    actor={account.id}
                    act={act}
                    offline={blocked}
                    onOpen={openReview}
                    mode="wiki"
                  />
                )}
                {route.tab === "My Claims" && (
                  <MyClaims
                    store={queue}
                    actor={account.id}
                    act={act}
                    offline={blocked}
                    onOpen={openReview}
                  />
                )}
                {route.tab === "Claim Board" && (
                  <Board
                    store={queue}
                    actor={account.id}
                    act={act}
                    offline={blocked}
                    onOpen={openReview}
                    remote
                    preferences={preferences}
                  />
                )}
                {route.tab === "Workload" && (
                  <Workload
                    store={queue}
                    onBoard={() => navigate("Claim Board")}
                  />
                )}
                {route.tab === "Edit Activity" && (
                  <EditActivity
                    store={activityStore}
                    activity={activity}
                    remote
                  />
                )}
                {route.tab === "Members" && (
                  <Members
                    store={queue}
                    actor={account.id}
                    act={act}
                    offline={blocked}
                    remote
                  />
                )}
                {route.tab === "Audit Log" && <AuditLog store={queue} remote />}
              </>
            )}
          </div>
        </main>
      </div>
      {notice && (
        <div
          className="fixed bottom-4 right-4 max-w-[calc(100vw-32px)] z-[100] bg-foreground text-background rounded-lg p-3 text-sm flex gap-3"
          role="status"
        >
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Workspace navigation</DialogTitle>
            <DialogDescription>
              {account.name} · {labels[account.role]}
            </DialogDescription>
          </DialogHeader>
          {nav}
          <Button
            variant="ghost"
            onClick={() => {
              setNavOpen(false);
              setDevOpen(true);
            }}
          >
            Dev mode
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
