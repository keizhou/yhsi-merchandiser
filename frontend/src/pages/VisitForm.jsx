import { useEffect, useState } from 'react';
import { getProducts } from '../lib/api';
import { compressPhoto } from '../lib/photo';
import { enqueueVisit } from '../lib/queue';

function groupByPacktype(products) {
  const groups = {};
  products.forEach((p) => {
    if (!groups[p.packtype]) groups[p.packtype] = [];
    groups[p.packtype].push(p);
  });
  return groups;
}

let slotIdCounter = 0;
function newSlot(label) {
  slotIdCounter += 1;
  return { id: slotIdCounter, label: label || 'Rak', photo: null, preview: null, compressing: false };
}

let activityIdCounter = 0;
function newActivity() {
  activityIdCounter += 1;
  return { id: activityIdCounter, comment: '', photo: null, preview: null, compressing: false };
}

let competitorIdCounter = 0;
function newCompetitor() {
  competitorIdCounter += 1;
  return { id: competitorIdCounter, name: '', price: '' }; // price: digits only, shown with thousand dots
}

function formatPrice(digits) {
  return digits ? Number(digits).toLocaleString('id-ID') : '';
}

const STEP_TITLES = ['Ketersediaan Produk', 'Facing dan Foto Rak', 'Secondary Display', 'Competitor Monitoring'];

function CommentBox({ value, onChange }) {
  return (
    <label style={{ display: 'block', fontSize: 13, marginTop: 12 }}>
      Komentar (opsional)
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Tulis catatan untuk supervisor"
        style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 4, fontFamily: 'inherit', fontSize: 13 }}
      />
    </label>
  );
}

const PREP_TASKS = [
  'Ngecek Display',
  'Mengisi Display Kosong di rak regular dan secondary display',
  'Mengecek stock dan ED',
];

// Products not listed yet in an area: hidden from the visit form (data stays in the Products sheet).
// Match by area and by SKU name / pack type.
const NOT_LISTED_BY_AREA = {
  'AREA-JKT': (p) => p.packtype === 'PET' || /Supersprout/i.test(p.name),
};

const ED_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const ED_YEARS = ['2026', '2027', '2028', '2029'];

export default function VisitForm({ visit, onDone }) {
  const [prepDone, setPrepDone] = useState(false);
  const [prepChecks, setPrepChecks] = useState(() => PREP_TASKS.map(() => false));
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState({}); // sku -> bool
  const [stockTake, setStockTake] = useState({}); // sku -> count

  // Shelf photos: starts with a single "Rak 1" slot (most stores only need
  // one), merchandiser adds more manually if this store actually has 2+
  // separate regular shelving sections.
  const [shelfSlots, setShelfSlots] = useState(() => [newSlot('Rak 1')]);

  // Secondary display: a count, then exactly that many photos.
  const [secondaryCount, setSecondaryCount] = useState('');
  const [secondaryPhotos, setSecondaryPhotos] = useState([]); // index -> {base64, mimeType}
  const [secondaryPreviews, setSecondaryPreviews] = useState([]); // index -> object URL
  const [secondaryCompressing, setSecondaryCompressing] = useState([]); // index -> bool

  // Assessment is 4 pages: [1 Ketersediaan], [2 Facing + 3 Foto Rak], [4 Secondary Display], [5 Competitor].
  const [step, setStep] = useState(0);
  const [comments, setComments] = useState({ availability: '', shelf: '', secondary: '' });
  const [competitors, setCompetitors] = useState(() => [newCompetitor()]);
  const [activities, setActivities] = useState(() => [newActivity()]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getProducts()
      .then((all) => {
        const hide = NOT_LISTED_BY_AREA[visit.store && visit.store.areaId];
        const list = hide ? all.filter((p) => !hide(p)) : all;
        setProducts(list);
        // Nothing pre-checked — merchandiser actively marks what they actually see,
        // rather than us assuming everything's in stock by default.
        const initial = {};
        list.forEach((p) => (initial[p.sku] = { available: false, cartonQty: '', pcsQty: '', edMonth: '', edYear: '' }));
        setAvailability(initial);
      })
      .catch((err) => setError(err.message || 'Gagal memuat daftar produk'));
  }, [visit.storeId]);

  function setAvailabilityField(sku, field, value) {
    setAvailability((s) => ({ ...s, [sku]: { ...s[sku], [field]: value } }));
  }

  function addShelfSlot() {
    setShelfSlots((slots) => [...slots, newSlot('Rak ' + (slots.length + 1))]);
  }

  function removeShelfSlot(id) {
    setShelfSlots((slots) => slots.filter((s) => s.id !== id));
  }

  function updateShelfSlot(id, patch) {
    setShelfSlots((slots) => slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function handleShelfPhotoChange(e, id) {
    const file = e.target.files[0];
    if (!file) return;
    updateShelfSlot(id, { compressing: true });
    try {
      const result = await compressPhoto(file);
      updateShelfSlot(id, { photo: result, preview: URL.createObjectURL(file), compressing: false });
    } catch (err) {
      setError('Gagal memproses foto: ' + err.message);
      updateShelfSlot(id, { compressing: false });
    }
  }

  function handleSecondaryCountChange(value) {
    const n = Math.max(0, Number(value) || 0);
    setSecondaryCount(value);
    // Resize the photo/preview/compressing arrays to match the new count,
    // keeping whatever was already captured for the slots that still exist.
    setSecondaryPhotos((prev) => Array.from({ length: n }, (_, i) => prev[i] || null));
    setSecondaryPreviews((prev) => Array.from({ length: n }, (_, i) => prev[i] || null));
    setSecondaryCompressing((prev) => Array.from({ length: n }, (_, i) => prev[i] || false));
  }

  async function handleSecondaryPhotoChange(e, index) {
    const file = e.target.files[0];
    if (!file) return;
    setSecondaryCompressing((s) => s.map((v, i) => (i === index ? true : v)));
    try {
      const result = await compressPhoto(file);
      setSecondaryPhotos((s) => s.map((v, i) => (i === index ? result : v)));
      setSecondaryPreviews((s) => s.map((v, i) => (i === index ? URL.createObjectURL(file) : v)));
    } catch (err) {
      setError('Gagal memproses foto: ' + err.message);
    } finally {
      setSecondaryCompressing((s) => s.map((v, i) => (i === index ? false : v)));
    }
  }

  function updateCompetitor(id, patch) {
    setCompetitors((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function updateActivity(id, patch) {
    setActivities((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function handleActivityPhotoChange(e, id) {
    const file = e.target.files[0];
    if (!file) return;
    updateActivity(id, { compressing: true });
    try {
      const result = await compressPhoto(file);
      updateActivity(id, { photo: result, preview: URL.createObjectURL(file), compressing: false });
    } catch (err) {
      setError('Gagal memproses foto: ' + err.message);
      updateActivity(id, { compressing: false });
    }
  }

  const anyCompressing =
    (shelfSlots || []).some((s) => s.compressing) ||
    secondaryCompressing.some(Boolean) ||
    activities.some((a) => a.compressing);

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const visitId = crypto.randomUUID();
      await enqueueVisit({
        visitId,
        storeId: visit.storeId,
        journeyPlanId: visit.planId,
        checkInTime: new Date().toISOString(),
        status: 'submitted',
        availability,
        stockTake,
        shelfPhotos: (shelfSlots || [])
          .filter((s) => s.photo)
          .map((s) => ({ packtype: s.label, photo: s.photo })),
        secondaryDisplayCount: Number(secondaryCount) || 0,
        secondaryDisplayPhotos: secondaryPhotos.filter(Boolean),
        comments,
        competitorPrices: competitors
          .filter((c) => c.name.trim() || c.price)
          .map((c) => ({ name: c.name.trim(), price: Number(c.price) || 0 })),
        competitorActivities: activities
          .filter((a) => a.photo || a.comment.trim())
          .map((a) => ({ photo: a.photo, comment: a.comment.trim() })),
      });
      setSubmitted(true);
    } catch (err) {
      setError('Gagal menyimpan kunjungan: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!prepDone) {
    const allChecked = prepChecks.every(Boolean);
    return (
      <div>
        <h2 style={{ fontSize: 16 }}>{visit.store ? visit.store.name : visit.storeId}</h2>
        <p style={{ fontWeight: 'bold', marginTop: 16 }}>Lakukan tugas regularmu:</p>
        <ol style={{ paddingLeft: 20 }}>
          {PREP_TASKS.map((task, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={prepChecks[i]}
                  onChange={(e) =>
                    setPrepChecks((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))
                  }
                  style={{ marginTop: 3 }}
                />
                {task}
              </label>
            </li>
          ))}
        </ol>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Setelah semua selesai silahkan klik untuk memulai asesmen.</p>
        <button
          onClick={() => setPrepDone(true)}
          disabled={!allChecked}
          style={{ width: '100%', padding: 12, fontWeight: 'bold' }}
        >
          Mulai Asesmen
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div>
        <p style={{ fontWeight: 'bold' }}>Kunjungan tersimpan.</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Data akan otomatis terkirim ke server saat ada koneksi internet (bisa dicek di indikator sinkronisasi).
        </p>
        <button onClick={onDone} style={{ marginTop: 12, padding: '8px 16px' }}>
          Kembali ke rencana kunjungan
        </button>
      </div>
    );
  }

  if (error) {
    return <p style={{ color: 'crimson' }}>{error}</p>;
  }

  if (!products) {
    return <p>Memuat...</p>;
  }

  const grouped = groupByPacktype(products);

  return (
    <div>
      <h2 style={{ fontSize: 16 }}>{visit.store ? visit.store.name : visit.storeId}</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
        Halaman {step + 1} dari {STEP_TITLES.length}: {STEP_TITLES[step]}
      </p>

      {step === 0 && (
      <section style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14 }}>1. Ketersediaan Produk</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Centang produk yang benar-benar terlihat tersedia di toko, lalu isi jumlah stok dalam pcs atau carton.
        </p>
        {Object.entries(grouped).map(([packtype, items]) => (
          <div key={packtype} style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 'bold', fontSize: 13 }}>{packtype}</div>
            {items.map((p) => {
              const entry = availability[p.sku] || { available: true, cartonQty: '', pcsQty: '' };
              return (
                <div key={p.sku} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={entry.available}
                      onChange={(e) => setAvailabilityField(p.sku, 'available', e.target.checked)}
                    />
                    {p.name} {p.msl ? <span style={{ color: 'var(--warning)' }}>(MSL)</span> : null}
                  </label>
                  {entry.available && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, marginLeft: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        placeholder="0"
                        style={{ width: 60, padding: 4 }}
                        value={entry.cartonQty}
                        onChange={(e) => setAvailabilityField(p.sku, 'cartonQty', e.target.value)}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>carton</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        placeholder="0"
                        style={{ width: 60, padding: 4 }}
                        value={entry.pcsQty}
                        onChange={(e) => setAvailabilityField(p.sku, 'pcsQty', e.target.value)}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>pcs</span>
                      <select
                        value={entry.edMonth}
                        onChange={(e) => setAvailabilityField(p.sku, 'edMonth', e.target.value)}
                        style={{ padding: 4 }}
                      >
                        <option value="">Bulan ED</option>
                        {ED_MONTHS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={entry.edYear}
                        onChange={(e) => setAvailabilityField(p.sku, 'edYear', e.target.value)}
                        style={{ padding: 4 }}
                      >
                        <option value="">Tahun ED</option>
                        {ED_YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <CommentBox value={comments.availability} onChange={(v) => setComments((c) => ({ ...c, availability: v }))} />
      </section>
      )}

      {step === 1 && (<>
      <section style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14 }}>2. Jumlah Facing</h3>
        {Object.entries(grouped).map(([packtype, items]) => (
          <div key={packtype} style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 'bold', fontSize: 13 }}>{packtype}</div>
            {items.map((p) => (
              <label key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                <span style={{ flex: 1 }}>
                  {p.name}
                  <span style={{ color: 'var(--text-muted)' }}> — target {p.expectedFacing} facing{p.msl ? ', MSL' : ''}</span>
                </span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  style={{ width: 60, padding: 4 }}
                  value={stockTake[p.sku] ?? ''}
                  onChange={(e) => setStockTake((s) => ({ ...s, [p.sku]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
        ))}
      </section>

      <section style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14 }}>3. Foto Rak</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Mulai dengan 1 foto rak. Jika toko ini punya 2 atau lebih rak reguler yang terpisah, tambah foto lagi.
        </p>
        {shelfSlots.map((slot) => (
          <div key={slot.id} style={{ marginTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                value={slot.label}
                onChange={(e) => updateShelfSlot(slot.id, { label: e.target.value })}
                style={{ fontSize: 13, fontWeight: 'bold', padding: 4, flex: 1 }}
              />
              <button type="button" onClick={() => removeShelfSlot(slot.id)} style={{ padding: '4px 8px' }}>
                Hapus
              </button>
            </div>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => handleShelfPhotoChange(e, slot.id)} style={{ marginTop: 6 }} />
            {slot.compressing && <p style={{ fontSize: 12 }}>Memproses foto...</p>}
            {slot.preview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <img src={slot.preview} alt={slot.label} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>Foto tersimpan</span>
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={addShelfSlot} style={{ marginTop: 8, padding: '6px 12px' }}>
          + Tambah Foto Rak
        </button>
        <CommentBox value={comments.shelf} onChange={(v) => setComments((c) => ({ ...c, shelf: v }))} />
      </section>
      </>)}

      {step === 2 && (
      <section style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14 }}>4. Secondary Display</h3>
        <label style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
          Berapa banyak secondary display di toko ini?
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={secondaryCount}
            onChange={(e) => handleSecondaryCountChange(e.target.value)}
            style={{ display: 'block', width: 80, padding: 6, marginTop: 4 }}
          />
        </label>
        {secondaryPhotos.map((_, i) => (
          <div key={i} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold' }}>Secondary display #{i + 1}</div>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => handleSecondaryPhotoChange(e, i)} />
            {secondaryCompressing[i] && <p style={{ fontSize: 12 }}>Memproses foto...</p>}
            {secondaryPreviews[i] && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <img src={secondaryPreviews[i]} alt={'Secondary display ' + (i + 1)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>Foto tersimpan</span>
              </div>
            )}
          </div>
        ))}
        <CommentBox value={comments.secondary} onChange={(v) => setComments((c) => ({ ...c, secondary: v }))} />
      </section>
      )}

      {step === 3 && (
      <section style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14 }}>5. Competitor Monitoring</h3>

        <div style={{ fontSize: 13, fontWeight: 'bold', marginTop: 8 }}>5.1 Kompetitor dan Harga</div>
        {competitors.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Nama kompetitor"
              value={c.name}
              onChange={(e) => updateCompetitor(c.id, { name: e.target.value })}
              style={{ flex: 1, minWidth: 0, padding: 6 }}
            />
            <span style={{ fontSize: 13 }}>Rp</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Harga"
              value={formatPrice(c.price)}
              onChange={(e) => updateCompetitor(c.id, { price: e.target.value.replace(/\D/g, '') })}
              style={{ width: 100, padding: 6, textAlign: 'right' }}
            />
            {competitors.length > 1 && (
              <button type="button" onClick={() => setCompetitors((l) => l.filter((x) => x.id !== c.id))} style={{ padding: '4px 8px' }}>
                Hapus
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setCompetitors((l) => [...l, newCompetitor()])} style={{ marginTop: 8, padding: '6px 12px' }}>
          + Tambah Kompetitor
        </button>

        <div style={{ fontSize: 13, fontWeight: 'bold', marginTop: 20 }}>5.2 Aktivitas Kompetitor</div>
        {activities.map((a, i) => (
          <div key={a.id} style={{ marginTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>Aktivitas #{i + 1}</span>
              {activities.length > 1 && (
                <button type="button" onClick={() => setActivities((l) => l.filter((x) => x.id !== a.id))} style={{ padding: '4px 8px' }}>
                  Hapus
                </button>
              )}
            </div>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => handleActivityPhotoChange(e, a.id)} style={{ marginTop: 6 }} />
            {a.compressing && <p style={{ fontSize: 12 }}>Memproses foto...</p>}
            {a.preview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <img src={a.preview} alt={'Aktivitas ' + (i + 1)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>Foto tersimpan</span>
              </div>
            )}
            <textarea
              value={a.comment}
              onChange={(e) => updateActivity(a.id, { comment: e.target.value })}
              rows={2}
              placeholder="Komentar tentang aktivitas kompetitor"
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, marginTop: 8, fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>
        ))}
        <button type="button" onClick={() => setActivities((l) => [...l, newActivity()])} style={{ marginTop: 8, padding: '6px 12px' }}>
          + Tambah Aktivitas
        </button>
      </section>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        {step > 0 && (
          <button onClick={() => setStep((n) => n - 1)} disabled={submitting} style={{ flex: 1, padding: 12 }}>
            &larr; Kembali
          </button>
        )}
        {step < STEP_TITLES.length - 1 ? (
          <button
            onClick={() => {
              setStep((n) => n + 1);
              window.scrollTo(0, 0);
            }}
            disabled={anyCompressing}
            style={{ flex: 2, padding: 12, fontWeight: 'bold' }}
          >
            Lanjut &rarr;
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting || anyCompressing} style={{ flex: 2, padding: 12, fontWeight: 'bold' }}>
            {submitting ? 'Menyimpan...' : 'Selesai & Simpan Kunjungan'}
          </button>
        )}
      </div>
    </div>
  );
}
