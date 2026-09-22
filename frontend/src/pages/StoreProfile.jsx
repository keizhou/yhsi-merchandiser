import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getStoreProducts, setStoreProducts, getMerchandisers, assignMerchandiserStores, getSession } from '../lib/api';

function groupByPacktype(products) {
  const groups = {};
  products.forEach((p) => {
    if (!groups[p.packtype]) groups[p.packtype] = [];
    groups[p.packtype].push(p);
  });
  return groups;
}

function AssignMerchandisersSection({ storeId, merchandisers, onSaved }) {
  const [selected, setSelected] = useState(
    () => new Set(merchandisers.filter((m) => m.storeIds.includes(storeId)).map((m) => m.userId))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggle(userId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const changed = merchandisers.filter((m) => selected.has(m.userId) !== m.storeIds.includes(storeId));
      await Promise.all(
        changed.map((m) => {
          const newStoreIds = selected.has(m.userId) ? [...m.storeIds, storeId] : m.storeIds.filter((id) => id !== storeId);
          return assignMerchandiserStores(m.userId, newStoreIds);
        })
      );
      onSaved();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan penugasan merchandiser');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 16, marginBottom: 24, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>Merchandiser di Toko Ini</div>
      {merchandisers.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Tidak ada merchandiser di area ini.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {merchandisers.map((m) => (
            <label key={m.userId} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={selected.has(m.userId)} onChange={() => toggle(m.userId)} />
              {m.name}
              {m.pending && <span style={{ color: 'var(--text-muted)' }}> (Menunggu Aktivasi)</span>}
            </label>
          ))}
        </div>
      )}
      {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
      <button onClick={handleSave} disabled={saving} style={{ marginTop: 8 }}>
        {saving ? 'Menyimpan...' : 'Simpan Penugasan Merchandiser'}
      </button>
    </div>
  );
}

export default function StoreProfile() {
  const { storeId } = useParams();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [merchandisers, setMerchandisers] = useState(null);
  const session = getSession();
  const canAssign = session?.user && ['supervisor', 'manager', 'admin'].includes(session.user.role);

  function loadMerchandisers() {
    getMerchandisers()
      .then(setMerchandisers)
      .catch(() => {});
  }

  useEffect(() => {
    getStoreProducts(storeId)
      .then(setItems)
      .catch((err) => setError(err.message || 'Gagal memuat profil produk toko'));
    if (canAssign) loadMerchandisers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function updateItem(sku, field, value) {
    setSaved(false);
    setItems((prev) => prev.map((p) => (p.sku === sku ? { ...p, [field]: value } : p)));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await setStoreProducts(storeId, items);
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  if (error && !items) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!items) return <p>Memuat...</p>;

  const grouped = groupByPacktype(items);

  return (
    <div>
      <Link to="/stores" style={{ fontSize: 13 }}>
        &larr; Kembali ke daftar toko
      </Link>
      <h2 style={{ fontSize: 18, marginTop: 8 }}>Profil Produk Toko</h2>

      {canAssign && merchandisers && (
        <AssignMerchandisersSection key={storeId} storeId={storeId} merchandisers={merchandisers} onSaved={loadMerchandisers} />
      )}

      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Centang "Listed" untuk produk yang benar-benar dijual di toko ini, "MSL" untuk produk wajib ada, dan atur
        target facing per produk.
      </p>

      {Object.entries(grouped).map(([packtype, products]) => (
        <div key={packtype} style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 'bold', fontSize: 14 }}>{packtype}</div>
          {products.map((p) => (
            <div
              key={p.sku}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}
            >
              <span style={{ flex: 1 }}>{p.name}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={p.listed} onChange={(e) => updateItem(p.sku, 'listed', e.target.checked)} />
                Listed
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={p.msl}
                  disabled={!p.listed}
                  onChange={(e) => updateItem(p.sku, 'msl', e.target.checked)}
                />
                MSL
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Target facing
                <input
                  type="number"
                  min="1"
                  disabled={!p.listed}
                  value={p.expectedFacing || ''}
                  onChange={(e) => updateItem(p.sku, 'expectedFacing', Number(e.target.value))}
                  style={{ width: 50, padding: 4 }}
                />
              </label>
            </div>
          ))}
        </div>
      ))}

      {error && <p style={{ color: 'crimson', marginTop: 12 }}>{error}</p>}
      {saved && <p style={{ color: 'green', marginTop: 12 }}>Tersimpan.</p>}
      <button onClick={handleSave} disabled={saving} style={{ marginTop: 16, padding: '10px 20px', fontWeight: 'bold' }}>
        {saving ? 'Menyimpan...' : 'Simpan'}
      </button>
    </div>
  );
}
