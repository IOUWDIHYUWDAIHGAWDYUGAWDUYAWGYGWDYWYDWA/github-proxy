import { readFile, writeFile } from 'node:fs/promises';

const infoPath = process.env.PREVIEW_INFO || '/tmp/github-proxy-preview/info.json';
const readmePath = new URL('../README.md', import.meta.url);

try {
  let content = await readFile(readmePath, 'utf8');
  const infoRaw = await readFile(infoPath, 'utf8').catch(() => null);

  const startMarker = '<!-- LIVE_PREVIEW_STATUS:START -->';
  const endMarker = '<!-- LIVE_PREVIEW_STATUS:END -->';

  let statusSection = '';

  if (infoRaw) {
    const info = JSON.parse(infoRaw);
    const remaining = Date.parse(info.expiresAt) - Date.now();
    const remMinutes = Math.max(0, Math.ceil(remaining / 60000));
    const hours = Math.floor(remMinutes / 60);
    const mins = remMinutes % 60;
    const timeStr = hours > 0 ? `${hours} saat ${mins} dakika` : `${mins} dakika`;
    const endTime = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(info.expiresAt));

    statusSection = `${startMarker}
> ### 🟢 CANLI PROXY TÜNELİ AKTİF
> * 🔗 **Doğrudan Cloudflare Adresi:** [${info.url}](${info.url})
> * 🌐 **Sabit GitHub Pages Sayfası:** [https://iouwdihyuwdaihgawdyugawduyawgygwdywydwa.github.io/github-proxy/](https://iouwdihyuwdaihgawdyugawduyawgygwdywydwa.github.io/github-proxy/)
> * ⏱️ **Kalan Süre:** ~${timeStr} (Bitiş: ${endTime} TSİ)
> * ⚡ **Yenileme:** Oturum otomatik olarak yenilenir veya Actions üzerinden dilediğiniz an sıfırlanabilir.
${endMarker}`;
  } else {
    statusSection = `${startMarker}
> ### ⚪ PROXY TÜNELİ BEKLENİYOR / ÇEVRİMDIŞI
> * 🌐 **Sabit GitHub Pages Sayfası:** [https://iouwdihyuwdaihgawdyugawduyawgygwdywydwa.github.io/github-proxy/](https://iouwdihyuwdaihgawdyugawduyawgygwdywydwa.github.io/github-proxy/)
> * ⚡ Yeni bir oturum başlatmak için GitHub Actions üzerinden **Automatic development preview** iş akışını tetikleyin.
${endMarker}`;
  }

  if (content.includes(startMarker) && content.includes(endMarker)) {
    const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
    content = content.replace(regex, statusSection);
  } else {
    content = `# github proxy\n\n${statusSection}\n\n` + content.replace(/^# github proxy\s*/, '');
  }

  await writeFile(readmePath, content, 'utf8');
  console.log('README.md updated with live preview status.');
} catch (err) {
  console.error('Failed to update README.md:', err.message);
  process.exit(1);
}
