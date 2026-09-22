import { useEffect, useState } from 'react';
import { getMerchandisers, getStores, getJourneyPlanForWeek, setJourneyPlanForWeek } from '../lib/api';

const DAY_LABELS = ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu', 'Minggu'];

// "YYYY-Www" (native <input type="week"> value, matches the backend's
// Utilities.formatDate "YYYY-'W'ww" pattern) -> the 7 yyyy-MM-dd dates of
// that ISO week, Monday first.
function weekToDates(weekStr) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekStr || '');
  if (!match) return [];
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function currentWeekValue() {
  const now = new Date();
  const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default function JourneyPlanner() {
  const [merchandisers, setMerchandisers] = useState(null);
  const [stores, setStores] = useState(null);
  const [merchandiserId, setMerchandiserId] = useState('');
  const [week, setWeek] = useState(currentWeekValue());
  const [checked, setChecked] = useState(new Set()); // "storeId|date"
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getMerchandisers(), getStores()])
      .then(([m, s]) => {
        setMerchandisers(m);
        setStores(s);
        if (m.length > 0) setMerchandiserId(m[0].userId);
      })
      .catch((err) => setError(err.message || 'Gagal memuat data'));
  }, []);

  useEffect(() => {
    if (!merchandiserId || !week) return;
    setLoading(true);
    setError('');
    setSaved(false);
    getJourneyPlanForWeek(merchandiserId, week)
      .then((entries) => {
        setChecked(new Set(entries.map((e) => `${e.storeId}|${e.plannedDate}`)));
      })
      .catch((err) => setError(err.message || 'Gagal memuat rencana kunjungan'))
      .finally(() => setLoading(false));
  }, [merchandiserId, week]);

  function toggle(storeId, date) {
    setSaved(false);
    setChecked((prev) => {
      const key = `${storeId}|${date}`;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const entries = Array.from(checked).map((key) => {
        const [storeId, plannedDate] = key.split('|');
        return { storeId, plannedDate };
      });
      await setJourneyPlanForWeek(merchandiserId, week, entries);
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Gagal menyimpan rencana kunjungan');
    } finally {
      setSaving(false);
    }
  }

  if (!merchandisers || !stores) return <p>Memuat...</p>;
  if (error && !merchandisers.length) return <p style={{ color: 'crimson' }}>{error}</p>;

  const dates = weekToDates(week);

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Rencana Kunjungan</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Pilih merchandiser dan minggu, lalu centang toko mana yang dikunjungi pada hari apa.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>
          Merchandiser
          <select
            value={merchandiserId}
            onChange={(e) => setMerchandiserId(e.target.value)}
            style={{ display: 'block', padding: 6, marginTop: 4 }}
          >
            {merchandisers.map((m) => (
              <option key={m.userId} value={m.userId} disabled={m.pending}>
                {m.name}
                {m.pending ? ' (Menunggu Aktivasi)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Minggu
          <input
            type="week"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            style={{ display: 'block', padding: 6, marginTop: 4 }}
          />
        </label>
      </div>

      {merchandisers.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Tidak ada merchandiser di area Anda.</p>}
      {stores.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Tidak ada toko di area Anda.</p>}

      {merchandisers.length > 0 && stores.length > 0 && dates.length === 7 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--border)' }}>Toko</th>
                {dates.map((d, i) => (
                  <th key={d} style={{ padding: 6, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                    {DAY_LABELS[i]}
                    <br />
                    <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>{d.slice(5)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.storeId}>
                  <td style={{ padding: 6, borderBottom: '1px solid var(--border-subtle)' }}>{s.name}</td>
                  {dates.map((d) => (
                    <td key={d} style={{ padding: 6, borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        disabled={loading}
                        checked={checked.has(`${s.storeId}|${d}`)}
                        onChange={() => toggle(s.storeId, d)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p style={{ color: 'crimson', marginTop: 12 }}>{error}</p>}
      {saved && <p style={{ color: 'green', marginTop: 12 }}>Tersimpan.</p>}
      <button onClick={handleSave} disabled={saving || loading || !merchandiserId} style={{ marginTop: 16, padding: '10px 20px', fontWeight: 'bold' }}>
        {saving ? 'Menyimpan...' : 'Simpan Rencana Kunjungan'}
      </button>
    </div>
  );
}
