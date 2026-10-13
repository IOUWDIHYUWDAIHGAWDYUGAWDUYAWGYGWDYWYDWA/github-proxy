export const downloadLimit = 50 * 1024 * 1024;

export function downloadName(disposition, fallback = 'download') {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let filename = disposition?.match(/filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i);
  filename = filename?.[1] || filename?.[2] || fallback;
  if (encoded) { try { filename = decodeURIComponent(encoded.trim()); } catch {} }
  return filename.trim().replace(/[\\/\x00-\x1f<>:"|?*]/g, '_').slice(0, 200) || 'download';
}

export async function saveDownload(body, filename, type = 'application/octet-stream') {
  if (!body) throw new Error('Dosya içeriği alınamadı.');
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > downloadLimit) { await reader.cancel(); throw new Error('Bu sürümde dosya indirme sınırı 50 MB.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const url = URL.createObjectURL(new Blob(chunks, { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = downloadName(null, filename);
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
