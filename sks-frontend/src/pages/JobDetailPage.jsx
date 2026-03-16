import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const CATS = [
  { id: 'behavioral',    label: 'Behavioral', icon: '🧠' },
  { id: 'technical',     label: 'Technical',  icon: '⚙️' },
  { id: 'role_specific', label: 'Role-Specific', icon: '🎯' },
];
const DIFF_BADGE = { Easy: 'badge-green', Medium: 'badge-amber', Hard: 'badge-red' };

export default function JobDetailPage() {
  const { id }   = useParams();
  const [job, setJob]           = useState(null);
  const [questions, setQuestions] = useState({});
  const [sessions, setSessions] = useState([]);
  const [invites, setInvites]   = useState([]);
  const [tab, setTab]           = useState('questions');
  const [activeQ, setActiveQ]   = useState('behavioral');
  const [generating, setGenerating] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState('');
  const [newQ, setNewQ]         = useState('');
  const [editId, setEditId]     = useState(null);
  const [editText, setEditText] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ full_name: '', email: '' });
  const [sending, setSending]   = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadJob = async () => {
    const [j, q, s, inv] = await Promise.all([
      api.jobs.get(id),
      api.questions.list(id),
      api.sessions.forJob(id),
      api.invites.forJob(id),
    ]);
    setJob(j.job);
    setQuestions(q.grouped || {});
    setSessions(s.sessions || []);
    setInvites(inv.invites || []);
    setLoading(false);
  };

  useEffect(() => { loadJob(); }, [id]);

  const handleGenerate = async (category) => {
    setGenerating(category);
    try {
      await api.questions.generate(id, { category, count: job?.interview_configs?.questions_per_type || 5 });
      const q = await api.questions.list(id);
      setQuestions(q.grouped || {});
      showToast(`✓ Generated ${category} questions`);
    } catch (e) { showToast('Generation failed'); }
    setGenerating(null);
  };

  const handleDelete = async (qId) => {
    await api.questions.delete(qId);
    const q = await api.questions.list(id);
    setQuestions(q.grouped || {});
  };

  const handleAddQ = async (category) => {
    if (!newQ.trim()) return;
    await api.questions.add(id, { text: newQ.trim(), category, difficulty: 'Medium' });
    setNewQ('');
    const q = await api.questions.list(id);
    setQuestions(q.grouped || {});
  };

  const handleSaveEdit = async (qId) => {
    await api.questions.update(qId, { text: editText });
    setEditId(null);
    const q = await api.questions.list(id);
    setQuestions(q.grouped || {});
  };

  const [pauseConfirm, setPauseConfirm] = useState(null);
  const [pausing, setPausing] = useState(false);

  const handleStatusChange = async (status) => {
    if (status === 'paused') {
      const pending = await api.jobs.pendingInvites(id);
      if (pending.count > 0) { setPauseConfirm(pending); return; }
    }
    await api.jobs.setStatus(id, status);
    const j = await api.jobs.get(id);
    setJob(j.job);
    showToast(`✓ Job status: ${status}`);
  };

  const handlePauseAndNotify = async () => {
    setPausing(true);
    try {
      const result = await api.invites.pauseAndNotify(id);
      setPauseConfirm(null);
      showToast(`✓ ${result.message}`);
      loadJob();
    } catch (e) { showToast(e.message); }
    setPausing(false);
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      // Create candidate first
      const { candidate } = await api.candidates.create({
        full_name: inviteForm.full_name,
        email:     inviteForm.email,
      });
      // Send invite
      const result = await api.invites.send({ job_id: id, candidate_id: candidate.id });
      setInviteLink(result.interview_url);
      setInviteForm({ full_name: '', email: '' });
      loadJob();
    } catch (e) { showToast(e.message || 'Failed to send invite'); }
    setSending(false);
  };

  const RECO_BADGE = {
    strong_yes: 'badge-green', yes: 'badge-green',
    maybe: 'badge-amber', no: 'badge-red', strong_no: 'badge-red',
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="spinner spinner-dark" style={{ width: 28, height: 28 }} />
    </div>
  );

  const currentQs = questions[activeQ] || [];

  return (
    <div className="animate-fadeUp">
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
        <Link to="/jobs" style={{ color: 'var(--muted)' }}>Jobs</Link>
        <span style={{ margin: '0 8px' }}>›</span>
        <span>{job?.title}</span>
      </div>

      {/* Job header */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>
              {job?.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>
              {job?.department} · {job?.level} · {job?.employment_type}
              {job?.location && ` · ${job.location}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {job?.status === 'draft' && (
              <button className="btn btn-gold btn-sm" onClick={() => handleStatusChange('active')}>
                Activate
              </button>
            )}
            {job?.status === 'active' && (
              <button className="btn btn-ghost btn-sm" onClick={() => handleStatusChange('paused')}>
                Pause
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}>
              + Send Invite
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 24, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          {[
            { label: 'Questions',  val: Object.values(questions).flat().length },
            { label: 'Invites',    val: invites.length },
            { label: 'Completed',  val: sessions.filter(s => s.status === 'completed').length },
            { label: 'Avg Score',  val: sessions.filter(s=>s.overall_score).length ? (sessions.reduce((a,b) => a + (b.overall_score||0), 0) / sessions.filter(s=>s.overall_score).length).toFixed(1) + '/10' : '—' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {[{id:'questions',label:'Question Builder'},{id:'interviews',label:'Interviews'},{id:'invites',label:'Invites'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 18px', borderRadius: 6, border: 'none',
            background: tab === t.id ? 'var(--navy)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--muted)',
            fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── QUESTIONS TAB */}
      {tab === 'questions' && (
        <div>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {CATS.map(c => (
              <button key={c.id} onClick={() => setActiveQ(c.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 7, border: '1px solid',
                borderColor: activeQ === c.id ? 'var(--navy)' : 'var(--border)',
                background: activeQ === c.id ? 'var(--navy)' : 'var(--surface)',
                color: activeQ === c.id ? '#fff' : 'var(--text2)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>
                {c.icon} {c.label}
                <span style={{
                  background: activeQ === c.id ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                  color: activeQ === c.id ? '#fff' : 'var(--muted)',
                  padding: '1px 7px', borderRadius: 10, fontSize: 11,
                  fontFamily: 'DM Mono, monospace',
                }}>
                  {(questions[c.id] || []).length}
                </span>
              </button>
            ))}
            <button
              className="btn btn-gold btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => handleGenerate(activeQ)}
              disabled={!!generating}
            >
              {generating === activeQ
                ? <><span className="spinner" /> Generating...</>
                : '✦ Generate with AI'}
            </button>
          </div>

          {/* Question cards */}
          {currentQs.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <div className="empty-icon">✦</div>
                <div className="empty-title">No questions yet</div>
                <div className="empty-sub">Click "Generate with AI" to create questions instantly.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {currentQs.map((q, i) => (
                <div key={q.id} className="card" style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{
                      fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)',
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      padding: '2px 7px', borderRadius: 4, flexShrink: 0, marginTop: 2,
                    }}>Q{i + 1}</span>
                    {editId === q.id ? (
                      <textarea className="input" style={{ flex: 1, resize: 'none' }} rows={2}
                        value={editText} onChange={e => setEditText(e.target.value)} autoFocus />
                    ) : (
                      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.6 }}>{q.text}</span>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <span className={`badge ${DIFF_BADGE[q.difficulty]}`}>{q.difficulty}</span>
                      {editId === q.id ? (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(q.id)}>Save</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(q.id); setEditText(q.text); }}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(q.id)}>✕</button>
                        </>
                      )}
                    </div>
                  </div>
                  {q.follow_up && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                      ↳ Follow-up: {q.follow_up}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add custom question */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <input className="input" placeholder="Add a custom question..."
              value={newQ} onChange={e => setNewQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddQ(activeQ)}
              style={{ borderStyle: 'dashed' }} />
            <button className="btn btn-ghost" onClick={() => handleAddQ(activeQ)}>+ Add</button>
          </div>
        </div>
      )}

      {/* ── INTERVIEWS TAB */}
      {tab === 'interviews' && (
        <div>
          {sessions.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">◎</div>
                <div className="empty-title">No interviews yet</div>
                <div className="empty-sub">Send an invite to a candidate to get started.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.map(s => (
                <Link to={`/sessions/${s.id}`} key={s.id} className="card" style={{
                  padding: '14px 20px', display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.candidates?.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      {s.candidates?.email}
                      {s.completed_at && ` · ${new Date(s.completed_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {s.overall_score && (
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                        {s.overall_score}/10
                      </span>
                    )}
                    {s.attire_score && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Attire {s.attire_score}/100</span>
                    )}
                    {s.recommendation && (
                      <span className={`badge ${RECO_BADGE[s.recommendation]}`}>
                        {s.recommendation.replace('_', ' ')}
                      </span>
                    )}
                    <span className={`badge ${s.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>
                      {s.status}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>›</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── INVITES TAB */}
      {tab === 'invites' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Send Invite</button>
          </div>
          {invites.length === 0 ? (
            <div className="card"><div className="empty-state">
              <div className="empty-icon">◎</div>
              <div className="empty-title">No invites sent</div>
            </div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {invites.map(inv => (
                <div key={inv.id} className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{inv.candidates?.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      {inv.candidates?.email} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`badge ${
                    inv.status === 'completed' ? 'badge-green' :
                    inv.status === 'expired'   ? 'badge-red' :
                    inv.status === 'in_progress' ? 'badge-amber' : 'badge-grey'
                  }`}>{inv.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Send Invite Modal */}
      {showInvite && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={e => e.target === e.currentTarget && setShowInvite(false)}>
          <div className="card animate-fadeUp" style={{ width: 460, padding: 36 }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
              Send Interview Invite
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>
              A secure link will be emailed to the candidate automatically.
            </p>
            <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="label">Candidate Full Name *</label>
                <input className="input" placeholder="e.g. Priya Sharma" required
                  value={inviteForm.full_name} onChange={e => setInviteForm(p => ({...p, full_name: e.target.value}))} />
              </div>
              <div>
                <label className="label">Email Address *</label>
                <input className="input" type="email" placeholder="candidate@email.com" required
                  value={inviteForm.email} onChange={e => setInviteForm(p => ({...p, email: e.target.value}))} />
              </div>
              <div style={{ background: 'var(--amber-bg)', border: '1px solid #FDE68A', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: 'var(--amber-text)' }}>
                ⏰ Link expires in 48 hours. Candidate must complete the interview within this window.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowInvite(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={sending}>
                  {sending ? <span className="spinner" /> : 'Send Invite →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Pause Confirmation Modal */}
      {pauseConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card animate-fadeUp" style={{ width:480, padding:36 }}>
            <div style={{ fontSize:20, fontWeight:700, fontFamily:'Syne,sans-serif', marginBottom:8, color:'var(--navy)' }}>
              ⚠️ Pause Recruitment?
            </div>
            <p style={{ color:'var(--muted)', fontSize:14, lineHeight:1.6, marginBottom:20 }}>
              There are <strong style={{color:'var(--red)'}}>{pauseConfirm.count} candidate{pauseConfirm.count !== 1 ? 's' : ''}</strong> with pending interview invites for this job.
            </p>
            {pauseConfirm.candidates?.length > 0 && (
              <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:14, marginBottom:20, maxHeight:150, overflowY:'auto' }}>
                {pauseConfirm.candidates.map((c, i) => (
                  <div key={i} style={{ fontSize:13, padding:'4px 0', color:'var(--text2)' }}>
                    • {c?.full_name} — {c?.email}
                  </div>
                ))}
              </div>
            )}
            <div style={{ background:'var(--amber-bg)', border:'1px solid #FDE68A', borderRadius:8, padding:'12px 16px', marginBottom:24, fontSize:13, color:'var(--amber-text)' }}>
              If you proceed, all pending invite links will be <strong>deactivated</strong> and each candidate will receive an email notifying them that the recruitment has been paused.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setPauseConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handlePauseAndNotify} disabled={pausing}>
                {pausing ? <span className="spinner spinner-dark" /> : `Pause & Notify ${pauseConfirm.count} Candidate${pauseConfirm.count !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Toast */}
      {toast && (
        <div className="toast-wrap">
          <div className="toast toast-success">{toast}</div>
        </div>
      )}
    </div>
  );
}
