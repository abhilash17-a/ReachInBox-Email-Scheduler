const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

export const api = {
  me: () => request<any>('/api/auth/me'),
  demoLogin: () => request('/api/auth/demo', { method: 'POST' }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  scheduled: () => request<any[]>('/api/emails/scheduled'),
  sent: () => request<any[]>('/api/emails/sent'),
  getEmail: (id: string) => request<any>(`/api/emails/${id}`),
  setStarred: (id: string, isStarred: boolean) => request<any>(`/api/emails/${id}/star`, { method: 'PATCH', body: JSON.stringify({ isStarred }) }),
  deleteEmail: (id: string) => request<{ ok: true }>(`/api/emails/${id}`, { method: 'DELETE' }),
  schedule: (payload: any) => request<any>('/api/emails/schedule', { method: 'POST', body: JSON.stringify(payload) }),
  parseLeads: async (file: File) => { const form = new FormData(); form.append('file', file); const r = await fetch(`${API}/api/emails/parse-leads`, { method: 'POST', body: form, credentials: 'include' }); const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; },
  search: (q: string) => request<any[]>(`/api/emails/search?q=${encodeURIComponent(q)}`),
  queueStats: () => request<any>('/api/emails/stats/queue'),
  slackStatus: () => request<any>('/api/slack/status'),
  disconnectSlack: () => request('/api/slack/disconnect', { method: 'POST' })
};

export { API };
