// ── API Client
// All calls to the Railway backend go through here

const BASE = import.meta.env.VITE_API_URL;

function getToken() {
  return localStorage.getItem('sks_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Auth
export const api = {
  auth: {
    login:  (email, password)    => request('/api/auth/login',  { method: 'POST', body: { email, password } }),
    signup: (body)               => request('/api/auth/signup', { method: 'POST', body }),
    me:     ()                   => request('/api/auth/me'),
    logout: ()                   => request('/api/auth/logout', { method: 'POST' }),
  },

  // ── Jobs
  jobs: {
    list:         (params = {}) => request(`/api/jobs?${new URLSearchParams(params)}`),
    get:          (id)          => request(`/api/jobs/${id}`),
    create:       (body)        => request('/api/jobs',           { method: 'POST', body }),
    update:       (id, body)    => request(`/api/jobs/${id}`,     { method: 'PUT',  body }),
    setStatus:    (id, status)  => request(`/api/jobs/${id}/status`, { method: 'PUT', body: { status } }),
    delete:       (id)          => request(`/api/jobs/${id}`,     { method: 'DELETE' }),
  },

  // ── Questions
  questions: {
    list:     (jobId, params = {}) => request(`/api/questions/${jobId}?${new URLSearchParams(params)}`),
    generate: (jobId, body)        => request(`/api/questions/${jobId}/generate`, { method: 'POST', body }),
    add:      (jobId, body)        => request(`/api/questions/${jobId}`,          { method: 'POST', body }),
    update:   (id, body)           => request(`/api/questions/${id}`,             { method: 'PUT',  body }),
    delete:   (id)                 => request(`/api/questions/${id}`,             { method: 'DELETE' }),
  },

  // ── Candidates
  candidates: {
    list:   ()         => request('/api/candidates'),
    get:    (id)       => request(`/api/candidates/${id}`),
    create: (body)     => request('/api/candidates', { method: 'POST', body }),
  },

  // ── Invites
  invites: {
    send:     (body)    => request('/api/invites',              { method: 'POST', body }),
    forJob:   (jobId)   => request(`/api/invites/job/${jobId}`),
    validate: (token)   => request(`/api/invites/validate/${token}`),
  },

  // ── Sessions
  sessions: {
    get:    (id)     => request(`/api/sessions/${id}`),
    forJob: (jobId)  => request(`/api/sessions/job/${jobId}`),
  },

  // ── Interview (candidate-facing)
  interview: {
    start:      (body) => request('/api/interview/start',      { method: 'POST', body }),
    message:    (body) => request('/api/interview/message',    { method: 'POST', body }),
    proctoring: (body) => request('/api/interview/proctoring', { method: 'POST', body }),
    attire:     (body) => request('/api/interview/attire',     { method: 'POST', body }),
    complete:   (body) => request('/api/interview/complete',   { method: 'POST', body }),
  },

  // ── Dashboard
  dashboard: {
    stats: () => request('/api/dashboard/stats'),
  },
};
