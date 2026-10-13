import { useEffect, useState } from 'react';
import { getJourneyPlan, getMyVisits } from '../lib/api';
import { enqueueVisit } from '../lib/queue';

export default function JourneyPlan({ onSelectStore }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [doneToday, setDoneToday] = useState({}); // storeId -> 'submitted' | 'not_visited'
  const [skipFor, setSkipFor] = useState(null); // planId of the store whose reason box is open
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const today = new Date().toLocaleDateString('en-CA'); // yyyy-MM-dd, device local day

  useEffect(() => {
    getJourneyPlan()
      .then(setPlan)
      .catch((err) => setError(err.message || 'Gagal memuat rencana kunjungan'));
    // Which of today's stores are already visited / marked not visited. Offline: just skip it.
    getMyVisits()
      .then((visits) => {
        const done = {};
        visits.forEach((v) => {
          if (new Date(v.checkInTime).toLocaleDateString('en-CA') === today) done[v.storeId] = v.status;
        });
        setDoneToday((d) => ({ ...done, ...d }));
      })
      .catch(() => {});
  }, [today]);

  async function saveSkip(item) {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await enqueueVisit({
        visitId: crypto.randomUUID(),
        storeId: item.storeId,
        journeyPlanId: item.planId,
        checkInTime: new Date().toISOString(),
        status: 'not_visited',
        skipReason: reason.trim(),
      });
      setDoneToday((d) => ({ ...d, [item.storeId]: 'not_visited' }));
      setSkipFor(null);
      setReason('');
    } catch (err) {
      setError('Gagal menyimpan: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <p style={{ color: 'crimson' }}>{error}</p>;
  }

  if (!plan) {
    return <p>Memuat rencana kunjungan...</p>;
  }

  if (plan.length === 0) {
    return <p>Belum ada rencana kunjungan untuk Anda.</p>;
  }

  const sorted = plan
    .filter((item) => item.plannedDate === today)
    .sort((a, b) => (a.store ? a.store.name : a.storeId).localeCompare(b.store ? b.store.name : b.storeId));

  return (
    <div>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Rencana Kunjungan Hari Ini ({today})</h2>
      {sorted.length === 0 && <p>Tidak ada kunjungan yang direncanakan hari ini.</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sorted.map((item) => {
          const done = doneToday[item.storeId];
          return (
            <li
              key={item.planId}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                opacity: done ? 0.6 : 1,
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{item.store ? item.store.name : item.storeId}</div>
              {item.store && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.store.address}</div>}
              {done ? (
                <div style={{ fontSize: 13, marginTop: 8 }}>
                  {done === 'not_visited' ? 'Tidak dikunjungi (alasan tersimpan)' : 'Sudah dikunjungi'}
                </div>
              ) : skipFor === item.planId ? (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Alasan tidak bisa dikunjungi (wajib diisi)"
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', padding: 8 }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      style={{ padding: '6px 12px' }}
                      disabled={!reason.trim() || saving}
                      onClick={() => saveSkip(item)}
                    >
                      {saving ? 'Menyimpan...' : 'Simpan'}
                    </button>
                    <button
                      style={{ padding: '6px 12px' }}
                      disabled={saving}
                      onClick={() => {
                        setSkipFor(null);
                        setReason('');
                      }}
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={{ padding: '6px 12px' }} onClick={() => onSelectStore(item)}>
                    Mulai Kunjungan
                  </button>
                  <button
                    style={{ padding: '6px 12px' }}
                    aria-label="Tidak bisa dikunjungi"
                    title="Tidak bisa dikunjungi"
                    onClick={() => {
                      setSkipFor(item.planId);
                      setReason('');
                    }}
                  >
                    ✕ Tidak bisa
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
