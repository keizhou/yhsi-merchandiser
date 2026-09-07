// Compresses a photo before it ever touches the network or the offline
// queue. This is what keeps a personal Gmail's 15GB Drive quota lasting
// months instead of weeks, see the architecture plan for the math.

import imageCompression from 'browser-image-compression';

const COMPRESSION_OPTIONS = {
  maxWidthOrHeight: 1280,
  initialQuality: 0.7,
  maxSizeMB: 0.4, // ~400KB ceiling per photo
  useWebWorker: true,
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // reader.result is "data:image/jpeg;base64,AAAA..." — strip the prefix.
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * file: a File from an <input type="file" accept="image/*" capture="environment">
 * Returns { base64, mimeType } ready to attach to a visit submission.
 */
export async function compressPhoto(file) {
  const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
  const base64 = await blobToBase64(compressed);
  return { base64, mimeType: compressed.type || 'image/jpeg' };
}
