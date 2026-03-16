import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--navy)',
    }}>
      <div style={{ width: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--gold)' }}>
            SriKrishnaSweets
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
            AI Interview Platform — Recruiter Portal
          </div>
        </div>

        {/* Card */}
        <div className="card animate-fadeUp" style={{ padding: 36 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            Sign in
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>
            Enter your credentials to access the portal
          </p>

          {error && (
            <div style={{
              background: 'var(--red-bg)', color: 'var(--red-text)',
              border: '1px solid #FECACA', borderRadius: 7,
              padding: '10px 14px', fontSize: 13, marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="recruiter@srikrishnasweets.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className="btn btn-primary btn-lg" type="submit" disabled={loading}
              style={{ justifyContent: 'center', marginTop: 4 }}>
              {loading ? <span className="spinner" /> : 'Sign in →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 24 }}>
          SriKrishnaSweets — Confidential Internal System
        </p>
      </div>
    </div>
  );
}
