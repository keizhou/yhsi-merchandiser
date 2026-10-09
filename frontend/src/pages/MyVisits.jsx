import { useEffect, useState } from 'react';
import { getMyVisits } from '../lib/api';

export default function MyVisits() {
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyVisits()
      .then(setVisits)
      .catch((err) => setError(err.message || 'Gagal memuat riwayat kunjungan'));
  }, []);

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!visits) return <p>Memuat...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 16 }}>Riwayat Kunjungan</h2>
      {visits.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Belum ada kunjungan yang disubmit.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {visits.map((v) => (
          <li key={v.visitId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ fontWeight: 'bold' }}>{v.storeName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{new Date(v.checkInTime).toLocaleString('id-ID')}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{v.stage}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
