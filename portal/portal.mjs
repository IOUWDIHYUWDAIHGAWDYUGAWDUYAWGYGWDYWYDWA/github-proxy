const byId = id => document.getElementById(id);
let session;
const workflowUrl = 'https://github.com/IOUWDIHYUWDAIHGAWDYUGAWDUYAWGYGWDYWYDWA/github-proxy/actions/workflows/preview.yml';

byId('workflow').href = workflowUrl;
byId('btn-recreate').href = workflowUrl;
byId('source').href = 'https://github.com/IOUWDIHYUWDAIHGAWDYUGAWDUYAWGYGWDYWYDWA/github-proxy';

const liveContainer = byId('live-container');
const offlineContainer = byId('offline-container');
const proxyFrame = byId('proxy-frame');

// Tam ekran geçişi
byId('btn-fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await liveContainer.requestFullscreen();
    }
  } catch (err) {
    console.error('Tam ekran hatası:', err);
  }
});

// İframe yenileme
byId('btn-reload').addEventListener('click', () => {
  if (session?.url) {
    proxyFrame.src = session.url;
  }
});

function render() {
  let validUrl = false;
  try {
    const url = new URL(session?.url);
    validUrl = url.protocol === 'https:' && url.hostname.endsWith('.trycloudflare.com') && !url.username && !url.password;
  } catch {}

  const remaining = Date.parse(session?.expiresAt) - Date.now();
  const active = session?.active === true && validUrl && Number.isFinite(remaining) && remaining > 0;

  byId('status').classList.toggle('ready', active);
  byId('status').textContent = active ? 'Önizleme aktif' : 'Önizleme kapalı';

  if (active) {
    // Canlı gömülü proxy penceresini GitHub Pages üzerinde aç
    liveContainer.hidden = false;
    offlineContainer.hidden = true;

    // Sadece URL değiştiğinde veya boş olduğunda ata (sürekli yenilenmeyi önle)
    if (proxyFrame.getAttribute('data-loaded-url') !== session.url) {
      proxyFrame.src = session.url;
      proxyFrame.setAttribute('data-loaded-url', session.url);
    }

    try {
      const urlObj = new URL(session.url);
      byId('live-domain-badge').textContent = urlObj.hostname;
    } catch {
      byId('live-domain-badge').textContent = session.url;
    }

    byId('btn-external').href = session.url;

    const remMinutes = Math.ceil(remaining / 60000);
    const hours = Math.floor(remMinutes / 60);
    const mins = remMinutes % 60;
    const timeStr = hours > 0 ? `${hours} saat ${mins} dakika kaldı` : `${mins} dakika kaldı`;
    byId('live-countdown').textContent = `· ⏰ ${timeStr}`;

  } else {
    // Oturum kapalıysa gömülü pencereyi gizle, bilgilendirme kartını göster
    liveContainer.hidden = true;
    offlineContainer.hidden = false;
    proxyFrame.removeAttribute('data-loaded-url');
    proxyFrame.src = 'about:blank';

    byId('session-title').textContent = 'Oturum kapalı veya bekleniyor.';
    byId('session-description').textContent = 'Proxy tüneli şu anda çevrimdışı. "Yeni oturum / domain oluştur" butonuna tıklayarak Actions üzerinden oturum başlatabilirsiniz.';
    byId('expiry').textContent = 'Yeni oturum otomatik zamanlayıcı veya manuel tetikleme bekliyor.';
  }
}

async function refresh() {
  try {
    const response = await fetch(`status.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error();
    session = await response.json();
    render();
  } catch {
    session = null;
    render();
    byId('session-description').textContent = 'Durum bilgisi alınamadı. Biraz sonra tekrar deneyin veya GitHub Actions sayfasını kontrol edin.';
  }
}

byId('refresh').addEventListener('click', refresh);
await refresh();
setInterval(render, 1000);
