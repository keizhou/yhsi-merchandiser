import { useEffect, useState } from 'react';
import { getDashboardSummary, getStores } from '../lib/api';

function defaultMonth() {
  return new Date().toISOString().slice(0, 7); // "2026-09"
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Last 12 months including the current one, newest first, for the dropdown.
function recentMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES_ID[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

// "2026-09" -> { startDate: "2026-09-01", endDate: "2026-09-30" }
function monthToRange(month) {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(year, m - 1, 1);
  const end = new Date(year, m, 0); // day 0 of next month = last day of this month
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function Tile({ label, value, suffix }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 'bold' }}>{value === null ? '—' : `${value}${suffix || ''}`}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function SubTile({ label, weight, value }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 'bold' }}>{value === null ? '—' : `${value}%`}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
        {label} <span style={{ color: 'var(--text-muted)' }}>({weight}%)</span>
      </div>
    </div>
  );
}

function pctCell(value) {
  return value === null ? '—' : `${value}%`;
}

function SmallStat({ label, value }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 'bold' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [stores, setStores] = useState([]);
  const [month, setMonth] = useState(defaultMonth());
  const [storeId, setStoreId] = useState('');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getStores()
      .then(setStores)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const { startDate, endDate } = monthToRange(month);
    getDashboardSummary({ startDate, endDate, storeId: storeId || undefined })
      .then(setSummary)
      .catch((err) => setError(err.message || 'Gagal memuat ringkasan'));
  }, [month, storeId]);

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Dashboard KPI</h2>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>
          Bulan
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ display: 'block', padding: 6 }}>
            {recentMonthOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Toko
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ display: 'block', padding: 6 }}>
            <option value="">Semua toko</option>
            {stores.map((s) => (
              <option key={s.storeId} value={s.storeId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {!summary ? (
        <p>Memuat...</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <SmallStat label="Toko tercakup" value={summary.scope.storeCount} />
            <SmallStat label="Merchandiser" value={summary.scope.merchandiserCount} />
            <SmallStat label="Supervisor/Manager" value={summary.scope.supervisorCount} />
            <SmallStat label="Total kunjungan" value={summary.overall.totalVisits} />
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <SmallStat label="Menunggu Verifikasi" value={summary.overall.pendingCount} />
            <SmallStat label="Sudah Diverifikasi" value={summary.overall.verifiedCount} />
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <Tile label="Stock Availability" value={summary.overall.stockAvailabilityPct} suffix="%" />
            <Tile label="Facing" value={summary.overall.facingPct} suffix="%" />
            <Tile label="Secondary Display" value={summary.overall.secondaryDisplayPct} suffix="%" />
          </div>

          <div style={{ marginBottom: 8 }}>
            <Tile label="Regular Shelf (komposit)" value={summary.overall.regularShelfPct} suffix="%" />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <SubTile label="Planogram" weight={40} value={summary.overall.planogramPct} />
            <SubTile label="POSM" weight={30} value={summary.overall.posmPct} />
            <SubTile label="Eye Level" weight={30} value={summary.overall.eyeLevelPct} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Angka di atas dihitung hanya dari kunjungan yang <strong>sudah diverifikasi supervisor</strong> (lihat tab
            Verifikasi), bukan data mentah dari merchandiser. Facing dihitung terpisah (target per SKU). Regular
            Shelf adalah gabungan berbobot dari Planogram (40%), POSM (30%), dan Eye Level (30%).
          </p>

          <h3 style={{ fontSize: 15 }}>Per Toko</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: 6 }}>Toko</th>
                  <th style={{ padding: 6 }}>Kunjungan</th>
                  <th style={{ padding: 6 }}>Stock Availability</th>
                  <th style={{ padding: 6 }}>Facing</th>
                  <th style={{ padding: 6 }}>Planogram</th>
                  <th style={{ padding: 6 }}>POSM</th>
                  <th style={{ padding: 6 }}>Eye Level</th>
                  <th style={{ padding: 6 }}>Regular Shelf</th>
                  <th style={{ padding: 6 }}>Secondary Display</th>
                </tr>
              </thead>
              <tbody>
                {summary.byStore.map((s) => (
                  <tr key={s.storeId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: 6 }}>{s.storeName}</td>
                    <td style={{ padding: 6 }}>{s.visitCount}</td>
                    <td style={{ padding: 6 }}>{pctCell(s.stockAvailabilityPct)}</td>
                    <td style={{ padding: 6 }}>{pctCell(s.facingPct)}</td>
                    <td style={{ padding: 6 }}>{pctCell(s.planogramPct)}</td>
                    <td style={{ padding: 6 }}>{pctCell(s.posmPct)}</td>
                    <td style={{ padding: 6 }}>{pctCell(s.eyeLevelPct)}</td>
                    <td style={{ padding: 6, fontWeight: 'bold' }}>{pctCell(s.regularShelfPct)}</td>
                    <td style={{ padding: 6 }}>{pctCell(s.secondaryDisplayPct)}</td>
                  </tr>
                ))}
                {summary.byStore.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 6, color: 'var(--text-muted)' }}>
                      Tidak ada kunjungan di periode/toko ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
