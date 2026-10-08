import type { Edit, Member, Store, Action } from "./model";
import { makeAnchor, type Anchor, type Comment } from "./annotations";
declare const __API_HOST__: string;
export const API_HOST = typeof __API_HOST__ === "undefined" ? "" : __API_HOST__;
export const API_ENABLED = !!API_HOST;
const SESSION = "wikiwatch-api-session-v1";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const frontendRole = (role: string): Member["role"] =>
  role === "reviewer" ? "patroller" : (role as Member["role"]);
export const backendRole = (role: Member["role"]) =>
  role === "patroller" ? "reviewer" : role;
export function memberFromAPI(row: any): Member {
  return { ...row, email: row.email || "", role: frontendRole(row.role) };
}
export const editKey = (wiki: string, oldRev: number, newRev: number) =>
  `${wiki.replace(/wiki$/, "")}:${oldRev}:${newRev}`;
export function editFromAPI(row: any): Edit {
  return {
    id: editKey(row.wiki, row.old_rev, row.new_rev),
    backendId: row.id,
    version: row.version,
    title: row.title,
    wiki: row.wiki.replace(/wiki$/, ""),
    editor: row.editor,
    comment: row.comment,
    delta: row.delta,
    time: Date.parse(row.occurred_at),
    before: "",
    after: "",
    oldRev: row.old_rev,
    newRev: row.new_rev,
    pageId: row.page_id,
    namespace: row.namespace,
    bot: row.bot,
    source: "wiki",
    contentStatus: "unloaded",
  };
}
export function admission(edit: Edit) {
  if (!edit.newRev || !edit.pageId || edit.source !== "wiki")
    throw Error("Only a real Wikipedia revision can enter the shared queue.");
  return {
    wiki: edit.wiki + "wiki",
    title: edit.title,
    editor: edit.editor,
    comment: edit.comment,
    delta: edit.delta,
    old_rev: edit.oldRev || 0,
    new_rev: edit.newRev,
    page_id: edit.pageId,
    namespace: edit.namespace || 0,
    bot: !!edit.bot,
    occurred_at: new Date(edit.time).toISOString(),
  };
}
class Backend {
  tokens: any = null;
  refreshing: Promise<void> | null = null;
  constructor() {
    try {
      this.tokens = JSON.parse(sessionStorage.getItem(SESSION) || "null");
    } catch {}
  }
  save(tokens: any) {
    this.tokens = tokens;
    try {
      if (tokens) sessionStorage.setItem(SESSION, JSON.stringify(tokens));
      else sessionStorage.removeItem(SESSION);
    } catch {}
  }
  async request(
    path: string,
    {
      method = "GET",
      body,
      signal,
      retry = true,
      auth = true,
    }: {
      method?: string;
      body?: unknown;
      signal?: AbortSignal;
      retry?: boolean;
      auth?: boolean;
    } = {},
  ): Promise<any> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && this.tokens)
      headers.Authorization = `Bearer ${this.tokens.access_token}`;
    const response = await fetch(API_HOST + "/wikiwatch-service/v1" + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: "no-store",
      credentials: "omit",
    });
    if (response.status === 401 && auth && retry && this.tokens) {
      await this.refresh();
      return this.request(path, { method, body, signal, retry: false, auth });
    }
    if (
      response.ok &&
      response.headers.get("content-type")?.includes("text/csv")
    )
      return response.text();
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new ApiError(
        response.status,
        payload.error ||
          (Array.isArray(payload.detail)
            ? payload.detail.map((d: any) => d.msg).join("; ")
            : payload.detail) ||
          `API returned HTTP ${response.status}.`,
      );
    return payload.data;
  }
  async refresh() {
    if (!this.refreshing) {
      const session = this.tokens;
      this.refreshing = this.request("/auth/refresh", {
        method: "POST",
        body: { refresh_token: session?.refresh_token },
        auth: false,
      })
        .then((tokens) => {
          if (this.tokens === session) this.save(tokens);
          else throw new ApiError(401, "The session changed. Sign in again.");
        })
        .catch((error) => {
          if (
            error instanceof ApiError &&
            error.status === 401 &&
            this.tokens === session
          )
            this.save(null);
          throw error;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }
  async login(email: string, password: string) {
    const tokens = await this.request("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    this.save(tokens);
    return memberFromAPI(tokens.member);
  }
  async me() {
    return memberFromAPI(await this.request("/auth/me"));
  }
  async logout() {
    const session = this.tokens;
    this.save(null);
    if (session)
      await fetch(API_HOST + "/wikiwatch-service/v1/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        credentials: "omit",
        cache: "no-store",
      });
  }
  async all(path: string) {
    let rows: any[] = [];
    let offset = 0;
    for (;;) {
      const page = await this.request(
        `${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=100`,
      );
      rows.push(...page.items);
      offset += page.items.length;
      if (offset >= page.total) return rows;
      if (!page.items.length || offset >= 10000)
        throw Error(
          "This view exceeds the demo limit. Narrow the shared queue before loading it.",
        );
    }
  }
  async admit(edits: Edit[]) {
    const result = [];
    for (let start = 0; start < edits.length; start += 100)
      result.push(
        ...(await this.request("/edits/admit", {
          method: "POST",
          body: { edits: edits.slice(start, start + 100).map(admission) },
        })),
      );
    return result;
  }
  async transition(edit: Edit, action: Action) {
    if (
      action.type === "event" ||
      action.type === "member" ||
      action.type === "addMember"
    )
      throw Error("Invalid review operation");
    if (!edit.backendId || !edit.version)
      throw Error("Edit has not entered the shared queue");
    const operations: Record<string, string> = {
      reassign: "assign",
      leadRelease: "release",
    };
    return this.request(`/edits/${edit.backendId}/transition`, {
      method: "POST",
      body: {
        operation: operations[action.type] || action.type,
        version: edit.version,
        ...(action.owner ? { owner_id: action.owner } : {}),
        reason: action.reason || "",
      },
    });
  }
  async auditExport() {
    const rows: string[][] = [];
    let after = 0;
    for (;;) {
      const csv = await this.request(
        `/audit/export?after_id=${after}&limit=1000`,
      );
      const parsed = parseCSV(csv);
      if (!rows.length) rows.push(parsed[0]);
      const data = parsed.slice(1);
      rows.push(...data);
      if (data.length < 1000) return rows;
      after = Number(data.at(-1)![0]);
    }
  }
}
export const backend = new Backend();
export function serverStore(rows: any[], members: any[], audit: any[]): Store {
  const edits = rows.map(editFromAPI);
  const keys = new Map(edits.map((e) => [e.backendId, e]));
  return {
    edits,
    members: members.map(memberFromAPI),
    claims: rows
      .filter((e) => e.status !== "unclaimed")
      .map((e) => ({
        editId: editKey(e.wiki, e.old_rev, e.new_rev),
        owner: e.owner_id,
        outcome: e.status,
        reason: e.reason,
        returnReason: e.return_reason,
        claimedAt: Date.parse(e.claimed_at || e.admitted_at),
      })),
    audit: audit.map((e) => {
      const edit = keys.get(e.target);
      return {
        id: String(e.id),
        actor: e.actor_id,
        action: e.action,
        target:
          edit?.title ||
          members.find((m) => m.id === e.target)?.name ||
          e.target,
        detail: JSON.stringify(e.detail),
        time: Date.parse(e.created_at),
        editId: edit?.id,
        wiki: edit?.wiki,
        oldRev: edit?.oldRev,
        newRev: edit?.newRev,
      };
    }),
  };
}
function position(text: string, line: number, offset: number) {
  const lines = text.split("\n");
  if (line > lines.length || offset > lines[line - 1].length) return null;
  return (
    lines.slice(0, line - 1).reduce((n, s) => n + s.length + 1, 0) + offset
  );
}
export function apiAnchor(edit: Edit, a: Anchor) {
  const text = a.side === "old" ? edit.before : edit.after;
  const at = (offset: number) => {
    const prefix = text.slice(0, offset);
    return {
      line: prefix.split("\n").length,
      offset: prefix.length - (prefix.lastIndexOf("\n") + 1),
    };
  };
  const start = at(a.start),
    end = at(a.end);
  return {
    wiki: edit.wiki + "wiki",
    old_rev: edit.oldRev || 0,
    new_rev: edit.newRev,
    side: a.side === "old" ? "old" : "new",
    start_line: start.line,
    end_line: end.line,
    start_offset: start.offset,
    end_offset: end.offset,
    quote: a.exact,
    prefix: a.prefix,
    suffix: a.suffix,
    source_hash: a.revisionKey.split(":").at(-1),
  };
}
export function threadFromAPI(
  edit: Edit,
  row: any,
): Comment & { version: number } {
  const a = row.anchor,
    text = a.side === "old" ? edit.before : edit.after;
  const start = position(text, a.start_line, a.start_offset),
    end = position(text, a.end_line, a.end_offset);
  let anchor: Anchor = {
    side: a.side,
    start: start ?? 0,
    end: end ?? 0,
    exact: a.quote,
    prefix: a.prefix || "",
    suffix: a.suffix || "",
    revisionKey: "stale",
  };
  if (start !== null && end !== null) {
    const fresh =
      end > start
        ? makeAnchor(text, a.side, start, end, edit.id)
        : {
            ...anchor,
            start,
            end,
            revisionKey: `${edit.id}:${a.side}:${a.source_hash}`,
          };
    anchor = {
      ...fresh,
      exact: a.quote,
      revisionKey: a.source_hash
        ? `${edit.id}:${a.side}:${a.source_hash}`
        : fresh.revisionKey,
    };
  }
  const first = row.comments[0];
  return {
    id: row.id,
    version: row.version,
    anchor,
    body: first?.body || "",
    author: row.author_id,
    createdAt: Date.parse(row.created_at),
    resolved: row.resolved,
    replies: row.comments
      .slice(1)
      .map((c: any) => ({ id: c.id, body: c.body, author: c.author_id })),
  };
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
