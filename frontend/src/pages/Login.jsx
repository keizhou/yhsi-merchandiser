import { useState } from 'react';
import { login, ping } from '../lib/api';

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pingResult, setPingResult] = useState(null);

  async function handleTestConnection() {
    setError('');
    try {
      const result = await ping();
      setPingResult(result);
    } catch (err) {
      setError('Tidak bisa terhubung ke server: ' + err.message);
    }
  }

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
          PIN
          <input
            type="password"
            inputMode="numeric"
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

      <hr style={{ margin: '24px 0' }} />

      <button onClick={handleTestConnection} style={{ width: '100%', padding: 8 }}>
        Tes koneksi ke server
      </button>
      {pingResult && (
        <pre style={{ background: '#f4f4f4', padding: 8, marginTop: 8, fontSize: 12, overflowX: 'auto' }}>
          {JSON.stringify(pingResult, null, 2)}
        </pre>
      )}
    </div>
  );
}
