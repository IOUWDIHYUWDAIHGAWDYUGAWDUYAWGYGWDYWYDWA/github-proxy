const byId = id => document.getElementById(id);
let session;
const workflow = 'https://github.com/IOUWDIHYUWDAIHGAWDYUGAWDUYAWGYGWDYWYDWA/github-proxy/actions/workflows/preview.yml';
byId('workflow').href = workflow;
byId('source').href = 'https://github.com/IOUWDIHYUWDAIHGAWDYUGAWDUYAWGYGWDYWYDWA/github-proxy';

function render() {
  let validUrl = false;
  try { const url = new URL(session?.url); validUrl = url.protocol === 'https:' && url.hostname.endsWith('.trycloudflare.com') && !url.username && !url.password; } catch {}
  const remaining = Date.parse(session?.expiresAt) - Date.now();
  const active = session?.active === true && validUrl && Number.isFinite(remaining) && remaining > 0;
  byId('status').classList.toggle('ready', active);
  byId('status').textContent = active ? 'Önizleme açık' : 'Önizleme kapalı';
  byId('session-title').textContent = active ? 'Penceren hazır.' : 'Yeni bir oturum aç.';
  byId('session-description').textContent = active ? 'Uygulama GitHub Actions makinesinde çalışıyor. Hedef sitelere bağlantı o makinenin ağından çıkıyor.' : 'Actions sayfasından Run workflow ile kısa bir test oturumu başlat. Hazırlık tamamlanınca bu sayfayı yenile.';
  byId('open-preview').setAttribute('aria-disabled', String(!active));
  if (active) {
    byId('open-preview').href = session.url;
    const end = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(session.expiresAt));
    const remMinutes = Math.ceil(remaining / 60000);
    const hours = Math.floor(remMinutes / 60);
    const mins = remMinutes % 60;
    const timeStr = hours > 0 ? `${hours} saat ${mins} dakika kaldı` : `${mins} dakika kaldı`;
    byId('expiry').textContent = `Yaklaşık ${timeStr} · Bitiş ${end} (Türkiye saati)`;
  } else { byId('open-preview').removeAttribute('href'); byId('expiry').textContent = 'Yeni oturum otomatik başlatılıyor veya bekleniyor...'; }
}
async function refresh() {
  try {
    const response = await fetch(`status.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error();
    session = await response.json(); render();
  } catch {
    session = null; render(); byId('session-description').textContent = 'Durum bilgisi alınamadı. Biraz sonra yeniden dene veya Actions sayfasını kontrol et.';
  }
}
byId('refresh').addEventListener('click', refresh);
await refresh();
setInterval(render, 1000);
