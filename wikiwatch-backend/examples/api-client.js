/** Reference browser adapter. No persistence, DOM rendering or hidden role selection. */
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export class WikiWatchApi {
  constructor(baseUrl) {
    this.base = baseUrl.replace(/\/$/, '');
    this.tokens = null;
    this.refreshing = null;
  }
  async request(path, { method = 'GET', body, signal, authenticated = true, retry = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authenticated && this.tokens) headers.Authorization = `Bearer ${this.tokens.access_token}`;
    const response = await fetch(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal, cache: 'no-store' });
    if (response.status === 401 && authenticated && retry && this.tokens) {
      await this.refresh();
      return this.request(path, { method, body, signal, authenticated, retry: false });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, payload.error || (payload.detail ? JSON.stringify(payload.detail) : 'API unavailable'));
    return payload.data;
  }
  async login(email, password) {
    this.tokens = await this.request('/auth/login', { method: 'POST', body: { email, password }, authenticated: false });
    return this.tokens.member;
  }
  async refresh() {
    if (!this.refreshing) {
      this.refreshing = this.request('/auth/refresh', { method: 'POST', body: { refresh_token: this.tokens?.refresh_token }, authenticated: false })
        .then(tokens => { this.tokens = tokens; })
        .catch(error => { this.tokens = null; throw error; })
        .finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }
  async logout() {
    try { await this.request('/auth/logout', { method: 'POST' }); }
    finally { this.tokens = null; }
  }
  me() { return this.request('/auth/me'); }
  admit(edits) { return this.request('/edits/admit', { method: 'POST', body: { edits } }); }
  listEdits(filters = {}, signal) {
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null).map(([k,v]) => [k,String(v)]));
    return this.request(`/edits?${query}`, { signal });
  }
  transition(edit, operation, extra = {}) {
    return this.request(`/edits/${edit.id}/transition`, { method: 'POST', body: { ...extra, operation, version: edit.version } });
  }
  createThread(editId, anchor, body) { return this.request(`/edits/${editId}/threads`, { method: 'POST', body: { anchor, body } }); }
  events(after = 0) { return this.request(`/events?after=${after}`); }
}
