import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStores, getAreas, createStore, getSession } from '../lib/api';

function scopedAreas(areas, user) {
  if (user.role === 'admin') return areas;
  if (user.role === 'manager') return areas.filter((a) => a.regionId === user.regionId);
  return areas.filter((a) => a.areaId === user.areaId);
}

function AddStoreForm({ areas, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [channel, setChannel] = useState('');
  const [areaId, setAreaId] = useState(areas[0]?.areaId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !areaId) return;
    setSaving(true);
    setError('');
    try {
      await createStore({ name: name.trim(), address, channel, areaId });
      setName('');
      setAddress('');
      setChannel('');
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err.message || 'Gagal menambah toko');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ marginBottom: 16 }}>
        + Tambah Toko
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 16 }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Tambah Toko</div>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Nama Toko
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }} />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Alamat
        <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }} />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Channel
        <input value={channel} onChange={(e) => setChannel(e.target.value)} style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }} />
      </label>
      {areas.length > 1 && (
        <label style={{ display: 'block', marginBottom: 8 }}>
          Area
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}>
            {areas.map((a) => (
              <option key={a.areaId} value={a.areaId}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Batal
        </button>
      </div>
    </form>
  );
}

export default function Stores() {
  const [stores, setStores] = useState(null);
  const [areas, setAreas] = useState([]);
  const [error, setError] = useState('');
  const session = getSession();
  const user = session?.user;
  const canAdd = user && ['supervisor', 'manager', 'admin'].includes(user.role);

  function load() {
    getStores()
      .then(setStores)
      .catch((err) => setError(err.message || 'Gagal memuat daftar toko'));
  }

  useEffect(() => {
    load();
    if (canAdd) {
      getAreas()
        .then((all) => setAreas(scopedAreas(all, user)))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!stores) return <p>Memuat...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Toko</h2>
      {canAdd && areas.length > 0 && <AddStoreForm areas={areas} onCreated={load} />}
      {stores.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Tidak ada toko di area Anda.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {stores.map((s) => (
          <li key={s.storeId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ fontWeight: 'bold' }}>{s.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.address}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.channel}</div>
            <Link to={`/stores/${s.storeId}`} style={{ display: 'inline-block', marginTop: 8, fontSize: 13 }}>
              Kelola profil produk toko &rarr;
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
