import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStores } from '../lib/api';

export default function Stores() {
  const [stores, setStores] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getStores()
      .then(setStores)
      .catch((err) => setError(err.message || 'Gagal memuat daftar toko'));
  }, []);

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!stores) return <p>Memuat...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Toko</h2>
      {stores.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Tidak ada toko di area Anda.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {stores.map((s) => (
          <li key={s.storeId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ fontWeight: 'bold' }}>{s.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.address}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.channel}</div>
            <Link to={`/stores/${s.storeId}`} style={{ display: 'inline-block', marginTop: 8, fontSize: 13 }}>
              Kelola profil produk toko &rarr;
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
