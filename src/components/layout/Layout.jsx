import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const NAV = [
  { to: '/dashboard',  icon: '◈', label: 'Dashboard'  },
  { to: '/jobs',       icon: '◉', label: 'Jobs'        },
  { to: '/candidates', icon: '◎', label: 'Candidates'  },
];

export default function Layout() {
  const { recruiter, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: 'var(--navy)', display: 'flex',
        flexDirection: 'column', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 800, color: 'var(--gold)', letterSpacing: -0.3 }}>
            SriKrishnaSweets
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3, fontFamily: 'DM Mono, monospace', letterSpacing: 0.5 }}>
            AI INTERVIEW PLATFORM
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 7,
              fontSize: 13, fontWeight: 500,
              color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
              background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
              transition: 'all 0.15s',
              textDecoration: 'none',
            })}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ padding: '10px 12px', borderRadius: 7, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
              {recruiter?.full_name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {recruiter?.role}
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginTop: 8, color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        <div style={{ padding: '32px 36px', maxWidth: 1100, margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
