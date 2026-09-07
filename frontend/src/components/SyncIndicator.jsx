import { useEffect, useState } from 'react';
import { countPending, onQueueChange, startQueueSync } from '../lib/queue';

export default function SyncIndicator() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    startQueueSync();
    countPending().then(setPending);
    const unsubscribe = onQueueChange(setPending);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (pending === 0 && online) {
    return null; // nothing to report, stay out of the way
  }

  return (
    <div
      style={{
        fontSize: 12,
        padding: '6px 10px',
        borderRadius: 6,
        marginBottom: 12,
        background: online ? '#fff6e0' : '#fdeaea',
        color: online ? '#8a6100' : '#8a1f1f',
      }}
    >
      {!online && 'Tidak ada koneksi internet. '}
      {pending > 0 && `${pending} kunjungan menunggu dikirim ke server.`}
      {pending === 0 && !online && 'Data akan tersimpan di HP dan otomatis terkirim saat online.'}
    </div>
  );
}
