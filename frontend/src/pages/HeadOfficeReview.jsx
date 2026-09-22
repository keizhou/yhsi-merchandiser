import { useEffect, useState } from 'react';
import { getStores, getVisitsForHeadOfficeReview, submitHeadOfficeReview } from '../lib/api';
import PhotoLightbox from '../components/PhotoLightbox';

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset) {
  const now = new Date();
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return { startDate: isoDate(start), endDate: isoDate(now) };
  }
  if (preset === '4weeks') {
    const start = new Date(now);
    start.setDate(now.getDate() - 28);
    return { startDate: isoDate(start), endDate: isoDate(now) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: isoDate(start), endDate: isoDate(now) };
}

function ReadOnlyYesNo({ label, value }) {
  const text = value === true ? 'Ya' : value === false ? 'Tidak' : '—';
  const color = value === true ? 'var(--accent)' : value === false ? 'var(--danger)' : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ minWidth: 90 }}>{label}</span>
      <span style={{ fontWeight: 'bold', color }}>{text}</span>
    </div>
  );
}

function HeadOfficeReviewCard({ visit, onSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(visit.headOfficeNotes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function handleDecision(decision) {
    setSaving(true);
    setError('');
    try {
      await submitHeadOfficeReview({ visitId: visit.visitId, headOfficeStatus: decision, headOfficeNotes: notes });
      setSaved(true);
      onSaved && onSaved();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan review Head Office');
    } finally {
      setSaving(false);
    }
  }

  const hoBadgeColor = visit.headOfficeStatus === 'approved' ? 'var(--accent)' : visit.headOfficeStatus === 'sent_back' ? 'var(--danger)' : 'var(--warning)';
  const hoBadgeText = visit.headOfficeStatus === 'approved' ? 'Final Disetujui' : visit.headOfficeStatus === 'sent_back' ? 'Dikirim balik ke RSM' : 'Menunggu Head Office';

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setExpanded((e) => !e)}>
        <div>
          <div style={{ fontWeight: 'bold' }}>{new Date(visit.checkInTime).toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{visit.storeName}</div>
        </div>
        <div style={{ fontSize: 12, color: hoBadgeColor }}>{hoBadgeText}</div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Hasil Verifikasi Supervisor</div>
            <p style={{ fontSize: 13, color: visit.supervisorStatus === 'approved' ? 'var(--accent)' : 'var(--danger)' }}>
              {visit.supervisorStatus === 'approved' ? 'Disetujui supervisor' : 'Supervisor meminta revisi'}
            </p>
            {visit.supervisorNotes && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>"{visit.supervisorNotes}"</p>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Hasil Review RSM</div>
            <p style={{ fontSize: 13, color: visit.rsmStatus === 'approved' ? 'var(--accent)' : 'var(--danger)' }}>
              {visit.rsmStatus === 'approved' ? 'Disetujui RSM' : 'Dikirim balik RSM ke supervisor'}
            </p>
            {visit.rsmNotes && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>"{visit.rsmNotes}"</p>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Planogram, POSM, Eye Level (per foto rak)</div>
            {visit.shelfPhotos.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tidak ada foto rak.</p>}
            {visit.shelfPhotos.map((sp) => (
              <div key={sp.packtype} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <PhotoLightbox src={sp.photoUrl} alt={sp.packtype} thumbStyle={{ width: 80, height: 80, borderRadius: 6 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{sp.packtype}</div>
                  <ReadOnlyYesNo label="Planogram" value={sp.planogram} />
                  <ReadOnlyYesNo label="POSM" value={sp.posm} />
                  <ReadOnlyYesNo label="Eye Level" value={sp.eyeLevel} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Secondary Display ({visit.secondaryDisplayCount})</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {visit.secondaryDisplayPhotos.map((url, i) => (
                <PhotoLightbox key={i} src={url} alt={'Secondary ' + (i + 1)} thumbStyle={{ width: 60, height: 60, borderRadius: 6 }} />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Catatan Head Office</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: alasan dikirim balik ke RSM"
              rows={3}
              style={{ width: '100%', padding: 8, fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>

          {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
          {saved && <p style={{ color: 'green', fontSize: 13 }}>Review Head Office tersimpan.</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleDecision('approved')}
              disabled={saving}
              style={{ padding: '8px 16px', fontWeight: 'bold', background: 'var(--accent)', color: 'var(--accent-text)' }}
            >
              {saving ? 'Menyimpan...' : 'Setujui Final'}
            </button>
            <button
              onClick={() => handleDecision('sent_back')}
              disabled={saving}
              style={{ padding: '8px 16px', fontWeight: 'bold', background: 'var(--danger)', color: 'var(--accent-text)' }}
            >
              {saving ? 'Menyimpan...' : 'Kirim Balik ke RSM'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HeadOfficeReview() {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [range, setRange] = useState(presetRange('4weeks'));
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getStores()
      .then(setStores)
      .catch((err) => setError(err.message));
  }, []);

  function reload() {
    getVisitsForHeadOfficeReview({ startDate: range.startDate, endDate: range.endDate, storeId: storeId || undefined })
      .then(setVisits)
      .catch((err) => setError(err.message || 'Gagal memuat kunjungan'));
  }

  useEffect(reload, [range, storeId]);

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Review Head Office</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Kunjungan yang sudah direview RSM, menunggu persetujuan final Head Office.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setRange(presetRange('week'))} style={{ padding: '6px 12px' }}>
          Minggu ini
        </button>
        <button onClick={() => setRange(presetRange('4weeks'))} style={{ padding: '6px 12px' }}>
          4 Minggu Terakhir
        </button>
        <button onClick={() => setRange(presetRange('month'))} style={{ padding: '6px 12px' }}>
          Bulan ini
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>
          Dari
          <input
            type="date"
            value={range.startDate}
            onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
            style={{ display: 'block', padding: 6 }}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          Sampai
          <input
            type="date"
            value={range.endDate}
            onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
            style={{ display: 'block', padding: 6 }}
          />
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

      {!visits ? (
        <p>Memuat...</p>
      ) : visits.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Tidak ada kunjungan yang sudah direview RSM di periode/toko ini.</p>
      ) : (
        visits.map((v) => <HeadOfficeReviewCard key={v.visitId} visit={v} onSaved={reload} />)
      )}
    </div>
  );
}
