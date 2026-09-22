import { useEffect, useMemo, useState } from 'react';
import { getStores, getVisitsForVerification, submitVerification } from '../lib/api';
import PhotoLightbox from '../components/PhotoLightbox';

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset) {
  const now = new Date();
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // start of this week (Sun)
    return { startDate: isoDate(start), endDate: isoDate(now) };
  }
  if (preset === '4weeks') {
    const start = new Date(now);
    start.setDate(now.getDate() - 28);
    return { startDate: isoDate(start), endDate: isoDate(now) };
  }
  // month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: isoDate(start), endDate: isoDate(now) };
}

function YesNoToggle({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ minWidth: 90 }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(true)}
        style={{ padding: '4px 10px', background: value === true ? 'var(--accent)' : 'var(--border-subtle)', color: value === true ? 'var(--accent-text)' : 'var(--text)' }}
      >
        Ya
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        style={{ padding: '4px 10px', background: value === false ? 'var(--danger)' : 'var(--border-subtle)', color: value === false ? 'var(--accent-text)' : 'var(--text)' }}
      >
        Tidak
      </button>
    </div>
  );
}

function VisitReviewCard({ visit, onSaved }) {
  const existing = visit.verification;
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(existing ? existing.notes || '' : '');
  const [planogram, setPlanogram] = useState(() => {
    try {
      return existing ? JSON.parse(existing.planogramJson || '{}') : {};
    } catch (e) {
      return {};
    }
  });
  const [posm, setPosm] = useState(() => {
    try {
      return existing ? JSON.parse(existing.posmJson || '{}') : {};
    } catch (e) {
      return {};
    }
  });
  const [eyeLevel, setEyeLevel] = useState(() => {
    try {
      return existing ? JSON.parse(existing.eyeLevelJson || '{}') : {};
    } catch (e) {
      return {};
    }
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const availableCount = Object.values(visit.availability).filter((a) => a.available).length;
  const totalCount = Object.values(visit.availability).length;

  // Every Planogram/POSM/Eye Level check has to actually be answered, an
  // unclicked Ya/Tidak must never silently count as compliant. OOS and
  // Facing are plain information now (nothing for the supervisor to
  // answer there), any issue with either goes in the notes box instead.
  function findUnanswered() {
    const missing = [];
    visit.shelfPhotos.forEach((sp) => {
      if (typeof planogram[sp.packtype] !== 'boolean') missing.push(`Planogram — ${sp.packtype}`);
      if (typeof posm[sp.packtype] !== 'boolean') missing.push(`POSM — ${sp.packtype}`);
      if (typeof eyeLevel[sp.packtype] !== 'boolean') missing.push(`Eye Level — ${sp.packtype}`);
    });
    return missing;
  }

  async function handleSave() {
    const missing = findUnanswered();
    if (missing.length > 0) {
      setError('Belum dijawab: ' + missing.join(', '));
      return;
    }

    // Status reflects what was actually answered: any "Tidak" anywhere
    // means this visit needs revision, only all-"Ya" counts as approved.
    const allPlanogramOk = visit.shelfPhotos.every((sp) => planogram[sp.packtype] === true);
    const allPosmOk = visit.shelfPhotos.every((sp) => posm[sp.packtype] === true);
    const allEyeLevelOk = visit.shelfPhotos.every((sp) => eyeLevel[sp.packtype] === true);
    const status = allPlanogramOk && allPosmOk && allEyeLevelOk ? 'approved' : 'revision_requested';

    setSaving(true);
    setError('');
    try {
      await submitVerification({
        visitId: visit.visitId,
        planogram,
        posm,
        eyeLevel,
        notes,
        status,
      });
      setSaved(true);
      onSaved && onSaved();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan verifikasi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setExpanded((e) => !e)}>
        <div>
          <div style={{ fontWeight: 'bold' }}>{new Date(visit.checkInTime).toLocaleString('id-ID')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{visit.storeName}</div>
        </div>
        <div style={{ fontSize: 12, color: !existing ? 'var(--warning)' : existing.status === 'approved' ? 'var(--accent)' : 'var(--danger)' }}>
          {!existing ? 'Menunggu verifikasi' : existing.status === 'approved' ? 'Disetujui' : 'Perlu revisi'}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>1. Stock Availability (OOS)</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              {availableCount} dari {totalCount} SKU tersedia.
            </p>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
              {(visit.availabilityDetail || []).map((a) => (
                <div
                  key={a.sku}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    fontSize: 12,
                    borderBottom: '1px solid var(--border-subtle)',
                    color: a.available ? 'var(--accent)' : 'var(--danger)',
                  }}
                >
                  <span>{a.name}</span>
                  <span>{a.available ? `Tersedia (${a.cartonQty || 0} carton, ${a.pcsQty || 0} pcs)` : 'Kosong (OOS)'}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>2. Facing vs Target</div>
            {visit.facing.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tidak ada data stock take.</p>}
            {visit.facing.map((f) => (
              <div
                key={f.sku}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  padding: '4px 0',
                  color: f.facing >= f.target ? 'var(--accent)' : 'var(--danger)',
                }}
              >
                <span>{f.name}</span>
                <span>
                  entri: {f.facing}, target: {f.target}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>3-5. Planogram, POSM, Eye Level (per foto rak)</div>
            {visit.shelfPhotos.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tidak ada foto rak.</p>}
            {visit.shelfPhotos.map((sp) => (
              <div key={sp.packtype} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <PhotoLightbox src={sp.photoUrl} alt={sp.packtype} thumbStyle={{ width: 80, height: 80, borderRadius: 6 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{sp.packtype}</div>
                  <YesNoToggle label="Planogram" value={planogram[sp.packtype]} onChange={(v) => setPlanogram((s) => ({ ...s, [sp.packtype]: v }))} />
                  <YesNoToggle label="POSM" value={posm[sp.packtype]} onChange={(v) => setPosm((s) => ({ ...s, [sp.packtype]: v }))} />
                  <YesNoToggle label="Eye Level" value={eyeLevel[sp.packtype]} onChange={(v) => setEyeLevel((s) => ({ ...s, [sp.packtype]: v }))} />
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
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Catatan</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder='Contoh: "Chrysanthemum kurang 1 facing", atau "Foto menunjukkan Grassjelly ada, tapi merchandiser tandai OOS"'
              rows={3}
              style={{ width: '100%', padding: 8, fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>

          {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
          {saved && <p style={{ color: 'green', fontSize: 13 }}>Verifikasi tersimpan.</p>}
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', fontWeight: 'bold' }}>
            {saving ? 'Menyimpan...' : 'Simpan Verifikasi'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Verification() {
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
    getVisitsForVerification({ startDate: range.startDate, endDate: range.endDate, storeId: storeId || undefined })
      .then(setVisits)
      .catch((err) => setError(err.message || 'Gagal memuat kunjungan'));
  }

  useEffect(reload, [range, storeId]);

  const eyeLevelTrend = useMemo(() => {
    if (!visits || !storeId) return [];
    return [...visits]
      .sort((a, b) => (a.checkInTime > b.checkInTime ? 1 : -1))
      .map((v) => ({ visitId: v.visitId, checkInTime: v.checkInTime, photo: v.shelfPhotos[0] }))
      .filter((v) => v.photo);
  }, [visits, storeId]);

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Verifikasi Kunjungan</h2>

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

      {storeId && eyeLevelTrend.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15 }}>Tren Eye Level ({eyeLevelTrend.length} kunjungan)</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bandingkan foto dari waktu ke waktu untuk toko ini.</p>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
            {eyeLevelTrend.map((v) => (
              <div key={v.visitId} style={{ textAlign: 'center', flexShrink: 0 }}>
                <PhotoLightbox src={v.photo.photoUrl} alt={v.photo.packtype} thumbStyle={{ width: 90, height: 90, borderRadius: 6 }} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {new Date(v.checkInTime).toLocaleDateString('id-ID')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!visits ? (
        <p>Memuat...</p>
      ) : visits.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Tidak ada kunjungan di periode/toko ini.</p>
      ) : (
        visits.map((v) => <VisitReviewCard key={v.visitId} visit={v} onSaved={reload} />)
      )}
    </div>
  );
}
