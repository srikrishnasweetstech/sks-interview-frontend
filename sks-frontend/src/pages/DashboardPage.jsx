import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const RECO_LABEL = {
  strong_yes: { label: 'Strong Yes', cls: 'badge-green' },
  yes:        { label: 'Yes',        cls: 'badge-green' },
  maybe:      { label: 'Maybe',      cls: 'badge-amber' },
  no:         { label: 'No',         cls: 'badge-red'   },
  strong_no:  { label: 'Strong No',  cls: 'badge-red'   },
};

export default function DashboardPage() {
  const { recruiter }     = useAuth();
  const [stats, setStats] = useState(null);
  const [jobs, setJobs]   = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      api.dashboard.stats(),
      api.jobs.list({ status: 'active' }),
    ]).then(([s, j]) => {
      setStats(s);
      setJobs(j.jobs?.slice(0, 5) || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
    </div>
  );

  const statCards = [
    { label: 'Active Jobs',       value: stats?.active_jobs       || 0, color: 'var(--navy)' },
    { label: 'Total Interviews',  value: stats?.total_interviews  || 0, color: 'var(--blue)' },
    { label: 'Completed',         value: stats?.completed         || 0, color: 'var(--green)' },
    { label: 'Pending Invites',   value: stats?.pending_invites   || 0, color: 'var(--amber)' },
    { label: 'Avg Score',         value: stats?.avg_score ? `${stats.avg_score}/10` : '—', color: 'var(--gold)' },
    { label: 'Total Candidates',  value: stats?.total_candidates  || 0, color: 'var(--muted)' },
  ];

  return (
    <div className="animate-fadeUp">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">
            Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {recruiter?.full_name?.split(' ')[0]} 👋
          </div>
          <div className="page-sub">Here's what's happening on the platform today.</div>
        </div>
        <Link to="/jobs" className="btn btn-gold">+ New Job</Link>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {statCards.map(s => (
          <div key={s.label} className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--muted)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
              {s.label}
            </div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 32, fontWeight: 700, color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Recommendation breakdown */}
      {stats?.completed > 0 && (
        <div className="card" style={{ padding: 24, marginBottom: 32 }}>
          <div style={{ fontWeight: 600, marginBottom: 16, color: 'var(--navy)' }}>Recommendation Breakdown</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { key: 'strong_yes', label: '⭐ Strong Yes', val: stats.strong_yes },
              { key: 'yes',        label: '✓ Yes',         val: stats.yes        },
              { key: 'maybe',      label: '◌ Maybe',       val: stats.maybe      },
              { key: 'no',         label: '✕ No',          val: stats.no         },
            ].map(r => (
              <div key={r.key} className="card" style={{ padding: '12px 20px', flex: 1, minWidth: 100, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>{r.val || 0}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{r.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active jobs */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, color: 'var(--navy)' }}>Active Jobs</div>
          <Link to="/jobs" style={{ fontSize: 13, color: 'var(--blue)' }}>View all →</Link>
        </div>
        {jobs.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <div className="empty-icon">◉</div>
            <div className="empty-title">No active jobs</div>
            <div className="empty-sub">Create your first job to start interviewing candidates.</div>
            <Link to="/jobs" className="btn btn-primary" style={{ marginTop: 16 }}>Create Job</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {jobs.map(job => (
              <Link to={`/jobs/${job.id}`} key={job.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 8,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                transition: 'border-color 0.15s',
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{job.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                    {job.department} · {job.level}
                  </div>
                </div>
                <span className="badge badge-green">Active</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
