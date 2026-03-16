import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');

  useEffect(() => {
    api.candidates.list()
      .then(r => setCandidates(r.candidates || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = candidates.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fadeUp">
      <div className="page-header">
        <div>
          <div className="page-title">Candidates</div>
          <div className="page-sub">Everyone who has been invited to interview</div>
        </div>
      </div>

      <input className="input" style={{ maxWidth: 360, marginBottom: 20 }}
        placeholder="Search by name or email..."
        value={search} onChange={e => setSearch(e.target.value)} />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="spinner spinner-dark" style={{ width: 28, height: 28 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-title">No candidates yet</div>
            <div className="empty-sub">Candidates appear here once you send interview invites from a job.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(c => {
            const latestInvite = c.interview_invites?.[0];
            const session = latestInvite?.interview_sessions?.[0];
            return (
              <div key={c.id} className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: 'var(--navy)', color: 'var(--gold)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14,
                  }}>
                    {c.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {c.email}
                      {latestInvite?.jobs?.title && ` · ${latestInvite.jobs.title}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {session?.overall_score && (
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600 }}>
                      {session.overall_score}/10
                    </span>
                  )}
                  {latestInvite && (
                    <span className={`badge ${
                      latestInvite.status === 'completed'   ? 'badge-green' :
                      latestInvite.status === 'in_progress' ? 'badge-amber' :
                      latestInvite.status === 'expired'     ? 'badge-red'   : 'badge-grey'
                    }`}>{latestInvite.status}</span>
                  )}
                  {session && (
                    <Link to={`/sessions/${session.id}`} className="btn btn-ghost btn-sm">View →</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
