import { addressToUrl } from './address.mjs';
import { downloadName, saveDownload } from './download.mjs';
const el = id => document.getElementById(id);
let frame, controller, initialized;
let authRevision = 0;
const setError = (id, error) => el(id).textContent = error?.message || String(error || '');

async function api(path, body) {
  const response = await fetch(`/api/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Bağlantı kurulamadı.');
  return result;
}
function setAuthenticated(authenticated) {
  el('login-card').hidden = authenticated;
  el('browser').hidden = !authenticated;
  el('logout').hidden = !authenticated;
  el('status').textContent = authenticated ? 'Oturum açık' : 'Giriş bekleniyor';
  el('status').classList.toggle('ready', authenticated);
  if (!authenticated) { frame?.frame.remove(); frame = undefined; document.body.classList.remove('browsing'); el('empty-state').hidden = false; }
  else { initialized ||= initialize().catch(error => { initialized = undefined; setError('browser-error', error); }); }
}

async function initialize() {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('SharedWorker' in window)) throw new Error('HTTPS veya localhost üzerinden güncel masaüstü Chrome/Edge/Firefox kullan.');
  const { ScramjetController } = window.$scramjetLoadController();
  controller = new ScramjetController({ prefix: '/proxy/', flags: { interceptDownloads: true }, files: { wasm: '/scramjet/scramjet.wasm.wasm', all: '/scramjet/scramjet.all.js', sync: '/scramjet/scramjet.sync.js' } });
  controller.addEventListener('download', event => {
    saveDownload(event.download.body, event.download.filename || new URL(event.download.url).pathname.split('/').pop(), event.download.type).catch(error => setError('browser-error', error));
  });
  await controller.init();
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Proxy başlatılamadı. Sayfayı yenileyip tekrar dene.')), 10_000);
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  const transport = new window.BareMux.BareMuxConnection('/baremux/worker.js');
  const endpoint = new URL('/wisp/', location.href); endpoint.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  await transport.setTransport('/epoxy/index.mjs', [{ wisp: endpoint.href }]);
}

async function navigate(input) {
  setError('browser-error', '');
  try {
    const url = addressToUrl(input);
    if (!(await api('session')).authenticated) { setAuthenticated(false); throw new Error('Oturumun kapandı. Tekrar giriş yap.'); }
    el('page-status').textContent = 'Proxy hazırlanıyor…';
    initialized ||= initialize().catch(error => { initialized = undefined; throw error; });
    await initialized;
    if (!frame) {
      frame = controller.createFrame();
      frame.frame.title = 'Proxy üzerinden açılan web sitesi';
      frame.frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals');
      frame.frame.setAttribute('allow', 'fullscreen');
      frame.frame.addEventListener('load', () => {
        el('page-status').textContent = 'Sayfa yüklendi';
        try { el('address').value = frame.url.href; } catch { /* Some engine error pages have no client URL. */ }
        // Chromium can bypass service workers for links with the download attribute.
        // Fetch inside the proxied realm, then save the resulting bytes in the parent.
        frame.frame.contentDocument?.addEventListener('click', async event => {
          const anchor = event.target.closest?.('a[download]');
          if (!anchor) return;
          event.preventDefault(); event.stopImmediatePropagation();
          try {
            let url = anchor.href;
            if (url.startsWith(location.origin + '/proxy/')) url = controller.decodeUrl(url);
            const response = await frame.frame.contentWindow.fetch(url);
            if (!response.ok) throw new Error(`Dosya indirilemedi (${response.status}).`);
            const filename = downloadName(response.headers.get('content-disposition'), anchor.getAttribute('download') || new URL(url).pathname.split('/').pop());
            await saveDownload(response.body, filename, response.headers.get('content-type'));
          } catch (error) { setError('browser-error', error); }
        }, { capture: true });
      });
      el('viewport').append(frame.frame);
    }
    el('empty-state').hidden = true;
    el('address').value = url;
    document.body.classList.add('browsing');
    el('page-status').textContent = 'Site açılıyor…';
    frame.go(url);
  } catch (error) { setError('browser-error', error); el('page-status').textContent = 'Adres açılamadı'; }
}

el('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  authRevision++;
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true; setError('login-error', '');
  try {
    const data = new FormData(form);
    await api('login', { username: data.get('username'), password: data.get('password') });
    form.elements.password.value = '';
    setAuthenticated(true); el('address').focus();
  } catch (error) { setError('login-error', error); }
  finally { button.disabled = false; }
});
el('logout').addEventListener('click', async () => {
  authRevision++;
  try { await api('logout', {}); setAuthenticated(false); }
  catch (error) { setError('browser-error', error); }
});
el('address-form').addEventListener('submit', event => { event.preventDefault(); navigate(el('address').value); });
document.querySelectorAll('[data-url]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.url)));
for (const action of ['back', 'forward', 'reload']) el(action).addEventListener('click', () => { try { frame?.[action](); } catch (error) { setError('browser-error', error); } });
el('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await el('browser').requestFullscreen(); }
  catch { setError('browser-error', 'Bu tarayıcı tam ekranı desteklemiyor.'); }
});
const initialRevision = authRevision;
try {
  const state = await api('session');
  if (initialRevision === authRevision) setAuthenticated(state.authenticated);
} catch (error) { if (initialRevision === authRevision) setError('login-error', error); }
