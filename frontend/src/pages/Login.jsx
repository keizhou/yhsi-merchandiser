import { useState } from 'react';
import { login } from '../lib/api';
import ThemeToggle from '../components/ThemeToggle';

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username.trim(), pin.trim());
      onLoggedIn(result.user);
    } catch (err) {
      setError(err.message || 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '48px auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <ThemeToggle />
      </div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Masuk</h1>

      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            autoComplete="username"
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          PIN / Kata Sandi
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            autoComplete="current-password"
          />
        </label>
        {error && <p style={{ color: 'crimson', marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
          {loading ? 'Memproses...' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
