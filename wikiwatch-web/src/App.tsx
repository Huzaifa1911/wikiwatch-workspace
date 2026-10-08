import RemoteApp from "./RemoteWorkspace";
import { API_ENABLED, backend } from "./backend";
import InstallApp from "./InstallApp";
import Login from "./Login";
import { SESSION_KEY, sessionId, guardedRoute } from "./auth";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
import { activityData } from "./activity";
import { RateChart, WorkloadChart, ActivityChart } from "./Charts";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./components/ui/card";
import {
  Dialog,
  DialogContent as ShadcnDialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./GridTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  Menu,
  Activity,
  LayoutDashboard,
  Users,
  ShieldCheck,
  Flag,
  FileText,
  Search,
  Pause,
  Play,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Sun,
  Moon,
  RotateCcw,
  Download,
  Plus,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Briefcase,
  BarChart3,
  GripVertical,
  HelpCircle,
  WifiOff,
  Wifi,
  LogOut,
} from "lucide-react";
import { LiveData } from "./LiveData";
import ReviewPage from "./ReviewPage";
import { readRoute, workspaceHash, reviewHash } from "./routes";
import {
  seed,
  transition,
  createEdit,
  KEY,
  csv,
  observe,
  type Store,
  type Edit,
  type Claim,
  type Member,
  type Action,
} from "./model";
function DialogContent(
  props: React.ComponentProps<typeof ShadcnDialogContent>,
) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <ShadcnDialogContent
      {...props}
      onOpenAutoFocus={(e) => {
        opener.current = document.activeElement as HTMLElement;
        props.onOpenAutoFocus?.(e);
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        opener.current?.focus();
        props.onCloseAutoFocus?.(e);
      }}
    />
  );
}
const roleInfo = {
  patroller: {
    label: "Reviewer",
    name: "Dev Patel",
    id: "dev",
    icon: ShieldCheck,
    tabs: ["Live feed", "My Claims"],
  },
  lead: {
    label: "Team lead",
    name: "Sara Okafor",
    id: "sara",
    icon: Briefcase,
    tabs: ["Claim Board", "Workload", "Live feed"],
  },
  admin: {
    label: "Admin",
    name: "Noor Haddad",
    id: "noor",
    icon: Users,
    tabs: ["Edit Activity", "Members", "Audit Log"],
  },
};
type Role = keyof typeof roleInfo;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const x = JSON.parse(raw);
      if (
        Array.isArray(x.edits) &&
        Array.isArray(x.claims) &&
        Array.isArray(x.members) &&
        Array.isArray(x.audit)
      )
        return {
          ...x,
          observations: x.observations ?? observe([], x.edits),
          edits: [
            ...x.edits,
            ...[24, 25]
              .filter(
                (i) => !x.edits.some((e: Edit) => e.id === `rev-${10000 + i}`),
              )
              .map((i) => createEdit(i)),
          ],
        } as Store;
    }
  } catch {}
  const s = seed();
  return {
    ...s,
    observations: observe([], s.edits),
    observationStart: Math.min(...s.edits.map((e) => e.time)),
  };
}
function sourceMode(): "examples" | "wiki" {
  try {
    return localStorage.getItem("patrol-source") === "examples"
      ? "examples"
      : "wiki";
  } catch {
    return "wiki";
  }
}
function loadLive(): Store {
  let saved: Store | undefined;
  try {
    saved = JSON.parse(localStorage.getItem(KEY + ":wiki") || "null");
  } catch {}
  return {
    edits: saved?.edits || [],
    claims: saved?.claims || [],
    audit: saved?.audit || [],
    members: saved?.members || seed().members,
    observations: [],
    observationStart: Date.now(),
  };
}
const when = (time: number) =>
  new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fullWhen = (time: number) => new Date(time).toLocaleString();
function DownloadCSV(name: string, rows: string[][]) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv(rows)], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Choose({
  value,
  onChange,
  items,
  label,
  className = "",
}: {
  value: string;
  onChange: (x: string) => void;
  items: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((x) => (
          <SelectItem key={x.value} value={x.value}>
            {x.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold border">
      {name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-center py-14">
      <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{text}</p>
    </div>
  );
}
export function App() {
  if (API_ENABLED) return <RemoteApp />;
  const [accountId, setAccountId] = useState(sessionId),
    [message, setMessage] = useState("");
  const members = (sourceMode() === "wiki" ? loadLive() : load()).members;
  const account = members.find((m) => m.id === accountId && m.active);
  function logout(reason = "") {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {}
    setAccountId(null);
    setMessage(reason);
    window.location.hash = "#/login";
  }
  return account ? (
    <Workspace key={account.id} account={account} onLogout={logout} />
  ) : (
    <Login
      members={members}
      message={message}
      onLogin={(member) => {
        try {
          window.sessionStorage.setItem(SESSION_KEY, member.id);
        } catch {}
        setMessage("");
        setAccountId(member.id);
      }}
    />
  );
}
function Workspace({
  account,
  onLogout,
}: {
  account: Member;
  onLogout: (reason?: string) => void;
}) {
  const [mode, setMode] = useState<"examples" | "wiki">(sourceMode),
    [inspected, setInspected] = useState<string[]>([]),
    [batch, setBatch] = useState<string[]>(
      () =>
        new URLSearchParams(window.location.hash.split("?")[1] || "")
          .get("batch")
          ?.split(",")
          .filter(Boolean) || [],
    ),
    [store, setStore] = useState<Store>(() =>
      sourceMode() === "wiki" ? loadLive() : load(),
    ),
    [role, setRole] = useState<Role>(account.role),
    [patroller, setReviewer] = useState(account.id),
    [tab, setTab] = useState(guardedRoute(account).route.tab),
    [reviewId, setReviewId] = useState<string | null>(
      guardedRoute(account).route.reviewId,
    ),
    [dark, setDark] = useState(false),
    [toast, setToast] = useState(""),
    [navOpen, setNavOpen] = useState(false),
    [help, setHelp] = useState(false),
    [reset, setReset] = useState(false),
    [offline, setOffline] = useState(() => !navigator.onLine),
    [devOpen, setDevOpen] = useState(false),
    [connection, setConnection] = useState("Connecting"),
    [storageError, setStorageError] = useState(false);
  const state = useRef(store);
  state.current = store;
  const currentId = account.id;
  const me = store.members.find((m) => m.id === currentId);
  const nextIndex = useRef(
    Math.max(
      25,
      ...store.edits
        .filter((e) => e.id.startsWith("rev-"))
        .map((e) => Number(e.id.replace("rev-", "")) - 10000),
    ) + 1,
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        mode === "wiki" ? KEY + ":wiki" : KEY,
        JSON.stringify(store),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [store, mode]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const listener = (e: StorageEvent) => {
      if (e.key === (mode === "wiki" ? KEY + ":wiki" : KEY) && e.newValue) {
        try {
          setStore(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [mode]);
  useEffect(() => {
    const disconnected = () => setOffline(true),
      connected = () => setOffline(false);
    window.addEventListener("offline", disconnected);
    window.addEventListener("online", connected);
    return () => {
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("online", connected);
    };
  }, []);
  useEffect(() => {
    if (offline || mode === "wiki") return;
    const interval = setInterval(
      () =>
        setStore((s) =>
          transition(s, {
            type: "event",
            edit: createEdit(nextIndex.current++),
          }),
        ),
      8000,
    );
    return () => clearInterval(interval);
  }, [offline, mode]);
  useEffect(() => {
    const listener = () => {
      const checked = guardedRoute(account);
      const r = checked.route;
      if (window.location.hash !== checked.hash)
        window.history.replaceState(null, "", checked.hash);
      setRole(account.role);
      setTab(r.tab);
      setReviewer(account.id);
      setReviewId(r.reviewId);
      setBatch(
        r.reviewId
          ? new URLSearchParams(checked.hash.split("?")[1] || "")
              .get("batch")
              ?.split(",")
              .filter(Boolean) || []
          : [],
      );
      if (checked.denied)
        setToast(
          "This page is not available to your role. Your workspace is shown instead.",
        );
    };
    listener();
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, [account.id, account.role]);
  useEffect(() => {
    if (!me?.active || me.role !== account.role)
      onLogout(
        "Your workspace access changed. Sign in with an active account.",
      );
  }, [me?.active, me?.role]);
  function navigate(t: string, r: Role = role, u = patroller) {
    if (
      r !== account.role ||
      !roleInfo[account.role].tabs.includes(t) ||
      u !== account.id
    ) {
      notify("This page is not available to your role.");
      return;
    }
    setRole(r);
    setTab(t);
    setReviewer(u);
    setReviewId(null);
    window.location.hash = workspaceHash(r, t, u);
  }
  function openReview(e: Edit, ids: string[] = [e.id]) {
    setStore((s) =>
      s.edits.some((x) => x.id === e.id) ? s : { ...s, edits: [e, ...s.edits] },
    );
    setBatch(ids);
    setReviewId(e.id);
    window.location.hash =
      reviewHash(e.wiki, e.id, role, patroller, tab) +
      (ids.length > 1 ? "&batch=" + encodeURIComponent(ids.join(",")) : "");
  }
  const notify = (message: string) => setToast(message);
  function act(action: Action) {
    if ("actor" in action && action.actor !== account.id) {
      notify("This action belongs to another account.");
      return false;
    }
    if (
      action.type === "verify" &&
      !inspected.includes(`${action.actor}:${action.editId}`)
    ) {
      notify(
        "Open the diff and inspect its source before verifying this flag.",
      );
      return false;
    }
    if (offline) {
      notify(
        "The browser is offline. Restore your connection before changing team records.",
      );
      return false;
    }
    try {
      const next = transition(state.current, action);
      state.current = next;
      setStore(next);
      notify(
        action.type === "claim"
          ? "Edit claimed. Find it in My Claims."
          : action.type === "ok"
            ? "Marked OK. Team board and audit log updated."
            : action.type === "flag"
              ? "Flag raised. Reason saved for review."
              : action.type === "reassign"
                ? "Assignment updated."
                : "Changes saved.",
      );
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    }
  }
  function retainEdit(e: Edit) {
    if (state.current.edits.some((x) => x.id === e.id)) return;
    const next = { ...state.current, edits: [e, ...state.current.edits] };
    state.current = next;
    setStore(next);
  }
  function switchRole(r: Role) {
    navigate(roleInfo[r].tabs[0], r);
  }
  function changeMode(next: "examples" | "wiki") {
    if (next === mode) return;
    setMode(next);
    try {
      localStorage.setItem("patrol-source", next);
    } catch {}
    setBatch([]);
    setReviewId(null);
    window.location.hash = workspaceHash(
      role,
      roleInfo[role].tabs[0],
      patroller,
    );
    setTab(roleInfo[role].tabs[0]);
    if (next === "examples") {
      const sample = load();
      nextIndex.current =
        Math.max(
          25,
          ...sample.edits.map((e) => Number(e.id.replace("rev-", "")) - 10000),
        ) + 1;
      setStore(sample);
      return;
    }
    setStore(loadLive());
  }

  const seen = useRef(new Set<string>());
  const ingest = useRef<(edits: Edit[], count: boolean) => void>(() => {});
  ingest.current = (edits, count) =>
    setStore((s) => {
      const incoming = new Map(
        edits.map((e) => [
          e.id,
          s.edits.find((x) => x.id === e.id && x.contentStatus === "ready") ||
            e,
        ]),
      );
      const fresh = count
        ? edits.filter((e) => {
            if (seen.current.has(e.id)) return false;
            seen.current.add(e.id);
            return true;
          })
        : [];
      if (seen.current.size > 100000)
        seen.current = new Set([...seen.current].slice(-50000));
      const pinned = new Set([
        ...s.claims.map((c) => c.editId),
        ...batch,
        ...(reviewId ? [reviewId] : []),
      ]);
      return {
        ...s,
        edits: [
          ...incoming.values(),
          ...s.edits.filter((e) => !incoming.has(e.id)),
        ]
          .sort((a, b) => b.time - a.time)
          .filter((e, i) => i < 200 || pinned.has(e.id)),
        arrivals: (s.arrivals ?? 0) + fresh.length,
        observations: observe(s.observations, fresh),
        observationStart: s.observationStart ?? Date.now(),
      };
    });
  const counts = {
    active: store.claims.filter((c) => c.outcome === "claimed").length,
    reviewed: store.claims.filter((c) => c.outcome !== "claimed").length,
  };
  const navigationIcons: any = {
    "Live feed": Activity,
    "My Claims": FileText,
    "Claim Board": LayoutDashboard,
    Workload: BarChart3,
    "Edit Activity": Activity,
    Members: Users,
    "Audit Log": FileText,
  };
  return (
    <div className="app-shell">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="px-3 lg:px-7 py-2 lg:py-3 flex items-center gap-2 lg:gap-4">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate(roleInfo[role].tabs[0]);
            }}
            className="flex gap-2.5 items-center mr-auto"
            aria-label="WikiWatch home"
          >
            <span className="bg-primary text-primary-foreground rounded-lg p-2">
              <Flag className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight text-lg">
              WikiWatch
              <span className="text-muted-foreground font-normal text-sm ml-2 hidden sm:inline">
                / team workspace
              </span>
            </span>
          </a>
          <InstallApp className="hidden lg:inline-flex" />
          <Badge variant="outline" className="hidden sm:inline-flex">
            {roleInfo[role].label}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Sign out"
            onClick={() => onLogout()}
          >
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={() => setHelp(true)}
          >
            <HelpCircle className="h-4 w-4 mr-2" />
            Guide
          </Button>
        </div>
      </header>
      <div className="app-body flex flex-col lg:flex-row">
        <aside className="lg:w-56 shrink-0 border-r bg-card workspace-nav p-4 hidden lg:flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <Avatar name={me?.name || roleInfo[role].name} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {me?.name || roleInfo[role].name}
              </p>
              <p className="text-xs text-muted-foreground">
                {roleInfo[role].label}
              </p>
            </div>
          </div>
          <nav
            aria-label="Workspace sections"
            className="flex md:flex-col gap-1 overflow-x-auto"
          >
            {roleInfo[role].tabs.map((t) => {
              const Icon = navigationIcons[t];
              return (
                <Button
                  key={t}
                  variant={t === tab ? "secondary" : "ghost"}
                  className={`justify-start whitespace-nowrap ${t === tab ? "text-primary font-semibold" : ""}`}
                  onClick={() => navigate(t)}
                  aria-current={t === tab ? "page" : undefined}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {t}
                  {t === "My Claims" && (
                    <span className="ml-auto text-xs pl-2">
                      {store.claims.filter((c) => c.owner === patroller).length}
                    </span>
                  )}
                </Button>
              );
            })}
          </nav>
          <div className="mt-auto hidden md:block space-y-3 pt-10">
            <div className="rounded-lg border p-3 text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground block mb-1">
                Local team simulation
              </span>
              Claims, members and reviews stay in this browser. They are not
              Wikipedia accounts or decisions. Comments are browser-local notes,
              visible to demo actors on this device.
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setReset(true)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset demo
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => setDevOpen(true)}
          >
            Dev mode
          </Button>
        </aside>
        <main className="workspace-main flex-1 min-w-0 p-3 md:p-5 max-w-[1600px] mx-auto w-full">
          {!reviewId && (
            <div className="workspace-heading flex justify-between items-start gap-4 mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[.18em] text-muted-foreground mb-2">
                  Workspace / {roleInfo[role].label}
                </div>
                <h1 className="text-xl md:text-2xl tracking-tight font-semibold">
                  {reviewId ? "Review edit" : tab}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tab === "Live feed"
                    ? role === "lead"
                      ? "Watch the incoming stream. Review actions belong to reviewers."
                      : "Watch incoming edits. Claim one and give it a careful review."
                    : tab === "My Claims"
                      ? "Your claimed edits and completed reviews, with revision details one click away."
                      : tab === "Claim Board"
                        ? "Assign work from this browser’s queue, verify flag reasons and return reviews with feedback."
                        : tab === "Workload"
                          ? "See active assignments and completed reviews for each reviewer."
                          : tab === "Members"
                            ? "Add team members and manage their workspace access."
                            : tab === "Audit Log"
                              ? "A chronological record of team actions. Search, filter and export."
                              : "Wikipedia edit activity observed in this demo session."}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <span
                  className={`h-2 w-2 rounded-full ${(mode === "wiki" && connection !== "Connected") || offline ? "bg-amber-500" : "bg-emerald-500"}`}
                />
                {mode === "examples"
                  ? "Example data"
                  : offline
                    ? "Browser offline"
                    : connection === "Connected"
                      ? "Live stream"
                      : connection}
              </div>
            </div>
          )}
          {offline && (
            <div
              role="status"
              className="mb-3 rounded-lg border border-amber-300 p-3 text-sm"
            >
              Browser offline. Saved reviews remain available. The stream will
              reconnect when the network returns.
            </div>
          )}
          {storageError && (
            <p role="alert" className="mb-4 text-sm text-amber-700">
              Browser storage is unavailable. Changes will last only until this
              page closes.
            </p>
          )}
          {(!me?.active || me.role !== role) && (
            <p role="alert" className="mb-4 text-sm text-amber-700">
              This demo account no longer has this role. Switch to an active
              account or reset the demo.
            </p>
          )}
          <LiveData
            enabled={mode === "wiki"}
            offline={offline}
            open={devOpen}
            onOpenChange={setDevOpen}
            sourceControls={
              <Choose
                label="Data source"
                value={mode}
                onChange={(m) => {
                  seen.current.clear();
                  changeMode(m as any);
                }}
                items={[
                  { value: "examples", label: "Example data" },
                  { value: "wiki", label: "Real Wikipedia" },
                ]}
                className="w-44 h-9"
              />
            }
            onStatusChange={setConnection}
            ingest={(edits, count) => ingest.current(edits, count)}
            onConnection={(connected) =>
              setStore((s) => {
                const gaps = [...(s.gaps || [])];
                const last = gaps[gaps.length - 1];
                if (connected) {
                  if (!last || last.end) return s;
                  gaps[gaps.length - 1] = { ...last, end: Date.now() };
                } else {
                  if (last && !last.end) return s;
                  gaps.push({ start: Date.now() });
                }
                return { ...s, gaps };
              })
            }
          />
          <div
            className={`workspace-panel ${reviewId ? "review-panel" : tab === "Live feed" ? "feed-panel" : tab === "Claim Board" ? "board-panel" : ["Workload", "Edit Activity"].includes(tab) ? "dashboard-panel" : "table-panel"}`}
            data-workspace-scroll={reviewId ? "true" : undefined}
          >
            {reviewId ? (
              <>
                {store.edits.find((e) => e.id === reviewId) ? (
                  <ReviewPage
                    key={reviewId}
                    edit={store.edits.find((e) => e.id === reviewId)!}
                    store={store}
                    actor={currentId}
                    role={role}
                    act={act}
                    offline={offline}
                    batchIds={batch.length ? batch : undefined}
                    onLoaded={(id) =>
                      setInspected((x) =>
                        x.includes(`${currentId}:${id}`)
                          ? x
                          : [...x, `${currentId}:${id}`],
                      )
                    }
                    onBack={() => navigate(tab)}
                  />
                ) : (
                  <p>
                    This revision is unavailable.{" "}
                    <Button onClick={() => navigate(tab)}>Back</Button>
                  </p>
                )}
              </>
            ) : (
              <>
                {tab === "Live feed" && (
                  <Feed
                    key={`${role}-${mode}`}
                    store={store}
                    role={role}
                    actor={currentId}
                    act={act}
                    offline={offline}
                    onOpen={openReview}
                    onSelection={setBatch}
                    mode={mode}
                  />
                )}
                {tab === "My Claims" && (
                  <MyClaims
                    store={store}
                    actor={currentId}
                    act={act}
                    offline={offline}
                    onOpen={openReview}
                  />
                )}
                {tab === "Claim Board" && (
                  <Board
                    onRetain={retainEdit}
                    actor={currentId}
                    store={store}
                    act={act}
                    offline={offline}
                    onOpen={openReview}
                  />
                )}
                {tab === "Workload" && (
                  <Workload
                    store={store}
                    onBoard={() => navigate("Claim Board")}
                  />
                )}
                {tab === "Edit Activity" && (
                  <EditActivity store={store} live={mode === "wiki"} />
                )}
                {tab === "Members" && (
                  <Members
                    actor={currentId}
                    store={store}
                    act={act}
                    offline={offline}
                  />
                )}
                {tab === "Audit Log" && <AuditLog store={store} />}
              </>
            )}
          </div>
        </main>
      </div>
      <div
        className="fixed bottom-4 right-4 z-[100] max-w-[calc(100vw-32px)]"
        aria-live="polite"
        role="status"
      >
        {toast && (
          <div className="bg-foreground text-background rounded-lg px-4 py-3 shadow-lg flex gap-2 items-start text-sm">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{toast}</span>
            <button
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
              className="ml-3"
            >
              ×
            </button>
          </div>
        )}
      </div>
      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Workspace navigation</DialogTitle>
            <DialogDescription>
              {me?.name} · {roleInfo[role].label}
            </DialogDescription>
          </DialogHeader>
          <nav aria-label="Compact workspace sections" className="grid gap-2">
            {roleInfo[role].tabs.map((t) => (
              <Button
                key={t}
                variant={t === tab ? "secondary" : "ghost"}
                className="justify-start min-h-11"
                aria-current={t === tab ? "page" : undefined}
                onClick={() => {
                  navigate(t);
                  setNavOpen(false);
                }}
              >
                {t}
              </Button>
            ))}
          </nav>
          <div className="border-t pt-3 grid grid-cols-2 gap-2">
            <InstallApp />
            <Button
              variant="outline"
              onClick={() => {
                setNavOpen(false);
                setDevOpen(true);
              }}
            >
              Dev mode
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setNavOpen(false);
                setHelp(true);
              }}
            >
              Guide
            </Button>
            <Button variant="outline" onClick={() => setDark(!dark)}>
              {dark ? "Use light theme" : "Use dark theme"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setNavOpen(false);
                setReset(true);
              }}
            >
              Reset demo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Workspace guide</DialogTitle>
            <DialogDescription>
              Real Wikipedia mode reads public APIs. Team actions and comments
              stay in this browser. No Wikipedia edits or invitation emails are
              sent.
            </DialogDescription>
          </DialogHeader>
          <Guide
            role={role}
            onRole={(r) => {
              switchRole(r);
              setHelp(false);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={reset} onOpenChange={setReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the demo workspace?</DialogTitle>
            <DialogDescription>
              This clears local demo claims, members and audit actions, then
              restores the starting examples.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReset(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                try {
                  Object.keys(localStorage)
                    .filter((k) =>
                      /^patrol-(comments|viewed|batch|board-order)-/.test(k),
                    )
                    .forEach((k) => localStorage.removeItem(k));
                } catch {}
                const s =
                  mode === "wiki"
                    ? {
                        ...seed(),
                        edits: [],
                        claims: [],
                        audit: [],
                        observations: [],
                        observationStart: Date.now(),
                      }
                    : seed();
                setStore(s);
                state.current = s;
                nextIndex.current = 26;
                navigate(roleInfo[role].tabs[0]);
                setReset(false);
                notify("Demo workspace reset.");
              }}
            >
              Reset demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function Feed({
  store,
  role,
  onOpen,
  mode,
  onSelection,
}: {
  store: Store;
  role: Role;
  actor: string;
  act: (a: Action) => boolean | Promise<boolean>;
  offline: boolean;
  onOpen: (e: Edit, ids?: string[]) => void;
  mode?: string;
  onSelection?: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState(""),
    [wiki, setWiki] = useState("all"),
    [minSize, setMinSize] = useState("0"),
    [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [gridBusy, setGridBusy] = useState(false),
    [following, setFollowing] = useState(false),
    [snapshot, setSnapshot] = useState<Edit[]>(() => store.edits.slice(0, 200)),
    [baseline, setBaseline] = useState(store.arrivals ?? 0),
    [page, setPage] = useState(1),
    [insightsOpen, setInsightsOpen] = useState(false),
    [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => {
    onSelection?.(chosen);
  }, [chosen]);
  const interacting = hovered || focused || gridBusy;
  const latest = useRef(store);
  latest.current = store;
  function showNew() {
    setSnapshot(latest.current.edits.slice(0, 200));
    setBaseline(latest.current.arrivals ?? 0);
    setPage(1);
  }
  useEffect(() => {
    if (!snapshot.length && store.edits.length) {
      setSnapshot(store.edits.slice(0, 200));
      setBaseline(store.arrivals ?? 0);
    }
  }, [store.edits, snapshot.length]);
  useEffect(() => {
    if (!following || interacting || chosen.length || page !== 1) return;
    const interval = setInterval(() => {
      if (!document.hidden) showNew();
    }, 3000);
    return () => clearInterval(interval);
  }, [following, interacting, chosen.length, page]);
  const pool = snapshot;
  const filtered = React.useMemo(
    () =>
      pool.filter(
        (e) =>
          (wiki === "all" || e.wiki === wiki) &&
          Math.abs(e.delta) >= Number(minSize) &&
          (e.title + " " + e.editor + " " + e.comment)
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [pool, wiki, minSize, query],
  );
  useEffect(() => {
    if (!filtered.length) setChosen([]);
  }, [filtered.length]);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  useEffect(() => setPage(1), [query, wiki, minSize]);
  useEffect(() => setPage((p) => Math.min(p, pages)), [pages]);
  const unseen = Math.max(
    0,
    (store.arrivals ?? 0) - baseline,
    store.edits
      .slice(0, 200)
      .filter((e) => !snapshot.some((s) => s.id === e.id)).length,
  );
  const held = interacting || chosen.length > 0 || page !== 1;
  const trend = Array.from({ length: 14 }, (_, i) =>
    (store.observations || [])
      .filter(
        (o) =>
          Math.floor(o.time / 60000) ===
          Math.floor(Date.now() / 60000) - 13 + i,
      )
      .reduce((n, o) => n + o.count, 0),
  );
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const renderedRows = React.useMemo(
    () => (
      <TableBody>
        {filtered.map((e) => (
          <TableRow
            key={e.id}
            data-row-id={e.id}
            className={role === "patroller" ? "feed-row" : ""}
          >
            <TableCell>
              <div className="max-w-[340px]">
                {role === "patroller" ? (
                  <button
                    className="font-medium text-left text-sm hover:underline underline-offset-4 break-words"
                    onClick={() => openRef.current(e)}
                    aria-label={`Inspect ${e.title}`}
                  >
                    <bdi>{e.title}</bdi>
                    <ArrowUpRight className="inline h-3 w-3 ml-1 text-muted-foreground" />
                  </button>
                ) : (
                  <span className="font-medium text-sm break-words">
                    <bdi>{e.title}</bdi>
                  </span>
                )}
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  <bdi>{e.comment}</bdi>
                </p>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="uppercase text-[10px]">
                {e.wiki}
              </Badge>
            </TableCell>
            <TableCell className="text-xs">
              <bdi>{e.editor}</bdi>
            </TableCell>
            <TableCell
              data-value={e.delta}
              className={`text-right font-mono text-xs ${e.delta >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}
            >
              {e.delta > 0 ? "+" : ""}
              {e.delta}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
              {when(e.time)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    ),
    [filtered, role],
  );
  const insightCards = (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Stream cadence</CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {mode === "wiki"
              ? (store.observations || [])
                  .filter(
                    (o) => o.time === Math.floor(Date.now() / 60000) * 60000,
                  )
                  .reduce((n, o) => n + o.count, 0)
              : 7.5}{" "}
            <span className="text-sm text-muted-foreground font-normal">
              {mode === "wiki" ? "edits this minute" : "edits / min"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RateChart counts={trend} />
          <p className="text-xs text-muted-foreground mt-3">
            {mode === "wiki"
              ? "Unique edits observed in the current clock minute."
              : "Simulated at one event every 8 seconds."}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {role === "lead" ? "Stream only" : "A deliberate review"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground leading-relaxed">
          {role === "lead"
            ? "Use Claim Board to assign edits and Workload to balance the team. This feed has no diff or review actions."
            : "Open a page, inspect the revision diff, then claim it before marking OK or raising a flag. Rows stay steady while you read. Load new edits when ready, or enable Follow live."}
        </CardContent>
      </Card>
    </>
  );
  return (
    <>
      <div className="feed-filters flex gap-3 flex-wrap items-center mb-5">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search live feed"
            placeholder="Search pages, editors or comments…"
            className="pl-9 bg-card"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Choose
          label="Feed language"
          value={wiki}
          onChange={setWiki}
          className="w-36 bg-card"
          items={[
            { value: "all", label: "All wikis" },
            { value: "en", label: "English" },
            { value: "ar", label: "Arabic" },
            { value: "ja", label: "Japanese" },
          ]}
        />
        <Choose
          label="Minimum size change"
          value={minSize}
          onChange={setMinSize}
          className="w-40 bg-card"
          items={[
            { value: "0", label: "All size changes" },
            { value: "25", label: "Change ≥ 25 bytes" },
            { value: "50", label: "Change ≥ 50 bytes" },
          ]}
        />
        <Button
          variant="outline"
          aria-pressed={following}
          onClick={() => setFollowing(!following)}
        >
          {following ? (
            <Pause className="h-4 w-4 mr-2" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {following ? "Stop following" : "Follow live"}
        </Button>
      </div>
      <div className="rounded-lg border bg-muted/30 p-3 mb-4 flex gap-3 items-center flex-wrap">
        <Button
          variant="secondary"
          size="sm"
          disabled={!unseen || chosen.length > 0}
          onClick={showNew}
        >
          Show new edits ({unseen})
        </Button>
        <span className="text-xs text-muted-foreground">
          {chosen.length
            ? "Rows are held while you select a review batch."
            : following && interacting
              ? "Following is held while you interact with rows."
              : following && page !== 1
                ? "Following is held while you browse older pages."
                : "Receiving continues in the background. The newest 200 queue entries are retained."}
          {unseen > 200
            ? " Older arrivals have left the queue; loading shows the latest retained edits."
            : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_230px] gap-4 feed-layout">
        <Card className="overflow-hidden table-card">
          <div
            className="px-5 py-3 border-b flex justify-between items-center gap-3 flex-wrap text-xs"
            aria-label="Recent edits header"
          >
            <div>
              <span className="font-medium">
                Recent edits{" "}
                <span className="text-muted-foreground font-normal ml-2">
                  {filtered.length} in queue
                </span>
              </span>
              <span className="text-muted-foreground block mt-1">
                {following && !held
                  ? "Following · refresh every 3 seconds"
                  : "Reading · rows stay steady"}
              </span>
            </div>
            {role === "patroller" && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  disabled={!chosen.length}
                  variant="outline"
                  onClick={() => {
                    const first =
                      store.edits.find((e) => e.id === chosen[0]) ||
                      snapshot.find((e) => e.id === chosen[0]);
                    if (first) onOpen(first, chosen);
                  }}
                >
                  Review selected ({chosen.length})
                </Button>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label="About review selection"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>
                        Select rows to open a review batch. Each selected
                        revision is reviewed separately.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              aria-label="Stream insights"
              onClick={() => setInsightsOpen(true)}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
          </div>
          {filtered.length ? (
            <div
              className="table-slot"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onFocusCapture={() => setFocused(true)}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setFocused(false);
              }}
            >
              <Table
                onSelectedRowsChange={
                  role === "patroller" ? setChosen : undefined
                }
                onPageChanged={setPage}
                resetPageKey={snapshot}
                onInteractionChanged={setGridBusy}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Page / edit</TableHead>
                    <TableHead>Wiki</TableHead>
                    <TableHead>Editor</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                {renderedRows}
              </Table>
            </div>
          ) : (
            <Empty
              title="No matching edits"
              text="Try another search or widen your filters."
            />
          )}
        </Card>
        <div className="space-y-4">{insightCards}</div>
      </div>
      <Dialog open={insightsOpen} onOpenChange={setInsightsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Stream insights</DialogTitle>
            <DialogDescription>
              Stream cadence and review guidance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">{insightCards}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function MyClaims({
  store,
  actor,
  onOpen,
}: {
  store: Store;
  actor: string;
  act: (a: Action) => boolean | Promise<boolean>;
  offline: boolean;
  onOpen: (e: Edit) => void;
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("newest");
  const claims = store.claims
    .filter((c) => c.owner === actor)
    .map((c) => ({ ...c, edit: store.edits.find((e) => e.id === c.editId)! }))
    .filter(
      (c) =>
        c.edit &&
        (c.edit.title + " " + c.reason)
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.edit.title.localeCompare(b.edit.title)
        : b.claimedAt - a.claimedAt,
    );
  return (
    <>
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            aria-label="Search my claims"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-card"
            placeholder="Search your claims…"
          />
        </div>
        <Choose
          value={sort}
          onChange={setSort}
          label="Sort my claims"
          className="w-44 bg-card"
          items={[
            { value: "newest", label: "Recently claimed" },
            { value: "title", label: "Page title A–Z" },
          ]}
        />
      </div>
      <Card className="table-card">
        {claims.length ? (
          <div className="table-slot">
            <Table pageSize={10}>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead>Wiki</TableHead>
                  <TableHead>Revision</TableHead>
                  <TableHead>Claimed at</TableHead>
                  <TableHead>Review note</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c.editId} data-row-id={c.editId}>
                    <TableCell className="font-medium max-w-60 break-words">
                      <bdi>{c.edit.title}</bdi>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.edit.wiki}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.editId}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {fullWhen(c.claimedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-64 break-words">
                      <bdi>
                        {c.outcome === "returned"
                          ? `Needs attention: ${c.returnReason}`
                          : c.reason || "—"}
                      </bdi>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpen(c.edit)}
                        aria-label={`View diff for ${c.edit.title}`}
                      >
                        View diff
                        <ArrowUpRight className="ml-1 h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty
            title="No claims found"
            text="Claim an edit from the live feed to start your review queue."
          />
        )}
      </Card>
    </>
  );
}
export function Board({
  store,
  act,
  offline,
  onOpen,
  actor,
  onRetain,
  remote = false,
  preferences,
}: {
  actor: string;
  store: Store;
  act: (a: Action) => boolean | Promise<boolean>;
  offline: boolean;
  onOpen: (e: Edit) => void;
  onRetain?: (e: Edit) => void;
  remote?: boolean;
  preferences?: any;
}) {
  const definitions = [
    {
      key: "unclaimed",
      title: "Unclaimed",
      description: API_ENABLED ? "Shared database queue" : "Observed queue",
      color: "bg-zinc-400",
    },
    {
      key: "claimed",
      title: "Claimed",
      description: "Review in progress",
      color: "bg-blue-500",
    },
    {
      key: "flagged",
      title: "Needs verification",
      description: "Lead checks the reason",
      color: "bg-rose-500",
    },
    {
      key: "returned",
      title: "Returned",
      description: "Owner reviews it again",
      color: "bg-amber-500",
    },
    {
      key: "reviewed",
      title: "Reviewed",
      description: "OK or verified flag",
      color: "bg-emerald-500",
    },
  ];
  const [query, setQuery] = useState(""),
    [who, setWho] = useState("all"),
    [assign, setAssign] = useState<string | null>(null),
    [owner, setOwner] = useState(""),
    [dragged, setDragged] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [move, setMove] = useState<{ id: string; target: string } | null>(null),
    [reason, setReason] = useState(""),
    [order, setOrder] = useState<string[]>(() => {
      if (remote)
        return preferences?.board_order || definitions.map((c) => c.key);
      try {
        const x = JSON.parse(
          localStorage.getItem("patrol-board-order-v1") || "null",
        );
        if (
          Array.isArray(x) &&
          x.length === 5 &&
          new Set(x).size === 5 &&
          x.every((k) => definitions.some((d) => d.key === k))
        )
          return x;
      } catch {}
      return definitions.map((c) => c.key);
    });
  const [snapshot, setSnapshot] = useState(() => store.edits.slice(0, 200)),
    [baseline, setBaseline] = useState(store.arrivals ?? 0),
    [following, setFollowing] = useState(false),
    [reordering, setReordering] = useState(false),
    [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false);
  useEffect(() => {
    if (remote && preferences?.board_order && !reordering && !dragged)
      setOrder(preferences.board_order);
  }, [remote, preferences?.version]);
  const latest = useRef(store);
  latest.current = store;
  const manualLocked = !!assign || !!move || !!dragged || reordering || offline,
    locked = hovered || focused || manualLocked;
  function showNew() {
    setSnapshot(latest.current.edits.slice(0, 200));
    setBaseline(latest.current.arrivals ?? 0);
  }
  useEffect(() => {
    if (!snapshot.length && store.edits.length) showNew();
  }, [store.edits, snapshot.length]);
  useEffect(() => {
    if (!following || locked) return;
    const timer = setInterval(() => {
      if (!document.hidden) showNew();
    }, 3000);
    return () => clearInterval(timer);
  }, [following, locked]);
  const unseen = Math.max(
    0,
    (store.arrivals ?? 0) - baseline,
    store.edits
      .slice(0, 200)
      .filter((e) => !snapshot.some((s) => s.id === e.id)).length,
  );
  const pool = [
    ...new Map(
      [
        ...snapshot,
        ...store.edits.filter((e) =>
          store.claims.some((c) => c.editId === e.id),
        ),
      ].map((e) => [e.id, e]),
    ).values(),
  ];
  const previousClaims = useRef(
    new Map(
      store.claims.map((c) => [
        c.editId,
        store.edits.find((e) => e.id === c.editId),
      ]),
    ),
  );
  useEffect(() => {
    const released = [...previousClaims.current]
      .filter(([id]) => !store.claims.some((c) => c.editId === id))
      .map(([id, e]) => store.edits.find((x) => x.id === id) || e)
      .filter(Boolean) as Edit[];
    if (released.length)
      setSnapshot((old) =>
        [
          ...released,
          ...old.filter((e) => !released.some((r) => r.id === e.id)),
        ].slice(0, 200),
      );
    previousClaims.current = new Map(
      store.claims.map((c) => [
        c.editId,
        store.edits.find((e) => e.id === c.editId),
      ]),
    );
  }, [store.claims, store.edits]);
  const patrollers = store.members.filter(
    (m) => m.role === "patroller" && m.active,
  );
  const filtered = pool
    .filter((e) => e.title.toLowerCase().includes(query.toLowerCase()))
    .filter(
      (e) =>
        who === "all" ||
        store.claims.find((c) => c.editId === e.id)?.owner === who,
    );
  const status = (e: Edit) => {
    const c = store.claims.find((c) => c.editId === e.id);
    return !c
      ? "unclaimed"
      : ["claimed", "flagged", "returned"].includes(c.outcome)
        ? c.outcome
        : "reviewed";
  };
  const columns = order.map((k) => definitions.find((d) => d.key === k)!);
  const selected = pool.find((e) => e.id === assign);
  const moving = pool.find((e) => e.id === move?.id);
  function requestAssign(e: Edit) {
    onRetain?.(e);
    setAssign(e.id);
    setOwner(
      store.claims.find((c) => c.editId === e.id)?.owner ||
        patrollers[0]?.id ||
        "",
    );
    setMessage("");
  }
  function targets(e: Edit) {
    return status(e) === "unclaimed"
      ? ["claimed"]
      : status(e) === "claimed"
        ? ["unclaimed"]
        : status(e) === "flagged"
          ? ["returned", "reviewed"]
          : status(e) === "reviewed"
            ? ["returned"]
            : [];
  }
  function requestMove(e: Edit, target: string) {
    onRetain?.(e);
    if (offline) {
      setMessage("Reconnect before moving shared work.");
      return;
    }
    if (status(e) === target) return;
    if (!targets(e).includes(target)) {
      setMessage(
        status(e) === "returned"
          ? "The assigned reviewer must revise the reason and resubmit this review."
          : "This move is not allowed. Use a valid review transition.",
      );
      return;
    }
    if (target === "claimed") {
      requestAssign(e);
      return;
    }
    setMove({ id: e.id, target });
    setReason("");
    setMessage("");
  }
  async function reorder(source: string, target: string) {
    if (source === target) return;
    const next = order.filter((x) => x !== source);
    next.splice(next.indexOf(target), 0, source);
    try {
      if (remote) {
        const latest = await backend.request("/preferences/me");
        const saved = await backend.request("/preferences/me", {
          method: "PUT",
          body: { ...latest, board_order: next },
        });
        window.dispatchEvent(
          new CustomEvent("wikiwatch-preferences-changed", { detail: saved }),
        );
      } else
        localStorage.setItem("patrol-board-order-v1", JSON.stringify(next));
      setOrder(next);
    } catch {
      setMessage("Column order could not be saved.");
    }
  }
  return (
    <>
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            aria-label="Search board"
            className="pl-9 bg-card"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the review queue…"
          />
        </div>
        <Choose
          label="Board assignee"
          value={who}
          onChange={setWho}
          className="w-44 bg-card"
          items={[
            { value: "all", label: "All assignees" },
            ...store.members
              .filter((m) => m.role === "patroller")
              .map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
        <Button
          variant="outline"
          aria-pressed={following}
          onClick={() => setFollowing(!following)}
        >
          {following ? "Stop following" : "Follow live"}
        </Button>
      </div>
      <div className="board-live-controls">
        <Button
          size="sm"
          variant="secondary"
          disabled={!unseen || manualLocked}
          onClick={showNew}
        >
          Show new edits ({unseen})
        </Button>
        <span className="text-xs text-muted-foreground">
          {following
            ? locked
              ? "Following held while you interact."
              : "Following · refresh every 3 seconds"
            : "Reading · unclaimed cards stay steady"}
          . Claims and review decisions update immediately.
          {unseen > 200
            ? " Older arrivals have left the queue; loading shows the latest retained edits."
            : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Drag cards to change work. Drag column headings to reorder your board.
        Use Move or the heading arrows with a keyboard.
      </p>
      {message && (
        <p
          role="alert"
          className="border border-amber-300 rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 mb-4 text-sm"
        >
          {message}
        </p>
      )}
      <div
        className="board-columns"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setFocused(false);
        }}
      >
        {columns.map((col, index) => {
          const edits = filtered.filter((e) => status(e) === col.key);
          return (
            <section
              key={col.key}
              className="board-column rounded-xl bg-muted/50 border p-3 w-[270px] min-w-[270px] flex-1"
              aria-label={`${col.title} column`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const column = e.dataTransfer.getData(
                  "application/x-patrol-column",
                );
                if (column) {
                  setReordering(false);
                  reorder(column, col.key);
                  return;
                }
                const id = e.dataTransfer.getData("text/plain") || dragged,
                  edit = pool.find((x) => x.id === id);
                if (edit) requestMove(edit, col.key);
                setDragged(null);
              }}
            >
              <div className="flex items-center justify-between gap-2 px-1 pt-1 mb-1">
                <h2
                  draggable
                  onDragEnd={() => setReordering(false)}
                  onDragStart={(e) => {
                    setReordering(true);
                    e.stopPropagation();
                    e.dataTransfer.setData(
                      "application/x-patrol-column",
                      col.key,
                    );
                  }}
                  className="font-semibold text-sm flex gap-2 items-center cursor-grab"
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${col.color}`}
                  />
                  {col.title}
                </h2>
                <Badge variant="secondary">
                  {remote && !query && who === "all"
                    ? (store.boardCounts?.[col.key] ?? edits.length)
                    : edits.length}
                </Badge>
              </div>
              <div className="flex gap-1 items-center justify-between px-1 mb-3">
                <p className="text-[11px] text-muted-foreground">
                  {col.description}
                </p>
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    aria-label={`Move ${col.title} column left`}
                    disabled={index === 0}
                    onClick={() => reorder(col.key, order[index - 1])}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    aria-label={`Move ${col.title} column right`}
                    disabled={index === order.length - 1}
                    onClick={() => {
                      const next = [...order];
                      [next[index], next[index + 1]] = [
                        next[index + 1],
                        next[index],
                      ];
                      setOrder(next);
                      try {
                        localStorage.setItem(
                          "patrol-board-order-v1",
                          JSON.stringify(next),
                        );
                      } catch {
                        setMessage("Column order could not be saved.");
                      }
                    }}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="board-cards space-y-3 overflow-y-auto board-scroll pr-1">
                {edits.length ? (
                  edits.map((e) => {
                    const c = store.claims.find((c) => c.editId === e.id),
                      member = store.members.find((m) => m.id === c?.owner);
                    return (
                      <Card
                        key={e.id}
                        data-card-id={e.id}
                        draggable={!offline}
                        onDragStart={(ev) => {
                          ev.stopPropagation();
                          ev.dataTransfer.setData("text/plain", e.id);
                          setDragged(e.id);
                        }}
                        onDragEnd={() => setDragged(null)}
                        className="shadow-sm cursor-grab active:cursor-grabbing"
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex gap-2 justify-between">
                            <Badge
                              variant="outline"
                              className="uppercase text-[10px]"
                            >
                              {e.wiki}
                            </Badge>
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            {c?.outcome === "ok" && (
                              <Badge variant="outline">OK</Badge>
                            )}
                            {c?.outcome === "verified_flagged" && (
                              <Badge variant="outline">Verified flag</Badge>
                            )}
                          </div>
                          <h3 className="font-medium text-sm break-words">
                            <bdi>{e.title}</bdi>
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            <bdi>
                              {c?.returnReason || c?.reason || e.comment}
                            </bdi>
                          </p>
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span
                              className="font-mono min-w-0 truncate"
                              title={e.id}
                            >
                              {e.id}
                            </span>
                            <span>{when(e.time)}</span>
                          </div>
                          <div className="border-t pt-3">
                            {member ? (
                              <span className="flex gap-2 items-center text-xs mb-3">
                                <Avatar name={member.name} />
                                {member.name}
                              </span>
                            ) : (
                              <p className="text-xs text-muted-foreground mb-3">
                                No assignee
                              </p>
                            )}
                            <div className="flex gap-2 flex-wrap">
                              {c && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onOpen(e)}
                                >
                                  Inspect review
                                </Button>
                              )}
                              {["unclaimed", "claimed", "returned"].includes(
                                col.key,
                              ) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={offline || !patrollers.length}
                                  onClick={() => requestAssign(e)}
                                  aria-label={`${c ? "Reassign" : "Assign"} ${e.title}`}
                                >
                                  {c ? "Reassign" : "Assign"}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={offline}
                                aria-label={`Move ${e.title}`}
                                onClick={() => {
                                  if (!targets(e).length) {
                                    setMessage(
                                      "The assigned reviewer must revise the reason and resubmit this review.",
                                    );
                                    return;
                                  }
                                  onRetain?.(e);
                                  setMove({ id: e.id, target: targets(e)[0] });
                                  setReason("");
                                  setMessage("");
                                }}
                              >
                                Move
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    No edits in this column.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <Dialog
        open={!!assign}
        onOpenChange={(v) => {
          if (!v) setAssign(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {store.claims.some((c) => c.editId === assign)
                ? "Reassign edit"
                : "Assign edit"}
            </DialogTitle>
            <DialogDescription>
              <bdi>{selected?.title}</bdi> · Choose an active reviewer. Their My
              Claims table will update.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">Reviewer</label>
          <Choose
            label="Assign to reviewer"
            value={owner}
            onChange={setOwner}
            items={patrollers.map((m) => ({ value: m.id, label: m.name }))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssign(null)}>
              Cancel
            </Button>
            <Button
              disabled={!owner || offline}
              onClick={async () => {
                if (
                  assign &&
                  (await act({
                    type: "reassign",
                    actor,
                    editId: assign,
                    owner,
                  }))
                )
                  setAssign(null);
              }}
            >
              Save assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!move}
        onOpenChange={(v) => {
          if (!v) setMove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move review card</DialogTitle>
            <DialogDescription>
              {moving?.title} · The move is confirmed only after its required
              action succeeds.
            </DialogDescription>
          </DialogHeader>
          {moving && move && (
            <>
              <Choose
                label="Destination column"
                value={move.target}
                onChange={(target) => {
                  setMove({ ...move, target });
                  setReason("");
                }}
                items={targets(moving).map((k) => ({
                  value: k,
                  label: definitions.find((d) => d.key === k)!.title,
                }))}
              />
              {move.target === "returned" ? (
                <>
                  <label htmlFor="board-feedback">
                    Feedback for the reviewer
                  </label>
                  <Textarea
                    id="board-feedback"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={1000}
                  />
                  <p className="text-xs text-muted-foreground">
                    The current owner stays assigned and must review it again.
                  </p>
                </>
              ) : (
                <p className="text-sm">
                  {move.target === "reviewed"
                    ? "Inspect this review and its flag reason before confirming. Verification is an internal team decision."
                    : move.target === "unclaimed"
                      ? "Release this unfinished assignment. Another reviewer can take it."
                      : "Select an owner in the next step."}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setMove(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={
                    offline || (move.target === "returned" && !reason.trim())
                  }
                  onClick={async () => {
                    if (move.target === "claimed") {
                      setMove(null);
                      requestAssign(moving);
                      return;
                    }
                    const type =
                      move.target === "unclaimed"
                        ? "leadRelease"
                        : move.target === "reviewed"
                          ? "verify"
                          : status(moving) === "reviewed"
                            ? "reopen"
                            : "return";
                    if (await act({ type, actor, editId: moving.id, reason }))
                      setMove(null);
                  }}
                >
                  Confirm move
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function Workload({
  store,
  onBoard,
}: {
  store: Store;
  onBoard: () => void;
}) {
  const members = store.members.filter((m) => m.role === "patroller");
  const rows = store.workload
    ? store.workload.map((row) => ({
        member: { ...row.member, role: "patroller" as const },
        active: (row.counts.claimed || 0) + (row.counts.returned || 0),
        ok: row.counts.ok || 0,
        pending: row.counts.flagged || 0,
        flagged: row.counts.verified_flagged || 0,
      }))
    : members.map((m) => ({
        member: m,
        active: store.claims.filter(
          (c) =>
            c.owner === m.id && ["claimed", "returned"].includes(c.outcome),
        ).length,
        ok: store.claims.filter((c) => c.owner === m.id && c.outcome === "ok")
          .length,
        pending: store.claims.filter(
          (c) => c.owner === m.id && c.outcome === "flagged",
        ).length,
        flagged: store.claims.filter(
          (c) => c.owner === m.id && c.outcome === "verified_flagged",
        ).length,
      }));
  const active = rows.reduce((n, r) => n + r.active, 0),
    reviewed = rows.reduce((n, r) => n + r.ok + r.flagged, 0),
    unclaimed =
      store.boardCounts?.unclaimed ??
      store.edits.filter((e) => !store.claims.some((c) => c.editId === e.id))
        .length;
  return (
    <div className="dashboard-content workload-content">
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          [
            "Unclaimed edits",
            unclaimed,
            store.workload
              ? "Available in the shared database queue"
              : "Available in this browser’s observed queue",
          ],
          ["Active claims", active, "Across all reviewers"],
          ["Completed reviews", reviewed, "OK and flagged outcomes"],
        ].map(([title, note, desc]) => (
          <Card key={String(title)}>
            <CardHeader className="pb-2">
              <CardDescription>{title}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{note}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {desc}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              Review workload by reviewer
            </CardTitle>
            <CardDescription className="mt-1">
              {store.workload
                ? "Counts come from the team API. Completed totals cover the active queue; they are not Wikipedia statistics."
                : "Counts are derived from local claims. Completed totals cover all retained team history; they are not Wikipedia statistics."}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onBoard}>
            Open board
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <WorkloadChart rows={rows} />
        </CardContent>
      </Card>
      <Card className="table-card">
        <div className="table-slot">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reviewer</TableHead>
                <TableHead className="text-right">Active claims</TableHead>
                <TableHead className="text-right">Marked OK</TableHead>
                <TableHead className="text-right">
                  Pending verification
                </TableHead>
                <TableHead className="text-right">Verified flags</TableHead>
                <TableHead className="text-right">Total reviewed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.member.id} data-row-id={r.member.id}>
                  <TableCell>
                    {r.member.name}
                    {!r.member.active && (
                      <span className="text-xs text-muted-foreground ml-2">
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{r.active}</TableCell>
                  <TableCell className="text-right">{r.ok}</TableCell>
                  <TableCell className="text-right">{r.pending}</TableCell>
                  <TableCell className="text-right">{r.flagged}</TableCell>
                  <TableCell className="text-right">
                    {r.ok + r.flagged}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
export function EditActivity({
  store,
  live = false,
  remote = false,
  activity,
  onRangeChange,
}: {
  store: Store;
  live?: boolean;
  remote?: boolean;
  activity?: any;
  onRangeChange?: (minutes: number) => void;
}) {
  const [wiki, setWiki] = useState("all"),
    [range, setRange] = useState("60"),
    [view, setView] = useState("chart"),
    [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const minutes = Number(range);
  const {
    bins,
    observations: events,
    total,
    coveredSeconds,
    step,
    start,
  } = activityData(
    {
      ...store,
      observations: (store.observations ?? observe([], store.edits)).filter(
        (e) => wiki === "all" || e.wiki === wiki,
      ),
    },
    minutes,
    live,
    now,
  );
  const max = Math.max(0, ...bins.map((b) => b.count));
  const tops: [string, number][] = remote
    ? (activity?.top_pages || [])
        .filter(
          (p: any) => wiki === "all" || p.wiki.replace(/wiki$/, "") === wiki,
        )
        .map(
          (p: any) =>
            [p.wiki.replace(/wiki$/, "") + ": " + p.title, p.edits] as [
              string,
              number,
            ],
        )
    : Object.entries(
        events.reduce(
          (acc, e) => {
            acc[e.wiki + ": " + e.title] =
              (acc[e.wiki + ": " + e.title] || 0) + e.count;
            return acc;
          },
          {} as Record<string, number>,
        ),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
  const wikis = new Set(events.map((e) => e.wiki)).size;
  return (
    <div className="dashboard-content activity-content">
      <div className="flex gap-3 flex-wrap">
        <Choose
          label="Activity wiki"
          value={wiki}
          onChange={setWiki}
          className="w-44 bg-card"
          items={[
            { value: "all", label: "All wikis" },
            { value: "en", label: "English" },
            { value: "ar", label: "Arabic" },
            { value: "ja", label: "Japanese" },
          ]}
        />
        <Choose
          label="Activity time range"
          value={range}
          onChange={(value) => {
            setRange(value);
            onRangeChange?.(Number(value));
          }}
          className="w-44 bg-card"
          items={[
            { value: "15", label: "Last 15 minutes" },
            { value: "60", label: "Last 60 minutes" },
          ]}
        />
        <Button
          variant="outline"
          className="ml-auto"
          onClick={() =>
            DownloadCSV("patrol-edit-activity.csv", [
              ["Time", "Observed edits", "Coverage", "Observed seconds"],
              ...bins.map((b) => [
                fullWhen(b.time),
                String(b.count),
                b.partial ? "Partial" : "Complete",
                String(Math.round(b.coveredSeconds)),
              ]),
            ])
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Export activity
        </Button>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          [
            remote ? "Admitted edits" : "Observed edits",
            events.reduce((n, e) => n + e.count, 0),
          ],
          ["Active wikis", wikis],
          [
            "Edits / minute",
            (total / Math.max(1 / 60, coveredSeconds / 60)).toFixed(2),
          ],
        ].map(([title, count]) => (
          <Card key={String(title)}>
            <CardHeader className="pb-3">
              <CardDescription>{title}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{count}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {remote
                ? "Shared queue activity · selected window"
                : "Observed stream activity · selected window"}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="activity-main">
        <CardHeader className="flex-row justify-between items-center">
          <div>
            <CardTitle className="text-base">Wikipedia edit activity</CardTitle>
            <CardDescription className="mt-1">
              Observed edits per {step / 60000}-minute interval ·{" "}
              {live
                ? `available since ${when(start)}`
                : `last ${minutes} minutes`}
            </CardDescription>
          </div>
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="chart">Chart</TabsTrigger>
              <TabsTrigger value="table">Table</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {view === "chart" ? (
            <>
              <ActivityChart key={`${wiki}:${range}`} bins={bins} />
              <p className="text-xs text-muted-foreground">
                {total} observed edits. Peak interval: {max} edits. Select a
                wiki to show or hide it. Hover a bar for counts and coverage.
              </p>
            </>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interval start</TableHead>
                  <TableHead className="text-right">Observed edits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bins.map((b) => (
                  <TableRow key={b.time} data-row-id={b.time}>
                    <TableCell>{when(b.time)}</TableCell>
                    <TableCell className="text-right">
                      {b.count}
                      {b.partial && (
                        <span className="ml-2 text-xs text-amber-700">
                          Partial coverage
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="border-t pt-3 mt-3 text-xs text-muted-foreground">
            {remote
              ? "Edits admitted to the team database, including archived records. Missing minute bins are zero admissions."
              : live
                ? `Stream observations since ${fullWhen(store.observationStart || now)}. Recent snapshot rows are excluded. Connection gaps are not zero-edit periods. Counts are independent of feed retention.`
                : "Example activity, including seeded history. Counts are independent of feed retention."}{" "}
            These are not Wikipedia-wide totals.
          </p>
        </CardContent>
      </Card>
      <Card className="activity-pages">
        <CardHeader>
          <CardTitle className="text-base">
            Most edited pages in this window
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tops.length ? (
            tops.map(([title, count]) => (
              <div
                key={title}
                className="flex justify-between gap-4 py-3 border-b last:border-0 text-sm"
              >
                <bdi className="break-words">{title}</bdi>
                <span className="tabular-nums whitespace-nowrap text-muted-foreground">
                  {count} edits
                </span>
              </div>
            ))
          ) : (
            <Empty
              title="No activity"
              text="Choose a wider time window or another wiki."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
export function Members({
  store,
  act,
  offline,
  actor,
  remote = false,
}: {
  actor: string;
  remote?: boolean;
  store: Store;
  act: (a: Action) => boolean | Promise<boolean>;
  offline: boolean;
}) {
  const [query, setQuery] = useState(""),
    [add, setAdd] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [memberRole, setMemberRole] = useState<Member["role"]>("patroller"),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [editRole, setEditRole] = useState<Member["role"]>("patroller"),
    [active, setActive] = useState(true);
  const members = store.members.filter((m) =>
    (m.name + " " + m.email).toLowerCase().includes(query.toLowerCase()),
  );
  const selected = store.members.find((m) => m.id === editing);
  return (
    <>
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            aria-label="Search members"
            className="pl-9 bg-card"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
          />
        </div>
        <Button
          disabled={offline}
          onClick={() => {
            setAdd(true);
            setName("");
            setEmail("");
            setMemberRole("patroller");
            setError("");
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add member
        </Button>
      </div>
      <Card className="table-card">
        {members.length ? (
          <div className="table-slot">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id} data-row-id={m.id}>
                    <TableCell>
                      <div className="flex gap-3 items-center">
                        <Avatar name={m.name} />
                        <div>
                          <p className="text-sm font-medium">{m.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {m.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{roleInfo[m.role].label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full mr-2 ${m.active ? "bg-emerald-500" : "bg-zinc-400"}`}
                      />
                      {m.active ? "Active" : "Inactive"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={offline}
                        onClick={() => {
                          setEditing(m.id);
                          setEditRole(m.role);
                          setActive(m.active);
                          setError("");
                        }}
                        aria-label={`Manage ${m.name}`}
                      >
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty title="No members found" text="Try another name or email." />
        )}
      </Card>
      <p className="text-xs text-muted-foreground mt-4">
        {remote
          ? "Adding a member creates a database account. Share their password separately; no invitation email is sent."
          : "Adding a member creates a demo record. It does not send an invitation email."}
      </p>
      <Dialog open={add} onOpenChange={setAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              {remote
                ? "Create a team account and assign its role."
                : "Create a member in the demo workspace and assign their role."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              if (!name.trim()) {
                setError("Enter the member’s name.");
                return;
              }
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                setError("Enter a valid email address.");
                return;
              }
              if (
                store.members.some(
                  (m) => m.email.toLowerCase() === email.trim().toLowerCase(),
                )
              ) {
                setError("A member with this email already exists.");
                return;
              }
              if (remote && password.length < 12) {
                setError(
                  "Enter an initial password of at least 12 characters.",
                );
                return;
              }
              if (
                await act({
                  type: "addMember",
                  password,
                  actor,
                  member: {
                    id: crypto.randomUUID(),
                    name: name.trim(),
                    email: email.trim(),
                    role: memberRole,
                    active: true,
                  },
                })
              )
                setAdd(false);
            }}
            noValidate
            className="space-y-4"
          >
            <div className="space-y-2">
              <label htmlFor="member-name" className="text-sm font-medium">
                Full name
              </label>
              <Input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="member-email" className="text-sm font-medium">
                Email address
              </label>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={150}
              />
            </div>
            {remote && (
              <div className="space-y-2">
                <label
                  htmlFor="member-password"
                  className="text-sm font-medium"
                >
                  Initial password
                </label>
                <Input
                  id="member-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  Share this password with the member separately.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Choose
                label="New member role"
                value={memberRole}
                onChange={(r) => setMemberRole(r as Member["role"])}
                items={Object.entries(roleInfo).map(([value, r]) => ({
                  value,
                  label: r.label,
                }))}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdd(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={offline}>
                Create member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage member</DialogTitle>
            <DialogDescription>
              {selected?.name} · {selected?.email}
            </DialogDescription>
          </DialogHeader>
          <Choose
            label="Member role"
            value={editRole}
            onChange={(r) => setEditRole(r as Member["role"])}
            items={Object.entries(roleInfo).map(([value, r]) => ({
              value,
              label: r.label,
            }))}
          />
          <label className="text-sm flex gap-2 items-center">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active workspace access
          </label>
          {selected &&
            store.claims.some(
              (c) =>
                c.owner === selected.id &&
                ["claimed", "returned", "flagged"].includes(c.outcome),
            ) && (
              <p role="status" className="text-sm text-amber-700">
                This member has unfinished reviews. Keep access active until the
                lead transfers that work.
              </p>
            )}
          <p className="text-xs text-muted-foreground">
            Unfinished claims must be reassigned or released before this member
            loses reviewer access.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={offline}
              onClick={async () => {
                if (!selected) return;
                if (
                  selected.role !== editRole &&
                  !(await act({
                    type: "member",
                    actor,
                    id: selected.id,
                    role: editRole,
                  }))
                )
                  return;
                if (
                  selected.active !== active &&
                  !(await act({
                    type: "member",
                    actor,
                    id: selected.id,
                    active,
                  }))
                )
                  return;
                setEditing(null);
              }}
            >
              Save member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function AuditLog({
  store,
  remote = false,
}: {
  store: Store;
  remote?: boolean;
}) {
  const [exportError, setExportError] = useState("");
  const [query, setQuery] = useState(""),
    [actor, setActor] = useState("all"),
    [action, setAction] = useState("all"),
    [gridIds, setGridIds] = useState<string[] | null>(null);
  const updateGridIds = React.useCallback(
    (ids: string[]) =>
      setGridIds((old) =>
        JSON.stringify(old) === JSON.stringify(ids) ? old : ids,
      ),
    [],
  );
  const actions = [...new Set(store.audit.map((a) => a.action))];
  const name = (id: string) =>
    store.members.find((m) => m.id === id)?.name || id;
  const filtered = store.audit.filter(
    (a) =>
      (actor === "all" || a.actor === actor) &&
      (action === "all" || a.action === action) &&
      `${a.action} ${a.target} ${a.detail} ${a.editId || ""} ${name(a.actor)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="flex gap-3 flex-wrap mb-5">
        <div className="relative flex-1 min-w-52">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            aria-label="Search audit log"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions, pages or reasons…"
            className="pl-9 bg-card"
          />
        </div>
        <Choose
          label="Audit actor"
          value={actor}
          onChange={setActor}
          className="w-40 bg-card"
          items={[
            { value: "all", label: "All members" },
            ...store.members.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
        <Choose
          label="Audit action"
          value={action}
          onChange={setAction}
          className="w-44 bg-card"
          items={[
            { value: "all", label: "All actions" },
            ...actions.map((a) => ({ value: a, label: a })),
          ]}
        />
        <Button
          variant="outline"
          onClick={async () => {
            if (!remote) {
              DownloadCSV("patrol-audit-log.csv", [
                [
                  "Timestamp",
                  "Actor",
                  "Action",
                  "Target",
                  "Detail",
                  "Wiki",
                  "Edit ID",
                  "Old revision",
                  "New revision",
                ],
                ...filtered
                  .filter((a) => !gridIds || gridIds.includes(a.id))
                  .map((a) => [
                    new Date(a.time).toISOString(),
                    name(a.actor),
                    a.action,
                    a.target,
                    a.detail,
                    a.wiki || "",
                    a.editId || "",
                    String(a.oldRev ?? ""),
                    String(a.newRev ?? ""),
                  ]),
              ]);
              return;
            }
            try {
              const records = await backend.auditExport();
              const ids = new Set(
                filtered
                  .filter((a) => !gridIds || gridIds.includes(a.id))
                  .map((a) => a.id),
              );
              DownloadCSV("wikiwatch-audit.csv", [
                records[0],
                ...records.slice(1).filter((row: string[]) => ids.has(row[0])),
              ]);
              setExportError("");
            } catch (e) {
              setExportError((e as Error).message);
            }
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>
      {exportError && <p role="alert">{exportError}</p>}
      <Card className="table-card">
        <div className="px-5 py-3 border-b text-xs text-muted-foreground">
          {filtered.length} matching actions · Export includes every matching
          row, across all pages.
        </div>
        {filtered.length ? (
          <div className="table-slot">
            <Table pageSize={10} onFilteredRowsChange={updateGridIds}>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id} data-row-id={a.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {fullWhen(a.time)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {name(a.actor)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">
                        {a.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-56 break-words">
                      <bdi>{a.target}</bdi>
                      {a.editId && (
                        <p className="text-[10px] font-mono">
                          {a.wiki} · {a.editId}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-64 break-words">
                      <bdi>{a.detail || "—"}</bdi>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty
            title="No matching actions"
            text="Clear filters or perform a review action to create an audit entry."
          />
        )}
      </Card>
    </>
  );
}
function Guide({ onRole, role }: { role: Role; onRole: (r: Role) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          {
            role: "patroller",
            title: "Review an edit",
            steps:
              "Live feed → open Climate change → inspect split or unified diff → Claim edit → Mark OK or Raise flag → My Claims → View diff. Select rows before opening a batch. Add browser-local inline threads.",
          },
          {
            role: "lead",
            title: "Coordinate the queue",
            steps:
              "Claim Board → Assign an unclaimed edit → choose Dev or Amir → drag a flagged review to Returned with feedback → Workload updates → Live feed remains read-only.",
          },
          {
            role: "admin",
            title: "Manage and inspect",
            steps:
              "Edit Activity → filter or view table → Members → Add member → Audit Log → search the action → Export CSV.",
          },
        ]
          .filter((x) => x.role === role)
          .map((x) => (
            <div key={x.role} className="border rounded-lg p-4">
              <h3 className="font-medium text-sm">{x.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed my-3">
                {x.steps}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRole(x.role as Role)}
              >
                Open {roleInfo[x.role as Role].label}
              </Button>
            </div>
          ))}
      </div>
      <div className="rounded-lg bg-muted p-4">
        <h3 className="text-sm font-semibold mb-2">Diff viewer interactions</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Real edits fetch their exact old/new source revisions on review.
          Switch Split / Unified, search text, navigate matches, show changes
          only, and toggle line wrapping. Diff review has its own route. Add
          line or selected-text comments, then refresh to restore them. Inspect
          flagged reviews from the board; verify them or return them with
          feedback. Example mode includes Arabic, Japanese, hostile text and an
          unchanged revision. Real mode uses public article edits and source
          text.
        </p>
      </div>
      <h3 className="font-semibold text-sm">
        Nonfunctional requirements for the assignment
      </h3>
      <ul className="list-disc pl-5 text-xs leading-relaxed space-y-2 text-muted-foreground">
        <li>
          <b className="text-foreground">Accessibility:</b> keyboard-operable
          controls, named dialogs, focus trapping and restoration, visible
          focus, chart table alternative, batched stream announcements.
        </li>
        <li>
          <b className="text-foreground">Performance:</b> bounded stream
          retention, batched rendering, request cancellation, virtualize a large
          production feed; measure interaction latency and heap growth on a
          fixed replay workload.
        </li>
        <li>
          <b className="text-foreground">Consistency:</b> one confirmed claim
          owner, explicit conflicts, accurate derived workloads, no stale diff
          overwrite, duplicate-safe reconnect.
        </li>
        <li>
          <b className="text-foreground">Security:</b> treat wiki text and notes
          as untrusted; never render raw HTML; enforce permissions in the
          supplied data service; neutralize spreadsheet formulas in CSV exports.
        </li>
        <li>
          <b className="text-foreground">Resilience:</b> distinct disconnected,
          loading, unavailable and empty states; browsing available during
          outages; never imply an offline claim is confirmed.
        </li>
        <li>
          <b className="text-foreground">Responsive / i18n:</b> support narrow
          screens, mixed RTL/LTR text, CJK and long titles; locale-aware dates.
        </li>
        <li>
          <b className="text-foreground">Maintainability:</b> reusable shadcn
          components, separate UI and data adapters, deterministic fixtures,
          behavior tests and documented decisions.
        </li>
      </ul>
      <p className="text-xs text-muted-foreground border-t pt-3">
        The prototype demonstrates interactions; the production nonfunctional
        criteria must be validated against real integrations. No backend
        implementation is assigned to trainees.
      </p>
    </div>
  );
}
