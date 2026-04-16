const BASE = import.meta.env.VITE_BACKEND_URL || 'https://web-production-d4dfd.up.railway.app';
function getToken() {
  return localStorage.getItem('sks_token');
}

// Request with optional timeout (default 45s — enough for Claude + cold start)
async function request(path, options = {}, timeoutMs = 45000) {
  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    clearTimeout(timer);

    // Handle non-JSON responses (e.g. Railway HTML error pages)
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/html')) {
      if (!res.ok) throw new Error(`Server error (${res.status}). Please try again.`);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      if (!res.ok) throw new Error(`Server returned an unexpected response (${res.status}). Please try again.`);
      return {};
    }

    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
    throw e;
  }
}

export const api = {
  auth: {
    login:  (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
    me:     ()                => request('/api/auth/me'),
    logout: ()                => request('/api/auth/logout', { method: 'POST' }),
  },
  jobs: {
    list:           (params = {}) => request(`/api/jobs?${new URLSearchParams(params)}`),
    get:            (id)          => request(`/api/jobs/${id}`),
    create:         (body)        => request('/api/jobs', { method: 'POST', body }),
    update:         (id, body)    => request(`/api/jobs/${id}`, { method: 'PUT', body }),
    setStatus:      (id, status)  => request(`/api/jobs/${id}/status`, { method: 'PUT', body: { status } }),
    delete:         (id)          => request(`/api/jobs/${id}`, { method: 'DELETE' }),
    pendingInvites: (id)          => request(`/api/jobs/${id}/pending-invites`),
  },
  questions: {
    list:     (jobId, params = {}) => request(`/api/questions/${jobId}?${new URLSearchParams(params)}`),
    generate: (jobId, body)        => request(`/api/questions/${jobId}/generate`, { method: 'POST', body }),
    add:      (jobId, body)        => request(`/api/questions/${jobId}`, { method: 'POST', body }),
    update:   (id, body)           => request(`/api/questions/${id}`, { method: 'PUT', body }),
    delete:   (id)                 => request(`/api/questions/${id}`, { method: 'DELETE' }),
  },
  candidates: {
    list:   ()     => request('/api/candidates'),
    get:    (id)   => request(`/api/candidates/${id}`),
    create: (body) => request('/api/candidates', { method: 'POST', body }),
  },
  invites: {
    send:           (body)        => request('/api/invites', { method: 'POST', body }),
    forJob:         (jobId)       => request(`/api/invites/job/${jobId}`),
    validate:       (token)       => request(`/api/invites/validate/${token}`),
    verifyEmail:    (token, email)=> request(`/api/invites/verify-email/${token}`, { method: 'POST', body: { email } }),
    getSession:     (token)       => request(`/api/invites/session/${token}`),
    pauseAndNotify: (jobId)       => request(`/api/invites/job/${jobId}/pause-and-notify`, { method: 'POST' }),
  },
  sessions: {
    get:    (id)    => request(`/api/sessions/${id}`),
    forJob: (jobId) => request(`/api/sessions/job/${jobId}`),
  },
  interview: {
    start:        (body) => request('/api/interview/start',         { method: 'POST', body }, 60000), // 60s — Claude + cold start
    message:      (body) => request('/api/interview/message',       { method: 'POST', body }, 30000),
    proctoring:   (body) => request('/api/interview/proctoring',    { method: 'POST', body }),
    attire:       (body) => request('/api/interview/attire',        { method: 'POST', body }),
    complete:     (body) => request('/api/interview/complete',      { method: 'POST', body }, 30000),
    uploadResume: (body) => request('/api/interview/upload-resume', { method: 'POST', body }),
    keepalive:    (body) => request('/api/interview/keepalive',     { method: 'POST', body }),
    warmup:       ()     => request('/api/interview/warmup',        {}, 8000), // fast ping — 8s max
  },
  dashboard: {
    stats: () => request('/api/dashboard/stats'),
  },
};
