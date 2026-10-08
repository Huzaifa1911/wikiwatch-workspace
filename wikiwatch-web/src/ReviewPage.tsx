import { backend, API_HOST, apiAnchor, threadFromAPI } from "./backend";
import React, { useState, useRef } from "react";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog";
import { DiffViewer, type Line } from "./DiffViewer";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCircle2,
  MessageSquare,
  Folder,
} from "lucide-react";
import {
  anchorFromRange,
  validAnchor,
  renderSafeTree,
  previewTree,
  PREVIEW_TEXT,
  type Anchor,
  type Comment,
} from "./annotations";
import { revisionPair } from "./wiki";
import type { Store, Edit, Action } from "./model";
type Props = {
  edit: Edit;
  store: Store;
  actor: string;
  role: string;
  act: (a: Action) => boolean | Promise<boolean>;
  offline: boolean;
  onBack: () => void;
  batchIds?: string[];
  onLoaded?: (id: string, edit?: Edit) => void;
  remote?: boolean;
  preferences?: any;
};
function loadComments(key: string): Comment[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? value.filter(
          (c) =>
            c &&
            typeof c.id === "string" &&
            typeof c.body === "string" &&
            typeof c.author === "string" &&
            typeof c.resolved === "boolean" &&
            Array.isArray(c.replies) &&
            c.replies.every(
              (r: any) =>
                typeof r.id === "string" &&
                typeof r.body === "string" &&
                typeof r.author === "string",
            ) &&
            c.anchor &&
            ["old", "new", "preview"].includes(c.anchor.side) &&
            Number.isInteger(c.anchor.start) &&
            Number.isInteger(c.anchor.end) &&
            typeof c.anchor.exact === "string" &&
            typeof c.anchor.revisionKey === "string",
        )
      : [];
  } catch {
    return [];
  }
}
export default function ReviewWorkspace(props: Props) {
  const { edit, store, role, onBack } = props;
  const [ids] = useState<string[]>(
    () =>
      props.batchIds ||
      new URLSearchParams(window.location.hash.split("?")[1] || "")
        .get("batch")
        ?.split(",")
        .filter(Boolean) || [edit.id],
  );
  const [activePage, setActivePage] = useState(edit.id),
    [collapsedWikis, setCollapsedWikis] = useState<string[]>([]);
  function reveal(id: string) {
    setActivePage(id);
    window.dispatchEvent(new CustomEvent("reveal-review-page", { detail: id }));
    (
      window.requestAnimationFrame ||
      ((fn: FrameRequestCallback) => window.setTimeout(fn, 0))
    )(() => {
      const el = document.getElementById(`file-${id}`);
      el?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
      });
      el?.querySelector<HTMLElement>("[data-file-toggle]")?.focus({
        preventScroll: true,
      });
    });
  }
  const files = ids
    .map((id) => store.edits.find((e) => e.id === id))
    .filter(Boolean) as Edit[];
  React.useEffect(() => {
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((e) => e.isIntersecting);
        if (entry) setActivePage(entry.target.id.replace("file-", ""));
      },
      {
        root: document.querySelector("[data-workspace-scroll]"),
        rootMargin: "-12px 0px -60% 0px",
      },
    );
    files.forEach((e) => {
      const node = document.getElementById(`file-${e.id}`);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [ids]);
  return (
    <div className="space-y-5">
      <Button variant="outline" onClick={onBack}>
        ← Back to {role === "lead" ? "claim board" : "workspace"}
      </Button>
      <div className="flex gap-3 items-center">
        <div className="bg-muted border rounded-lg p-3">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Changes to review</h1>
          <p className="text-xs text-muted-foreground">
            {files.length} independent edits ·{" "}
            {files.length > 1 ? "Selected review batch" : "Single edit"} · Notes
            stored in this browser
          </p>
        </div>
      </div>
      <div className="review-layout grid lg:grid-cols-[220px_minmax(0,1fr)] gap-5 items-start">
        <aside className="review-tree lg:sticky lg:top-24 rounded-lg border bg-card p-3">
          <p className="text-xs font-semibold px-2 pb-3">
            CHANGED PAGES / REVISIONS
          </p>
          <nav aria-label="Changed pages tree" className="space-y-1">
            {[...new Set(files.map((e) => e.wiki))].map((wiki) => (
              <div key={wiki}>
                <button
                  className="w-full flex gap-2 items-center text-left text-xs font-semibold px-2 py-2"
                  aria-expanded={!collapsedWikis.includes(wiki)}
                  aria-label={`Toggle ${wiki} wiki pages`}
                  onClick={() =>
                    setCollapsedWikis((x) =>
                      x.includes(wiki)
                        ? x.filter((w) => w !== wiki)
                        : [...x, wiki],
                    )
                  }
                >
                  {collapsedWikis.includes(wiki) ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  {wiki}.wikipedia.org
                </button>
                {!collapsedWikis.includes(wiki) && (
                  <ul className="ml-4 border-l pl-2 space-y-1">
                    {files
                      .filter((e) => e.wiki === wiki)
                      .map((e) => (
                        <li key={e.id}>
                          <button
                            aria-current={
                              activePage === e.id ? "page" : undefined
                            }
                            className={`w-full text-left text-xs rounded-md p-2 flex gap-2 ${activePage === e.id ? "bg-muted font-medium" : "hover:bg-muted"}`}
                            onClick={() => reveal(e.id)}
                          >
                            <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>
                              <bdi className="break-words">{e.title}</bdi>
                              <span className="block text-[10px] font-mono text-muted-foreground">
                                {e.oldRev ?? "example"} → {e.newRev ?? e.id}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            ))}
          </nav>
        </aside>
        <div className="space-y-5 min-w-0">
          {files.map((e) => (
            <LoadedReview
              key={e.id}
              {...props}
              edit={e}
              primary={e.id === edit.id}
              onAdvance={() => {
                const i = files.findIndex((f) => f.id === e.id);
                if (files[i + 1]) reveal(files[i + 1].id);
                else document.getElementById("review-end")?.focus();
              }}
            />
          ))}
          <p
            id="review-end"
            tabIndex={-1}
            className="text-xs text-muted-foreground py-4 outline-none"
          >
            End of changes
          </p>
        </div>
      </div>
    </div>
  );
}
function LoadedReview(
  props: Props & { onAdvance: () => void; primary: boolean },
) {
  const [edit, setEdit] = useState(props.edit),
    [status, setStatus] = useState(
      props.edit.source === "wiki" ? "loading" : "ready",
    ),
    [failure, setFailure] = useState(""),
    [retry, setRetry] = useState(0);
  React.useEffect(() => {
    const c = new AbortController();
    if (props.offline && props.edit.contentStatus === "ready") {
      setEdit(props.edit);
      setStatus("ready");
      return;
    }
    setStatus(props.edit.source === "wiki" ? "loading" : "ready");
    revisionPair(props.edit, c.signal)
      .then((e) => {
        if (!c.signal.aborted) {
          setEdit(e);
          setStatus("ready");
          props.onLoaded?.(e.id, e);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setFailure(e.message);
          setStatus("unavailable");
        }
      });
    return () => c.abort();
  }, [props.edit.id, retry, props.offline]);
  if (status === "ready") return <ReviewFile {...props} edit={edit} />;
  return (
    <section
      id={`file-${props.edit.id}`}
      aria-label={`Changed page ${props.edit.id}`}
      className="border rounded-lg p-5 space-y-3"
    >
      <h3>{props.edit.title}</h3>
      <p className="text-xs font-mono">
        {props.edit.wiki} · {props.edit.oldRev || "Empty page"} →{" "}
        {props.edit.newRev}
      </p>
      {status === "loading" ? (
        <p role="status">Loading exact revision content…</p>
      ) : (
        <>
          <p role="alert">
            {failure} This edit cannot be reviewed until its content is
            available.
          </p>
          <Button
            data-file-toggle
            variant="outline"
            onClick={() => setRetry((x) => x + 1)}
          >
            Retry content
          </Button>
        </>
      )}
    </section>
  );
}
function ReviewFile({
  edit,
  store,
  actor,
  role,
  act,
  offline,
  onAdvance,
  primary,
  remote = false,
  preferences,
}: Props & { onAdvance: () => void; primary: boolean }) {
  const key = remote
      ? `wikiwatch-comments:${API_HOST}:${actor}:${edit.backendId}`
      : `patrol-comments-v2:${edit.wiki}:${edit.id}`,
    progressKey = `patrol-viewed-v1:${actor}:${edit.wiki}:${edit.id}`;
  const [comments, setComments] = useState<Comment[]>(() =>
      loadComments(key).map((c) =>
        c.anchor.side === "preview" && edit.after === PREVIEW_TEXT
          ? {
              ...c,
              anchor: {
                ...c.anchor,
                side: "new",
                revisionKey: c.anchor.revisionKey.replace(":preview:", ":new:"),
              },
            }
          : c,
      ),
    ),
    [anchor, setAnchor] = useState<Anchor | null>(null),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [focus, setFocus] = useState<Anchor>(),
    [reason, setReason] = useState(""),
    [feedback, setFeedback] = useState(""),
    [reply, setReply] = useState(""),
    [replyTo, setReplyTo] = useState<string | null>(null),
    [viewed, setViewed] = useState(() => {
      try {
        return remote
          ? !!preferences?.viewed_edit_ids.includes(edit.backendId)
          : localStorage.getItem(progressKey) === "true";
      } catch {
        return false;
      }
    }),
    [showThreads, setShowThreads] = useState(false),
    [open, setOpen] = useState(true),
    [expandedThreads, setExpandedThreads] = useState<string[]>([]),
    [deleting, setDeleting] = useState<string | null>(null),
    [selectionMenu, setSelectionMenu] = useState<{
      anchor: Anchor;
      x: number;
      y: number;
    } | null>(null);
  const scope = useRef<HTMLDivElement>(null),
    menuRef = useRef<HTMLDivElement>(null),
    menuItem = useRef<HTMLButtonElement>(null),
    menuOpener = useRef<HTMLElement | null>(null);
  const permitted = store.members.some(
    (m) => m.id === actor && m.active && m.role === role,
  );
  const sources = {
    old: edit.before,
    new: edit.after,
    preview: edit.after === PREVIEW_TEXT ? PREVIEW_TEXT : "",
  };
  const claim = store.claims.find((c) => c.editId === edit.id),
    owned = claim?.owner === actor,
    canReview =
      owned && (claim?.outcome === "claimed" || claim?.outcome === "returned");
  const validComments = React.useMemo(
    () =>
      comments.filter((c) =>
        validAnchor(c.anchor, sources[c.anchor.side], edit.id),
      ),
    [comments, edit],
  );
  const active = validComments.filter((c) => !c.resolved).map((c) => c.anchor);
  React.useEffect(() => {
    const reveal = (e: Event) => {
      if ((e as CustomEvent).detail === edit.id) setOpen(true);
    };
    window.addEventListener("reveal-review-page", reveal);
    return () => window.removeEventListener("reveal-review-page", reveal);
  }, [edit.id]);
  const [commentBusy, setCommentBusy] = useState(false),
    [loadingComments, setLoadingComments] = useState(remote);
  const saving = useRef(false);
  React.useEffect(() => {
    if (!remote || !edit.backendId) return;
    let mounted = true;
    async function reload() {
      if (saving.current) return;
      try {
        const rows = await backend.all(`/edits/${edit.backendId}/threads`);
        if (mounted) {
          const comments = rows.map((row) => threadFromAPI(edit, row));
          setComments(comments);
          try {
            localStorage.setItem(key, JSON.stringify(comments));
          } catch {}
          setError("");
        }
      } catch (error) {
        if (mounted)
          setError("Comments unavailable: " + (error as Error).message);
      } finally {
        if (mounted) setLoadingComments(false);
      }
    }
    void reload();
    window.addEventListener("wikiwatch-team-update", reload);
    return () => {
      mounted = false;
      window.removeEventListener("wikiwatch-team-update", reload);
    };
  }, [remote, edit.backendId]);
  async function save(next: Comment[]) {
    if (!permitted || (remote && offline) || saving.current) {
      setError(
        remote
          ? "Reconnect before changing comments."
          : "Select an active workspace account to comment.",
      );
      return false;
    }
    saving.current = true;
    setCommentBusy(true);
    try {
      let confirmed = next;
      if (remote) {
        const added = next.find(
          (c) => !comments.some((old) => old.id === c.id),
        );
        const removed = comments.find(
          (c) => !next.some((row) => row.id === c.id),
        );
        const changed = next.find((c) => {
          const old = comments.find((row) => row.id === c.id);
          return (
            old &&
            (old.resolved !== c.resolved ||
              old.replies.length !== c.replies.length)
          );
        });
        if (added) {
          const row = await backend.request(
            `/edits/${edit.backendId}/threads`,
            {
              method: "POST",
              body: { anchor: apiAnchor(edit, added.anchor), body: added.body },
            },
          );
          const persisted = threadFromAPI(edit, row);
          confirmed = next.map((c) => (c.id === added.id ? persisted : c));
          setExpandedThreads((ids) => [...ids, persisted.id]);
        } else if (removed)
          await backend.request(`/threads/${removed.id}`, {
            method: "DELETE",
            body: { version: (removed as any).version },
          });
        else if (changed) {
          const old = comments.find((c) => c.id === changed.id)!;
          if (old.resolved !== changed.resolved) {
            const row = await backend.request(`/threads/${changed.id}`, {
              method: "PATCH",
              body: {
                version: (old as any).version,
                resolved: changed.resolved,
              },
            });
            confirmed = next.map((c) =>
              c.id === changed.id ? threadFromAPI(edit, row) : c,
            );
          } else {
            const reply = changed.replies.at(-1)!;
            const row = await backend.request(
              `/threads/${changed.id}/comments`,
              { method: "POST", body: { body: reply.body } },
            );
            confirmed = next.map((c) =>
              c.id === changed.id
                ? {
                    ...c,
                    version: ((old as any).version || 1) + 1,
                    replies: c.replies.map((r) =>
                      r.id === reply.id
                        ? { id: row.id, author: row.author_id, body: row.body }
                        : r,
                    ),
                  }
                : c,
            );
          }
        }
      }
      setComments(confirmed);
      try {
        localStorage.setItem(key, JSON.stringify(confirmed));
      } catch {
        if (!remote) throw Error("Browser storage is unavailable");
      }
      setError("");
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      saving.current = false;
      setCommentBusy(false);
    }
  }
  function openSelectionMenu(
    event: React.MouseEvent | React.KeyboardEvent | KeyboardEvent,
  ) {
    if (!permitted || event.defaultPrevented) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (
      !scope.current?.contains(range.startContainer) ||
      !scope.current?.contains(range.endContainer)
    )
      return;
    try {
      const a = anchorFromRange(range, sources, edit.id);
      if (!a) return;
      if ("clientX" in event) {
        const textHost = (event.target as Element).closest?.(
          "[data-review-text]",
        );
        if (
          !textHost ||
          textHost.getAttribute("data-side") !== a.side ||
          !range.intersectsNode(textHost)
        )
          return;
        const boxes = Array.from(range.getClientRects?.() || []);
        if (
          boxes.length &&
          !boxes.some(
            (r) =>
              event.clientX >= r.left &&
              event.clientX <= r.right &&
              event.clientY >= r.top &&
              event.clientY <= r.bottom,
          )
        )
          return;
      }
      event.preventDefault();
      const rect =
        range.getBoundingClientRect?.() ||
        scope.current.getBoundingClientRect();
      const x = "clientX" in event ? event.clientX : rect.left,
        y = "clientY" in event ? event.clientY : rect.bottom;
      menuOpener.current =
        (event.target as Element).closest<HTMLElement>("[tabindex]") ||
        scope.current.querySelector<HTMLElement>("[data-file-toggle]");
      setSelectionMenu({
        anchor: a,
        x: Math.max(8, Math.min(x, window.innerWidth - 220)),
        y: Math.max(8, Math.min(y, window.innerHeight - 64)),
      });
      setError("");
    } catch {
      return;
    }
  }
  React.useEffect(() => {
    if (!selectionMenu) return;
    menuItem.current?.focus({ preventScroll: true });
    const dismiss = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setSelectionMenu(null);
    };
    const scroll = () => setSelectionMenu(null);
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", scroll);
    };
  }, [selectionMenu]);
  React.useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))
        openSelectionMenu(e);
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [edit.id]);
  React.useEffect(() => {
    if (anchor)
      scope.current
        ?.querySelector<HTMLTextAreaElement>("[data-review-comment]")
        ?.focus();
  }, [anchor]);
  const anchorLines = useRef(new WeakMap<Anchor, number>());
  const lineFor = (a: Anchor) => {
    let line = anchorLines.current.get(a);
    if (line === undefined) {
      line = sources[a.side]
        .slice(0, Math.max(a.start, a.end - 1))
        .split("\n").length;
      anchorLines.current.set(a, line);
    }
    return line;
  };
  const matches = (a: Anchor, r: Line) =>
    a.side !== "preview" && (a.side === "old" ? r.old : r.next) === lineFor(a);
  function composer() {
    return (
      anchor && (
        <form
          className="p-4 bg-blue-50 dark:bg-blue-950/30 border-y border-blue-200 space-y-3"
          data-testid="inline-composer"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) {
              setError("Enter a comment.");
              return;
            }
            const id = crypto.randomUUID();
            if (
              await save([
                ...comments,
                {
                  id,
                  anchor,
                  body: body.trim(),
                  author: actor,
                  createdAt: Date.now(),
                  resolved: false,
                  replies: [],
                },
              ])
            ) {
              setExpandedThreads((x) => [...x, id]);
              setAnchor(null);
              setBody("");
            }
          }}
        >
          <p className="text-xs text-muted-foreground">
            {anchor.side} revision · line {lineFor(anchor)}
          </p>
          <q className="block text-sm break-words">{anchor.exact}</q>
          <label
            htmlFor={`review-comment-${edit.id}`}
            className="text-sm font-medium"
          >
            Comment
          </label>
          <Textarea
            data-review-comment
            id={`review-comment-${edit.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            placeholder="Leave a comment on this line…"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={!body.trim() || commentBusy || (remote && offline)}
            >
              Save comment
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAnchor(null)}
            >
              Cancel comment
            </Button>
          </div>
        </form>
      )
    );
  }
  function thread(c: Comment) {
    const valid = validComments.includes(c),
      expanded = expandedThreads.includes(c.id);
    const name = store.members.find((m) => m.id === c.author)?.name || c.author;
    return (
      <article
        key={c.id}
        data-testid="inline-thread"
        className="my-2 mx-3 rounded-md border bg-background"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-label={`${expanded ? "Collapse" : "Expand"} thread on ${c.anchor.side} line ${lineFor(c.anchor)}`}
            aria-expanded={expanded}
            onClick={() =>
              setExpandedThreads((x) =>
                x.includes(c.id) ? x.filter((id) => id !== c.id) : [...x, c.id],
              )
            }
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            <span className="h-6 w-6 shrink-0 rounded-full bg-muted text-[10px] flex items-center justify-center font-semibold">
              {name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="text-xs font-medium truncate">{name}</span>
            <span className="text-[10px] text-muted-foreground">
              {c.resolved
                ? "Resolved"
                : `${c.replies.length + 1} ${c.replies.length ? "comments" : "comment"}`}
            </span>
          </button>
          <details className="relative">
            <summary
              aria-label="Thread actions"
              className="list-none text-muted-foreground cursor-pointer px-2 rounded hover:bg-muted"
            >
              ···
            </summary>
            <div className="absolute right-0 top-6 z-20 bg-popover border rounded-md shadow-md p-1 w-36">
              <Button
                className="w-full justify-start"
                size="sm"
                variant="ghost"
                disabled={!valid}
                onClick={() => setFocus({ ...c.anchor })}
              >
                Jump to text
              </Button>
              {c.author === actor && (
                <Button
                  className="w-full justify-start text-destructive"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting(c.id)}
                >
                  Delete comment
                </Button>
              )}
            </div>
          </details>
        </div>
        {!valid && (
          <p className="px-3 py-2 text-xs text-amber-700">
            This text changed. The saved location is unavailable.
          </p>
        )}
        {expanded ? (
          <div>
            <div className="px-4 py-3">
              <p className="whitespace-pre-wrap break-words text-sm">
                {c.body}
              </p>
              {c.anchor.exact && (
                <details className="mt-2">
                  <summary className="text-[10px] text-muted-foreground cursor-pointer">
                    Selected text
                  </summary>
                  <q className="block mt-1 text-xs text-muted-foreground break-words">
                    {c.anchor.exact}
                  </q>
                </details>
              )}
            </div>
            {c.replies.map((r) => (
              <div key={r.id} className="px-4 py-3 border-t">
                <p className="text-[10px] font-medium mb-1">
                  {store.members.find((m) => m.id === r.author)?.name ||
                    r.author}
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {r.body}
                </p>
              </div>
            ))}
            <div className="border-t bg-muted/20 p-3">
              {replyTo === c.id ? (
                <form
                  className="space-y-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      reply.trim() &&
                      (await save(
                        comments.map((x) =>
                          x.id === c.id
                            ? {
                                ...x,
                                replies: [
                                  ...x.replies,
                                  {
                                    id: crypto.randomUUID(),
                                    body: reply.trim(),
                                    author: actor,
                                  },
                                ],
                              }
                            : x,
                        ),
                      ))
                    )
                      setReplyTo(null);
                  }}
                >
                  <Textarea
                    autoFocus
                    aria-label="Reply text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    maxLength={2000}
                    placeholder="Write a reply…"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={
                        !reply.trim() || commentBusy || (remote && offline)
                      }
                    >
                      Save reply
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setReplyTo(null)}
                    >
                      Cancel reply
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex gap-2 items-center">
                  <button
                    aria-label="Reply"
                    className="flex-1 rounded-md border bg-background text-left text-xs text-muted-foreground px-3 py-2"
                    disabled={
                      commentBusy || (remote && (offline || c.resolved))
                    }
                    onClick={() => {
                      setReplyTo(c.id);
                      setReply("");
                    }}
                  >
                    Reply…
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={commentBusy || (remote && offline)}
                    onClick={() =>
                      void save(
                        comments.map((x) =>
                          x.id === c.id ? { ...x, resolved: !x.resolved } : x,
                        ),
                      )
                    }
                  >
                    {c.resolved ? "Reopen" : "Resolve"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <button
            className="px-4 py-2 text-left text-xs text-muted-foreground w-full truncate"
            onClick={() => setExpandedThreads((x) => [...x, c.id])}
          >
            {c.body}
          </button>
        )}
      </article>
    );
  }
  return (
    <section
      onContextMenu={openSelectionMenu}
      onKeyDown={(e) => {
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))
          openSelectionMenu(e);
        if (e.key === "Escape" && selectionMenu) {
          e.preventDefault();
          setSelectionMenu(null);
          menuOpener.current?.focus({ preventScroll: true });
        }
      }}
      ref={scope}
      id={`file-${edit.id}`}
      className="rounded-lg border bg-card scroll-mt-24"
      aria-label={`Changed page ${edit.id}`}
    >
      <header className="flex gap-3 items-center px-4 py-3 bg-muted/40 border-b flex-wrap">
        <button
          data-file-toggle
          aria-label={`${open ? "Collapse" : "Expand"} ${edit.title}`}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            if (open) onAdvance();
          }}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <FileText className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm break-words">
            <bdi>{edit.title}</bdi>
          </h3>
          <p className="font-mono text-[10px] text-muted-foreground">
            {edit.wiki}/{edit.id} · {edit.editor}
            {edit.source === "wiki"
              ? ` · source: wikitext · ${edit.oldRev || "empty"} → ${edit.newRev}`
              : " · example data"}
          </p>
        </div>
        <span className="text-xs text-muted-foreground flex gap-1 items-center">
          <MessageSquare className="h-3 w-3" />
          {comments.length}
        </span>
        <label className="flex gap-2 items-center text-xs cursor-pointer">
          <input
            type="checkbox"
            aria-label={`Viewed ${edit.title}`}
            checked={viewed}
            onChange={(e) => {
              const checked = e.target.checked;
              try {
                localStorage.setItem(progressKey, String(checked));
                setViewed(checked);
                setOpen(!checked);
                if (checked) onAdvance();
              } catch {
                setError("Viewed progress could not be saved.");
              }
            }}
          />
          {viewed ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          ) : null}
          Viewed
        </label>
      </header>
      {(loadingComments || commentBusy) && (
        <p role="status" className="px-4 py-2 text-xs text-muted-foreground">
          {commentBusy ? "Saving comment…" : "Loading team comments…"}
        </p>
      )}
      {error && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {open && (
        <div className="p-3 md:p-4 space-y-4">
          {edit.source === "wiki" && (
            <p className="text-xs text-muted-foreground flex gap-3 flex-wrap">
              <a
                className="underline"
                target="_blank"
                rel="noreferrer"
                href={`https://${edit.wiki}.wikipedia.org/w/index.php?diff=${edit.newRev}&oldid=${edit.oldRev || 0}`}
              >
                Original Wikipedia diff and contributors
              </a>
              <a
                className="underline"
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                Text: CC BY-SA
              </a>
              <span>
                {remote
                  ? "Comments below are team notes on source text."
                  : "Comments below are local notes on source text."}
              </span>
            </p>
          )}
          {claim && (
            <div className="bg-muted p-3 rounded-md text-sm">
              <p>
                Review: {claim.outcome.replace("_", " ")} ·{" "}
                {store.members.find((m) => m.id === claim.owner)?.name}
              </p>
              {claim.reason && (
                <p className="mt-1">Flag reason: {claim.reason}</p>
              )}
              {claim.returnReason && (
                <p className="mt-1 text-amber-700">
                  Lead feedback: {claim.returnReason}
                </p>
              )}
            </div>
          )}
          {edit.after === PREVIEW_TEXT && (
            <div className="bg-muted/30 border rounded-md p-4">
              <p className="text-xs text-muted-foreground mb-2">
                Example rendering exercise · plain-text anchor across bold
                formatting · not parsed Wikipedia HTML
              </p>
              <div data-review-text data-side="new" data-source-start="0">
                {renderSafeTree(
                  previewTree,
                  active.filter((a) => a.side === "new"),
                )}
              </div>
            </div>
          )}
          <div>
            {comments.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowThreads(!showThreads)}
              >
                Threads ({comments.length})
              </Button>
            )}
            {showThreads && (
              <nav aria-label="Page comment threads" className="mt-2 space-y-1">
                {comments.map((c) => (
                  <button
                    key={c.id}
                    className="block text-left text-xs p-2 rounded-md hover:bg-muted"
                    onClick={() => {
                      setFocus({ ...c.anchor });
                      setExpandedThreads((x) => [...x, c.id]);
                      setShowThreads(false);
                    }}
                  >
                    {c.anchor.side} line {lineFor(c.anchor)} ·{" "}
                    {c.resolved ? "Resolved" : "Open"} · {c.body.slice(0, 80)}
                  </button>
                ))}
              </nav>
            )}
          </div>
          <DiffViewer
            edit={edit}
            anchors={active}
            onAnchor={(a) => {
              if (!permitted) {
                setError("Select an active workspace account to comment.");
                return;
              }
              setAnchor(a);
              setFocus(a);
            }}
            focusAnchor={focus}
            threadAnchors={[
              ...validComments.map((c) => c.anchor),
              ...(anchor ? [anchor] : []),
            ]}
            inlineSlot={(r) => (
              <>
                {validComments.filter((c) => matches(c.anchor, r)).map(thread)}
                {anchor && matches(anchor, r) && composer()}
              </>
            )}
          />
          {comments.filter(
            (c) => !validAnchor(c.anchor, sources[c.anchor.side], edit.id),
          ).length > 0 && (
            <details>
              <summary>Comments with stale anchors</summary>
              {comments
                .filter(
                  (c) =>
                    !validAnchor(c.anchor, sources[c.anchor.side], edit.id),
                )
                .map(thread)}
            </details>
          )}
          <details open={primary}>
            <summary className="text-xs font-medium cursor-pointer">
              Review decision
            </summary>
            {role === "patroller" && permitted && (
              <div className="border-t pt-4 space-y-3">
                {!claim && (
                  <Button
                    disabled={offline}
                    onClick={() =>
                      act({ type: "claim", actor, editId: edit.id })
                    }
                  >
                    Claim edit
                  </Button>
                )}
                {canReview && (
                  <>
                    <div className="flex gap-2">
                      <Button
                        disabled={offline}
                        onClick={() =>
                          act({ type: "ok", actor, editId: edit.id })
                        }
                      >
                        Mark OK
                      </Button>
                      <Button
                        variant="outline"
                        disabled={offline}
                        onClick={() =>
                          act({ type: "release", actor, editId: edit.id })
                        }
                      >
                        Release claim
                      </Button>
                    </div>
                    <label htmlFor={`flag-reason-${edit.id}`}>
                      Why should this edit be flagged?
                    </label>
                    <Textarea
                      id={`flag-reason-${edit.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={1000}
                    />
                    <Button
                      disabled={offline}
                      variant="destructive"
                      onClick={async () => {
                        if (!reason.trim()) {
                          setError("Enter a reason.");
                          return;
                        }
                        if (
                          await act({
                            type: "flag",
                            actor,
                            editId: edit.id,
                            reason,
                          })
                        )
                          setReason("");
                      }}
                    >
                      {claim?.outcome === "returned"
                        ? "Resubmit flag"
                        : "Raise flag"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Flagging records an internal decision. It does not revert
                      a Wikipedia edit.
                    </p>
                  </>
                )}
              </div>
            )}
            {role === "lead" && permitted && claim?.outcome === "flagged" && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-semibold">Verify this flag</h3>
                <Button
                  disabled={offline}
                  onClick={() =>
                    act({ type: "verify", actor, editId: edit.id })
                  }
                >
                  Verify flag
                </Button>
                <label className="block" htmlFor={`return-reason-${edit.id}`}>
                  Why must the reviewer review it again?
                </label>
                <Textarea
                  id={`return-reason-${edit.id}`}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  maxLength={1000}
                />
                <Button
                  variant="outline"
                  disabled={offline}
                  onClick={() => {
                    if (!feedback.trim()) {
                      setError("Enter feedback before returning the review.");
                      return;
                    }
                    act({
                      type: "return",
                      actor,
                      editId: edit.id,
                      reason: feedback,
                    });
                  }}
                >
                  Return for review
                </Button>
              </div>
            )}
          </details>
        </div>
      )}
      {selectionMenu && (
        <div
          ref={menuRef}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setSelectionMenu(null);
          }}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              menuItem.current?.focus();
            }
            if (e.key === "Tab") setSelectionMenu(null);
          }}
          role="menu"
          aria-label="Selected text actions"
          className="fixed z-[110] w-52 rounded-md border bg-popover p-1 shadow-lg"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
        >
          <button
            ref={menuItem}
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent focus:bg-accent"
            onClick={() => {
              const a = selectionMenu.anchor;
              setSelectionMenu(null);
              setAnchor(a);
              setFocus(a);
            }}
          >
            Add comment
          </button>
        </div>
      )}
      <Dialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v) setDeleting(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this thread?</DialogTitle>
            <DialogDescription>
              {remote
                ? "This hides the thread and its replies from the team workspace."
                : "This removes the comment and its replies from this device."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={commentBusy || (remote && offline)}
              onClick={async () => {
                if (await save(comments.filter((c) => c.id !== deleting)))
                  setDeleting(null);
              }}
            >
              Delete thread
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
