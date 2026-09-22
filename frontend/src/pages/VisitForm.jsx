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

export default function VisitForm({ visit, onDone }) {
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

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getProducts()
      .then((list) => {
        setProducts(list);
        // Nothing pre-checked — merchandiser actively marks what they actually see,
        // rather than us assuming everything's in stock by default.
        const initial = {};
        list.forEach((p) => (initial[p.sku] = { available: false, cartonQty: '', pcsQty: '' }));
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

  const anyCompressing = (shelfSlots || []).some((s) => s.compressing) || secondaryCompressing.some(Boolean);

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
      });
      setSubmitted(true);
    } catch (err) {
      setError('Gagal menyimpan kunjungan: ' + err.message);
    } finally {
      setSubmitting(false);
    }
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
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, marginLeft: 24, alignItems: 'center' }}>
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <section style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14 }}>2. Stock Take (Jumlah Facing)</h3>
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
      </section>

      <section style={{ marginTop: 24 }}>
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
      </section>

      <button
        onClick={handleSubmit}
        disabled={submitting || anyCompressing}
        style={{ width: '100%', padding: 12, marginTop: 24, fontWeight: 'bold' }}
      >
        {submitting ? 'Menyimpan...' : 'Selesai & Simpan Kunjungan'}
      </button>
    </div>
  );
}
