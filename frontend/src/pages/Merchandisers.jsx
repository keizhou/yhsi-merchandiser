import { useEffect, useState } from 'react';
import { getMerchandisers } from '../lib/api';

export default function Merchandisers() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    getMerchandisers()
      .then(setList)
      .catch((err) => setError(err.message || 'Gagal memuat daftar merchandiser'));
  }, []);

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!list) return <p>Memuat...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Merchandiser</h2>
      {list.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Tidak ada merchandiser di area Anda.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {list.map((m) => (
          <li key={m.userId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === m.userId ? null : m.userId)}
            >
              <div>
                <div style={{ fontWeight: 'bold' }}>{m.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{m.storeNames.join(', ') || 'Belum ada toko'}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'right' }}>
                {m.lastVisit ? (
                  <>
                    Kunjungan terakhir:
                    <br />
                    {new Date(m.lastVisit.checkInTime).toLocaleDateString('id-ID')}
                  </>
                ) : (
                  'Belum ada kunjungan'
                )}
              </div>
            </div>

            {expanded === m.userId && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Rencana Kunjungan</div>
                {m.journeyPlan.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Belum ada rencana kunjungan.</p>
                ) : (
                  <ul style={{ fontSize: 13, paddingLeft: 20 }}>
                    {m.journeyPlan.map((p) => (
                      <li key={p.planId}>
                        {p.storeId} — {p.plannedDate}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
