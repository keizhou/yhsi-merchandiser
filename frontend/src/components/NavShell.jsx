import { NavLink, Outlet } from 'react-router-dom';
import { clearSession } from '../lib/api';
import ThemeToggle from './ThemeToggle';

export default function NavShell({ user, onLogout }) {
  const linkStyle = ({ isActive }) => ({
    padding: '8px 12px',
    textDecoration: 'none',
    color: isActive ? 'var(--accent)' : 'var(--text)',
    fontWeight: isActive ? 'bold' : 'normal',
    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
  });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <nav style={{ display: 'flex', gap: 4 }}>
          <NavLink to="/dashboard" style={linkStyle}>
            Dashboard
          </NavLink>
          <NavLink to="/merchandisers" style={linkStyle}>
            Merchandiser
          </NavLink>
          {['supervisor', 'manager', 'admin'].includes(user.role) && (
            <NavLink to="/stores" style={linkStyle}>
              Toko
            </NavLink>
          )}
          <NavLink to="/verification" style={linkStyle}>
            Verifikasi
          </NavLink>
          {['manager', 'headoffice', 'admin'].includes(user.role) && (
            <NavLink to="/rsm-review" style={linkStyle}>
              Review RSM
            </NavLink>
          )}
          {['headoffice', 'admin'].includes(user.role) && (
            <NavLink to="/head-office-review" style={linkStyle}>
              Review Head Office
            </NavLink>
          )}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThemeToggle />
          <div style={{ fontSize: 13, textAlign: 'right' }}>
            <div style={{ fontWeight: 'bold' }}>{user.name}</div>
            <div style={{ color: 'var(--text-muted)' }}>{user.role}</div>
          </div>
          <button
            onClick={() => {
              clearSession();
              onLogout();
            }}
            style={{ padding: '6px 12px' }}
          >
            Keluar
          </button>
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '16px auto', padding: '0 16px' }}>
        <Outlet />
      </div>
    </div>
  );
}
