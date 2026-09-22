import { useEffect, useState } from 'react';
import { getMerchandisers, getAreas, getStores, createPendingMerchandiser, assignMerchandiserStores, getSession } from '../lib/api';

function scopedAreas(areas, user) {
  if (user.role === 'admin') return areas;
  if (user.role === 'manager') return areas.filter((a) => a.regionId === user.regionId);
  return areas.filter((a) => a.areaId === user.areaId);
}

function AddMerchandiserForm({ areas, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState(areas[0]?.areaId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !areaId) return;
    setSaving(true);
    setError('');
    try {
      await createPendingMerchandiser({ name: name.trim(), areaId });
      setName('');
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err.message || 'Gagal menambah merchandiser');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ marginBottom: 16 }}>
        + Tambah Merchandiser
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 16 }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Tambah Merchandiser</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0 }}>
        Ini hanya mendaftarkan nama dan area. Username dan PIN untuk login tetap dibuatkan oleh admin sebelum
        merchandiser ini bisa masuk ke aplikasi.
      </p>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Nama
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }} />
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

function AssignStoresForm({ merchandiser, allStores, onSaved }) {
  const [selected, setSelected] = useState(merchandiser.storeIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggle(storeId) {
    setSelected((prev) => (prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId]));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await assignMerchandiserStores(merchandiser.userId, selected);
      onSaved();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan penugasan toko');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Tugaskan Toko</div>
      {allStores.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Tidak ada toko di area ini.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {allStores.map((s) => (
            <label key={s.storeId} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={selected.includes(s.storeId)} onChange={() => toggle(s.storeId)} />
              {s.name}
            </label>
          ))}
        </div>
      )}
      {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
      <button onClick={handleSave} disabled={saving} style={{ marginTop: 8 }}>
        {saving ? 'Menyimpan...' : 'Simpan Penugasan'}
      </button>
    </div>
  );
}

export default function Merchandisers() {
  const [list, setList] = useState(null);
  const [stores, setStores] = useState([]);
  const [areas, setAreas] = useState([]);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const session = getSession();
  const user = session?.user;
  const canManage = user && ['supervisor', 'manager', 'admin'].includes(user.role);

  function load() {
    getMerchandisers()
      .then(setList)
      .catch((err) => setError(err.message || 'Gagal memuat daftar merchandiser'));
  }

  useEffect(() => {
    load();
    if (canManage) {
      getStores()
        .then(setStores)
        .catch(() => {});
      getAreas()
        .then((all) => setAreas(scopedAreas(all, user)))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!list) return <p>Memuat...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Merchandiser</h2>
      {canManage && areas.length > 0 && <AddMerchandiserForm areas={areas} onCreated={load} />}
      {list.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Tidak ada merchandiser di area Anda.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {list.map((m) => (
          <li key={m.userId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === m.userId ? null : m.userId)}
            >
              <div>
                <div style={{ fontWeight: 'bold' }}>
                  {m.name}
                  {m.pending && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 'normal',
                        color: 'var(--warning-text, #a15c00)',
                        background: 'var(--warning-bg)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      Menunggu Aktivasi
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{m.storeNames.join(', ') || 'Belum ada toko'}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'right' }}>
                {m.lastVisit ? (
                  <>
                    Kunjungan terakhir:
                    <br />
                    {new Date(m.lastVisit.checkInTime).toLocaleDateString('id-ID')}
                  </>
                ) : (
                  'Belum ada kunjungan'
                )}
              </div>
            </div>

            {expanded === m.userId && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Rencana Kunjungan</div>
                {m.journeyPlan.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Belum ada rencana kunjungan.</p>
                ) : (
                  <ul style={{ fontSize: 13, paddingLeft: 20 }}>
                    {m.journeyPlan.map((p) => (
                      <li key={p.planId}>
                        {p.storeId} — {p.plannedDate}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && (
                  <AssignStoresForm
                    merchandiser={m}
                    allStores={stores}
                    onSaved={load}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
