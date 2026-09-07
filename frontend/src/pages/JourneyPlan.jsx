import { useEffect, useState } from 'react';
import { getJourneyPlan } from '../lib/api';

export default function JourneyPlan({ onSelectStore }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getJourneyPlan()
      .then(setPlan)
      .catch((err) => setError(err.message || 'Gagal memuat rencana kunjungan'));
  }, []);

  if (error) {
    return <p style={{ color: 'crimson' }}>{error}</p>;
  }

  if (!plan) {
    return <p>Memuat rencana kunjungan...</p>;
  }

  if (plan.length === 0) {
    return <p>Belum ada rencana kunjungan untuk Anda.</p>;
  }

  const sorted = [...plan].sort((a, b) => (a.plannedDate > b.plannedDate ? 1 : -1));

  return (
    <div>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Rencana Kunjungan</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sorted.map((item) => (
          <li
            key={item.planId}
            style={{
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 'bold' }}>{item.store ? item.store.name : item.storeId}</div>
            {item.store && <div style={{ fontSize: 13, color: '#555' }}>{item.store.address}</div>}
            <div style={{ fontSize: 13, color: '#555' }}>Tanggal rencana: {item.plannedDate}</div>
            <button
              style={{ marginTop: 8, padding: '6px 12px' }}
              onClick={() => onSelectStore(item)}
            >
              Mulai Kunjungan
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
