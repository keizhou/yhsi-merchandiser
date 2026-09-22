import { useEffect, useState } from 'react';

/**
 * Photos are served through our own backend as a JSON-wrapped base64 data
 * URI (Apps Script can't return raw binary from a Web App, and hotlinking
 * Drive URLs directly in an <img> tag is unreliable, see backend/Api.js).
 * This fetches that once, caches it, then renders a normal <img>.
 * Click to expand full-size, click outside or Escape to close.
 */

const cache = new Map();

export default function PhotoLightbox({ src: apiUrl, alt, thumbStyle }) {
  const [dataUri, setDataUri] = useState(() => cache.get(apiUrl) || null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!apiUrl || dataUri) return;
    fetch(apiUrl)
      .then((res) => res.json())
      .then((result) => {
        if (result.ok) {
          cache.set(apiUrl, result.dataUri);
          setDataUri(result.dataUri);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  if (!apiUrl) return null;
  if (error) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gagal memuat foto</span>;
  if (!dataUri) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Memuat foto...</span>;

  return (
    <>
      <img
        src={dataUri}
        alt={alt || ''}
        onClick={() => setOpen(true)}
        style={{ cursor: 'pointer', objectFit: 'cover', ...thumbStyle }}
      />
      {open && (
        <div
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          role="button"
          tabIndex={0}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'zoom-out',
          }}
        >
          <img src={dataUri} alt={alt || ''} style={{ maxWidth: '92%', maxHeight: '92%', objectFit: 'contain' }} />
        </div>
      )}
    </>
  );
}
