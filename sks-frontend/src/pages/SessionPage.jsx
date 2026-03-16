import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const RECO_MAP = {
  strong_yes: { label: '⭐ Strong Yes', cls: 'badge-green' },
  yes:        { label: '✓ Yes',         cls: 'badge-green' },
  maybe:      { label: '◌ Maybe',       cls: 'badge-amber' },
  no:         { label: '✕ No',          cls: 'badge-red'   },
  strong_no:  { label: '✕ Strong No',   cls: 'badge-red'   },
};

export default function SessionPage() {
  const { id }   = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('transcript');

  useEffect(() => {
    api.sessions.get(id)
      .then(r => setSession(r.session))
      .finally(() => setLoading(false));
  }, [id]);

  const fmt = (s) => s ? `${Math.floor(s/60)}m ${s%60}s` : '—';

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="spinner spinner-dark" style={{ width: 28, height: 28 }} />
    </div>
  );
  if (!session) return <div>Session not found.</div>;

  const messages   = session.session_messages   || [];
  const scores     = session.ai_scores         || [];
  const proctoring = session.proctoring_events || [];
  const avgScore   = scores.length ? (scores.reduce((a, b) => a + (b.overall_score || 0), 0) / scores.length).toFixed(1) : null;

  return (
    <div className="animate-fadeUp">
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
        <Link to="/jobs" style={{ color: 'var(--muted)' }}>Jobs</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <Link to={`/jobs/${session.job_id}`} style={{ color: 'var(--muted)' }}>{session.jobs?.title}</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span>{session.candidates?.full_name}</span>
      </div>

      {/* Header card */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>
              {session.candidates?.full_name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              {session.candidates?.email} · {session.jobs?.title}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {session.recommendation && (
              <span className={`badge ${RECO_MAP[session.recommendation]?.cls}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                {RECO_MAP[session.recommendation]?.label}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          {[
            { label: 'Overall Score',    val: avgScore ? `${avgScore}/10` : '—' },
            { label: 'Attire Score',     val: session.attire_score ? `${session.attire_score}/100` : '—' },
            { label: 'Attire Level',     val: session.attire_level || '—' },
            { label: 'Duration',         val: fmt(session.duration_seconds) },
            { label: 'Proctor Flags',    val: proctoring.length },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>
                {s.val}
              </div>
            </div>
          ))}
        </div>

        {/* AI Summary */}
        {session.overall_summary && (
          <div style={{ marginTop: 20, padding: '14px 18px', background: 'var(--blue-bg)', border: '1px solid #BFDBFE', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--blue-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              AI Summary
            </div>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>{session.overall_summary}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'transcript',  label: `Transcript (${messages.length})` },
          { id: 'scores',      label: `Scores (${scores.length})` },
          { id: 'proctoring',  label: `Proctoring (${proctoring.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '7px 18px', borderRadius: 6, border: 'none',
            background: activeTab === t.id ? 'var(--navy)' : 'transparent',
            color: activeTab === t.id ? '#fff' : 'var(--muted)',
            fontSize: 13, fontWeight: 500,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Transcript */}
      {activeTab === 'transcript' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m, i) => (
            <div key={m.id} style={{
              padding: '14px 18px', borderRadius: 8,
              background: m.role === 'ai' ? 'var(--surface)' : 'var(--navy)',
              border: '1px solid',
              borderColor: m.role === 'ai' ? 'var(--border)' : 'var(--navy)',
              marginLeft: m.role === 'ai' ? 0 : '10%',
            }}>
              <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', marginBottom: 8, color: m.role === 'ai' ? 'var(--gold)' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {m.role === 'ai' ? 'Aria' : session.candidates?.full_name}
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: m.role === 'ai' ? 'var(--text)' : '#fff' }}>
                {m.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Scores */}
      {activeTab === 'scores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {scores.length === 0 ? (
            <div className="card"><div className="empty-state"><div className="empty-sub">No scores available</div></div></div>
          ) : scores.map((s, i) => (
            <div key={s.id} className="card" style={{ padding: '18px 22px' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {[
                  { label: 'Relevance',   val: s.relevance_score },
                  { label: 'Clarity',     val: s.clarity_score },
                  { label: 'Depth',       val: s.depth_score },
                  { label: 'Confidence',  val: s.confidence_score },
                  { label: 'Overall',     val: s.overall_score },
                ].map(sc => (
                  <div key={sc.label} style={{ textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', marginBottom: 4 }}>{sc.label}</div>
                    <div style={{
                      fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700,
                      color: sc.val >= 7 ? 'var(--green)' : sc.val >= 4 ? 'var(--amber)' : 'var(--red)',
                    }}>{sc.val || '—'}</div>
                  </div>
                ))}
              </div>
              {s.feedback && <p style={{ fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' }}>{s.feedback}</p>}
              {s.red_flags?.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {s.red_flags.map((f, j) => (
                    <span key={j} className="badge badge-red">{f}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Proctoring */}
      {activeTab === 'proctoring' && (
        <div>
          {proctoring.length === 0 ? (
            <div className="card"><div className="empty-state">
              <div className="empty-icon">✓</div>
              <div className="empty-title">No flags raised</div>
              <div className="empty-sub">Candidate passed all proctoring checks.</div>
            </div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proctoring.map(e => (
                <div key={e.id} className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span className={`badge ${e.severity === 'high' ? 'badge-red' : e.severity === 'medium' ? 'badge-amber' : 'badge-grey'}`}>
                    {e.severity}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{e.event_type.replace(/_/g, ' ')}</div>
                    {e.description && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{e.description}</div>}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--muted)' }}>
                    {e.session_second != null ? `${Math.floor(e.session_second/60)}:${String(e.session_second%60).padStart(2,'0')}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
