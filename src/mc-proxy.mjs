import net from 'node:net';
import { resolveSrv } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createSafeResolver, isPublicAddress } from './network.mjs';

const MC_UPSTREAM = 'https://s.mcraft.fun';

const MC_FETCH_INTERCEPTOR = `<script>
(function () {
  var origFetch = window.fetch;
  var proxyPattern = /(\\.zip(\\?|$)|mc-packs\\.net|resourcepack|pack\\.zip|[?&]dl=1)/i;

  window.fetch = async function (input, init) {
    var urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
    try {
      var u = new URL(urlStr, location.href);
      if (u.origin !== location.origin && (u.protocol === 'http:' || u.protocol === 'https:')) {
        var needsDirectProxy = u.protocol === 'http:' || proxyPattern.test(u.href);
        if (needsDirectProxy) {
          return await fetchViaBridge(u.href, input, init);
        }
        try {
          var res = await origFetch.apply(this, arguments);
          if (!res.ok && res.status === 0) throw new Error('Opaque response');
          return res;
        } catch (err) {
          return await fetchViaBridge(u.href, input, init);
        }
      }
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };

  async function fetchViaBridge(targetHref, input, init) {
    var bridgeUrl = '/api/mc-fetch?url=' + encodeURIComponent(targetHref);
    var opts = Object.assign({}, init || {});
    if (input instanceof Request) {
      if (!opts.method) opts.method = input.method;
      if (!opts.headers) opts.headers = input.headers;
      if (!opts.body && input.method !== 'GET' && input.method !== 'HEAD') {
        try { opts.body = await input.clone().arrayBuffer(); } catch (e) {}
      }
    }
    return origFetch.call(window, bridgeUrl, opts);
  }
})();
</script>`;

/**
 * Attaches mwc-proxy compatible WebSocket-to-TCP bridge (/api/vm/net/*),
 * CORS-free Resource Pack bridge (/api/mc-fetch),
 * and same-origin reverse proxy for Minecraft Web Client (/mc-play/*).
 */
export function attachMinecraftProxy(app, safeResolve = createSafeResolver()) {
  const mcSockets = new Map();
  const mcWss = new WebSocketServer({ noServer: true });

  // 1. CORS-Free & Redirect-Safe Resource Pack / Asset Fetch Köprüsü (/api/mc-fetch)
  app.all('/api/mc-fetch', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);

    const targetUrl = String(req.query.url || req.headers['x-target-url'] || '').trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).send('Yalnızca HTTP/HTTPS URL desteklenir.');
      }
    } catch {
      return res.status(400).send('Geçersiz hedef URL.');
    }

    try {
      // SSRF koruması: Hedef alan adının/IP'nin genel internette olduğunu doğrula
      const host = parsedUrl.hostname;
      if (net.isIP(host) !== 0) {
        if (!isPublicAddress(host)) return res.status(403).send('Özel ağ adresine izin verilmiyor.');
      } else {
        await safeResolve(host);
      }

      const upstreamRes = await fetch(parsedUrl.href, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: {
          'User-Agent': 'Minecraft Java/1.21.11',
          'Accept': '*/*'
        },
        redirect: 'follow'
      });

      res.status(upstreamRes.status);
      const passHeaders = ['content-type', 'content-length', 'content-disposition', 'etag', 'last-modified', 'cache-control'];
      for (const h of passHeaders) {
        const v = upstreamRes.headers.get(h);
        if (v) res.setHeader(h, v);
      }

      if (req.method === 'HEAD' || !upstreamRes.body) {
        return res.end();
      }

      Readable.fromWeb(upstreamRes.body).pipe(res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).send(`Resource pack indirilemedi: ${err.message}`);
      }
    }
  });

  // 2. Same-Origin Minecraft Web Client Reverse Proxy (/mc-play/*)
  app.get('/mc-play', (req, res) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(302, `/mc-play/${qs}`);
  });

  app.get('/mc-play/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));');
  });

  app.use('/mc-play', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).send('Method Not Allowed');
    }

    try {
      const subPath = req.url === '/' ? '/' : req.url;
      const target = `${MC_UPSTREAM}${subPath}`;
      const upstreamRes = await fetch(target, {
        method: req.method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': req.headers.accept || '*/*'
        },
        redirect: 'follow'
      });

      res.status(upstreamRes.status);
      const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.github.io https://*.trycloudflare.com");

      if (contentType.includes('text/html')) {
        res.setHeader('Cache-Control', 'no-store');
        let html = await upstreamRes.text();
        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head>\n${MC_FETCH_INTERCEPTOR}`);
        } else {
          html = `${MC_FETCH_INTERCEPTOR}\n${html}`;
        }
        return res.send(html);
      }

      const cc = upstreamRes.headers.get('cache-control');
      res.setHeader('Cache-Control', cc || 'public, max-age=3600');
      const cl = upstreamRes.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);

      if (req.method === 'HEAD' || !upstreamRes.body) {
        return res.end();
      }
      Readable.fromWeb(upstreamRes.body).pipe(res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).send(`Minecraft istemcisi yüklenemedi: ${err.message}`);
      }
    }
  });

  // 3. WebSocket-to-TCP Köprüsü (/api/vm/net/*)
  const router = express.Router();

  // CORS desteği (mcraft.fun, github.io ve proxy originlerinden erişim için)
  router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  router.use(express.json({ limit: '16kb' }));

  router.get('/connect', (req, res) => {
    res.json({
      version: '0.0.4',
      capabilities: {
        ping: true
      }
    });
  });

  router.post('/connect', async (req, res) => {
    const rawHost = String(req.body?.host || '').trim();
    const rawPort = Number(req.body?.port || 25565);

    if (!rawHost || !Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) {
      return res.status(400).json({ code: 400, error: 'Geçersiz sunucu adresi veya port.' });
    }

    let targetHost = rawHost;
    let targetPort = rawPort;

    try {
      // Eğer varsayılan port (25565) ise Minecraft SRV kaydını kontrol et (Aternos vb. için)
      if (targetPort === 25565 && net.isIP(targetHost) === 0) {
        try {
          const srvRecords = await resolveSrv(`_minecraft._tcp.${targetHost}`);
          if (srvRecords && srvRecords.length > 0 && srvRecords[0].name) {
            targetHost = srvRecords[0].name.replace(/\.$/, '');
            if (srvRecords[0].port) targetPort = Number(srvRecords[0].port);
          }
        } catch {
          // SRV kaydı yoksa normal host ile devam et
        }
      }

      // SSRF koruması: Yalnızca genel internetteki sunuculara izin ver
      let resolvedIp;
      if (net.isIP(targetHost) !== 0) {
        if (!isPublicAddress(targetHost)) {
          return res.status(403).json({ code: 403, error: 'Yerel veya özel ağ adreslerine izin verilmiyor.' });
        }
        resolvedIp = targetHost;
      } else {
        resolvedIp = await safeResolve(targetHost);
      }

      const socket = net.connect({
        host: resolvedIp,
        port: targetPort,
        timeout: 8000
      });
      socket.setNoDelay(true);

      let responded = false;

      socket.on('timeout', () => {
        if (!responded) {
          responded = true;
          res.status(504).json({
            code: 504,
            error: `Sunucu zaman aşımına uğradı (${rawHost}:${rawPort}).`
          });
        }
        socket.destroy();
      });

      socket.on('error', err => {
        if (!responded) {
          responded = true;
          res.status(502).json({
            code: 502,
            error: `Minecraft sunucusuna bağlanılamadı: ${err.message}`
          });
        }
        socket.destroy();
      });

      socket.on('connect', () => {
        if (responded || res.headersSent) {
          socket.destroy();
          return;
        }
        responded = true;

        if (mcSockets.size >= 100) {
          socket.destroy();
          return res.status(429).json({ code: 429, error: 'Çok fazla aktif Minecraft bağlantısı.' });
        }

        const token = randomBytes(24).toString('hex');
        const connectTimer = setTimeout(() => {
          const pending = mcSockets.get(token);
          if (pending) {
            mcSockets.delete(token);
            pending.socket.destroy();
          }
        }, 30_000);
        connectTimer.unref();

        mcSockets.set(token, { socket, connectTimer });

        res.json({
          token,
          remote: socket.address()
        });
      });
    } catch (err) {
      if (!res.headersSent) {
        res.status(403).json({ code: 403, error: err.message || 'Bağlantı reddedildi.' });
      }
    }
  });

  app.use('/api/vm/net', router);

  return function handleMinecraftUpgrade(req, socket, head) {
    let pathname, searchParams;
    try {
      const parsed = new URL(req.url, 'http://localhost');
      pathname = parsed.pathname;
      searchParams = parsed.searchParams;
    } catch {
      return false;
    }

    if (pathname === '/api/vm/net/ping') {
      mcWss.handleUpgrade(req, socket, head, ws => {
        ws.on('message', data => {
          const text = data.toString();
          if (text.startsWith('ping:')) {
            const id = text.slice(5);
            ws.send(`pong:${id}:1`);
          }
        });
      });
      return true;
    }

    if (pathname === '/api/vm/net/socket') {
      const token = searchParams.get('token');
      const entry = token ? mcSockets.get(token) : null;
      if (!entry) {
        socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        return true;
      }

      clearTimeout(entry.connectTimer);
      mcSockets.delete(token);
      const tcpSocket = entry.socket;

      mcWss.handleUpgrade(req, socket, head, ws => {
        tcpSocket.setTimeout(0);

        ws.on('message', data => {
          if (typeof data === 'string' && data.startsWith('ping:')) {
            ws.send(`pong:${data.slice(5)}`);
            return;
          }
          if (!tcpSocket.destroyed) {
            tcpSocket.write(Buffer.isBuffer(data) ? data : Buffer.from(data));
          }
        });

        tcpSocket.on('data', chunk => {
          if (ws.readyState === 1) {
            ws.send(chunk, { binary: true }, () => {});
          }
        });

        const cleanup = () => {
          if (!tcpSocket.destroyed) tcpSocket.destroy();
          if (ws.readyState === 0 || ws.readyState === 1) ws.close();
        };

        ws.on('close', cleanup);
        ws.on('error', cleanup);
        tcpSocket.on('close', cleanup);
        tcpSocket.on('error', cleanup);
      });
      return true;
    }

    return false;
  };
}
