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

export default function VisitForm({ visit, onDone }) {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState({}); // sku -> bool
  const [stockTake, setStockTake] = useState({}); // sku -> count
  const [primaryPhoto, setPrimaryPhoto] = useState(null); // { base64, mimeType }
  const [secondaryPhoto, setSecondaryPhoto] = useState(null);
  const [primaryPreview, setPrimaryPreview] = useState(null);
  const [secondaryPreview, setSecondaryPreview] = useState(null);
  const [compressing, setCompressing] = useState({ primary: false, secondary: false });
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
  }, []);

  function setAvailabilityField(sku, field, value) {
    setAvailability((s) => ({ ...s, [sku]: { ...s[sku], [field]: value } }));
  }

  async function handlePhotoChange(e, which) {
    const file = e.target.files[0];
    if (!file) return;
    setCompressing((s) => ({ ...s, [which]: true }));
    try {
      const result = await compressPhoto(file);
      const previewUrl = URL.createObjectURL(file);
      if (which === 'primary') {
        setPrimaryPhoto(result);
        setPrimaryPreview(previewUrl);
      } else {
        setSecondaryPhoto(result);
        setSecondaryPreview(previewUrl);
      }
    } catch (err) {
      setError('Gagal memproses foto: ' + err.message);
    } finally {
      setCompressing((s) => ({ ...s, [which]: false }));
    }
  }

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
        primaryPhoto,
        secondaryPhoto,
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
        <p style={{ fontSize: 13, color: '#555' }}>
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
    return <p>Memuat daftar produk...</p>;
  }

  const grouped = groupByPacktype(products);

  return (
    <div>
      <h2 style={{ fontSize: 16 }}>{visit.store ? visit.store.name : visit.storeId}</h2>

      <section style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14 }}>1. Ketersediaan Produk</h3>
        <p style={{ fontSize: 12, color: '#555' }}>
          Centang produk yang benar-benar terlihat tersedia di toko, lalu isi jumlah stok dalam pcs atau carton.
        </p>
        {Object.entries(grouped).map(([packtype, items]) => (
          <div key={packtype} style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 'bold', fontSize: 13 }}>{packtype}</div>
            {items.map((p) => {
              const entry = availability[p.sku] || { available: true, cartonQty: '', pcsQty: '' };
              return (
                <div key={p.sku} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={entry.available}
                      onChange={(e) => setAvailabilityField(p.sku, 'available', e.target.checked)}
                    />
                    {p.name} {p.msl ? <span style={{ color: '#a15c00' }}>(MSL)</span> : null}
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
                      <span style={{ fontSize: 12, color: '#555' }}>carton</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        placeholder="0"
                        style={{ width: 60, padding: 4 }}
                        value={entry.pcsQty}
                        onChange={(e) => setAvailabilityField(p.sku, 'pcsQty', e.target.value)}
                      />
                      <span style={{ fontSize: 12, color: '#555' }}>pcs</span>
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
                  <span style={{ color: '#888' }}> — target {p.expectedFacing} facing{p.msl ? ', MSL' : ''}</span>
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
        <h3 style={{ fontSize: 14 }}>3. Foto Rak Primer</h3>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoChange(e, 'primary')} />
        {compressing.primary && <p style={{ fontSize: 12 }}>Memproses foto...</p>}
        {primaryPreview && <img src={primaryPreview} alt="Foto rak primer" style={{ width: '100%', marginTop: 8, borderRadius: 8 }} />}
      </section>

      <section style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14 }}>4. Foto Rak Sekunder</h3>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoChange(e, 'secondary')} />
        {compressing.secondary && <p style={{ fontSize: 12 }}>Memproses foto...</p>}
        {secondaryPreview && <img src={secondaryPreview} alt="Foto rak sekunder" style={{ width: '100%', marginTop: 8, borderRadius: 8 }} />}
      </section>

      <button
        onClick={handleSubmit}
        disabled={submitting || compressing.primary || compressing.secondary}
        style={{ width: '100%', padding: 12, marginTop: 24, fontWeight: 'bold' }}
      >
        {submitting ? 'Menyimpan...' : 'Selesai & Simpan Kunjungan'}
      </button>
    </div>
  );
}
