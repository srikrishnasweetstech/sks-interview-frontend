import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const STATUS_BADGE = {
  draft:  'badge-grey',
  active: 'badge-green',
  paused: 'badge-amber',
  closed: 'badge-red',
};

const DEPTS  = ['Engineering','Product','Design','Marketing','Sales','Finance','Operations','HR'];
const LEVELS = ['Junior','Mid-Level','Senior','Lead','Principal','Director'];

export default function JobsPage() {
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [form, setForm]       = useState({
    title: '', department: 'Engineering', level: 'Senior',
    employment_type: 'Full-time', location: '', description: '',
  });

  const load = () => {
    setLoading(true);
    api.jobs.list().then(r => setJobs(r.jobs || [])).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.jobs.create(form);
      setShowModal(false);
      setForm({ title: '', department: 'Engineering', level: 'Senior', employment_type: 'Full-time', location: '', description: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fadeUp">
      <div className="page-header">
        <div>
          <div className="page-title">Jobs</div>
          <div className="page-sub">Manage job roles and interview settings</div>
        </div>
        <button className="btn btn-gold" onClick={() => setShowModal(true)}>+ Create Job</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="spinner spinner-dark" style={{ width: 28, height: 28 }} />
        </div>
      ) : jobs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">◉</div>
            <div className="empty-title">No jobs yet</div>
            <div className="empty-sub">Create your first job role to start building your AI interview process.</div>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowModal(true)}>
              Create First Job
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs.map(job => (
            <Link to={`/jobs/${job.id}`} key={job.id} className="card" style={{
              padding: '18px 24px', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
              transition: 'box-shadow 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 8,
                  background: 'var(--navy)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'var(--gold)', fontSize: 18, flexShrink: 0,
                }}>◉</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--navy)' }}>{job.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                    {job.department} · {job.level} · {job.employment_type}
                    {job.location && ` · ${job.location}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
                  {new Date(job.created_at).toLocaleDateString()}
                </div>
                <span className={`badge ${STATUS_BADGE[job.status]}`}>{job.status}</span>
                <span style={{ color: 'var(--muted)', fontSize: 16 }}>›</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Job Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="card animate-fadeUp" style={{ width: 540, padding: 36, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Create Job</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>Fill in the role details to get started</p>

            {error && (
              <div style={{ background: 'var(--red-bg)', color: 'var(--red-text)', padding: '10px 14px', borderRadius: 7, fontSize: 13, marginBottom: 20 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label className="label">Job Title *</label>
                <input className="input" placeholder="e.g. Senior Software Engineer"
                  value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="label">Department</label>
                  <select className="input" value={form.department} onChange={e => setForm(p => ({...p, department: e.target.value}))}>
                    {DEPTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Level</label>
                  <select className="input" value={form.level} onChange={e => setForm(p => ({...p, level: e.target.value}))}>
                    {LEVELS.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Employment Type</label>
                  <select className="input" value={form.employment_type} onChange={e => setForm(p => ({...p, employment_type: e.target.value}))}>
                    {['Full-time','Part-time','Contract'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Location</label>
                  <input className="input" placeholder="Remote / Chennai" value={form.location}
                    onChange={e => setForm(p => ({...p, location: e.target.value}))} />
                </div>
              </div>
              <div>
                <label className="label">Job Description (for AI question generation)</label>
                <textarea className="input" rows={4} style={{ resize: 'vertical' }}
                  placeholder="Paste the job description here. The AI will use this to generate relevant interview questions..."
                  value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Create Job →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
