import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { epoxyPath } from '@mercuryworkshop/epoxy-transport';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import { configureNetwork } from './src/network.mjs';
import { attachMinecraftProxy } from './src/mc-proxy.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const digest = value => createHash('sha256').update(String(value || '')).digest();
const equal = (a, b) => timingSafeEqual(digest(a), digest(b));
const cookieName = 'gp_session';

export function createProxyServer({ password = process.env.PROXY_PASSWORD || '@hmet355', username = process.env.PROXY_USER || 'proxy', publicOrigin = process.env.PUBLIC_ORIGIN, sessionMs = 8 * 60 * 60 * 1000, network = {} } = {}) {
  if (!password || password.length < 6) throw new Error('PROXY_PASSWORD en az 6 karakter olmalı.');
  if (publicOrigin && !/^https:\/\//.test(publicOrigin)) throw new Error('PUBLIC_ORIGIN https:// ile başlamalı.');
  configureNetwork(network);
  logging.set_level(logging.NONE);
  const sessions = new Map();
  const attempts = new Map();
  const sockets = new Set();
  const app = express();
  app.disable('x-powered-by');
  const server = createServer(app);
  const originFor = req => publicOrigin ? new URL(publicOrigin).origin : `http://${req.headers.host}`;
  const tokenFor = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const sessionFor = req => {
    const token = tokenFor(req);
    const session = sessions.get(token);
    if (session && session.expires > Date.now()) return session;
    if (session) { for (const socket of session.sockets) socket.destroy(); sessions.delete(token); }
    return null;
  };

  // GitHub Pages ve cross-origin iframe embedding desteği için cookie yapılandırması
  const cookie = (value, maxAge) => `${cookieName}=${value}; Path=/; HttpOnly; ${publicOrigin ? 'SameSite=None; Secure; Partitioned;' : 'SameSite=Strict;'} Max-Age=${maxAge}`;

  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // GitHub Pages üzerinden doğrudan gömülü erişime izin ver
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.github.io https://*.trycloudflare.com");
    if (!req.path.startsWith('/scramjet') && !req.path.startsWith('/baremux') && !req.path.startsWith('/epoxy') && !req.path.match(/\.(?:js|mjs|wasm|css|svg|png|ico|woff2?)$/)) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  // Doğrudan API tünelleme köprüsü (/api/fetch)
  app.use('/api/fetch', express.raw({ type: '*/*', limit: '50mb' }));
  app.all('/api/fetch', async (req, res) => {
    const targetUrl = req.headers['x-target-url'];
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).send('Hedef URL (x-target-url header) gecersiz veya eksik.');
    }

    try {
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (!k.startsWith('x-target') && k !== 'host' && k !== 'content-length' && k !== 'connection') {
          headers[k] = v;
        }
      }

      // Orijinal Chrome kimliği sağla
      const defaultChromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
      if (!headers['user-agent'] || /node|undici/i.test(headers['user-agent'])) {
        headers['user-agent'] = defaultChromeUA;
      }
      headers['sec-ch-ua'] ||= '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
      headers['sec-ch-ua-mobile'] ||= '?0';
      headers['sec-ch-ua-platform'] ||= '"Windows"';
      headers['accept-language'] ||= 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7';
      headers['accept'] ||= 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';

      const fetchOptions = {
        method: req.method,
        headers,
        redirect: 'manual'
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && req.body.length > 0) {
        fetchOptions.body = req.body;
      }

      const upstreamRes = await fetch(targetUrl, fetchOptions);
      res.status(upstreamRes.status);
      
      upstreamRes.headers.forEach((val, key) => {
        const lowerKey = key.toLowerCase();
        // Sıkıştırma ve çerçeve kısıtlayıcı başlıkları temizle (X-Frame-Options engellerini kaldır)
        if (lowerKey !== 'content-encoding' && lowerKey !== 'transfer-encoding' && lowerKey !== 'x-frame-options') {
          if (lowerKey === 'content-security-policy') {
            const cleaned = val.replace(/frame-ancestors[^;]+;?/gi, '');
            if (cleaned.trim()) res.setHeader(key, cleaned);
          } else {
            res.setHeader(key, val);
          }
        }
      });

      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      res.status(502).send(`Upstream Fetch Hatasi: ${err.message}`);
    }
  });

  // Minecraft WebSocket-to-TCP Ağ Köprüsü (/api/vm/net) - GitHub Actions IP üzerinden sunucu erişimi
  const handleMinecraftUpgrade = attachMinecraftProxy(app);

  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.headers.origin !== originFor(req)) return res.status(403).json({ error: 'İstek kaynağı kabul edilmedi.' });
    next();
  });
  app.use('/api', express.json({ limit: '4kb' }));
  app.get('/api/session', (req, res) => res.json({ authenticated: Boolean(sessionFor(req)), expires: sessionFor(req)?.expires || null }));
  app.post('/api/login', (req, res) => {
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    const entry = attempts.get(ip) || { count: 0, until: now + 60_000 };
    if (entry.count >= 10 || attempts.size >= 10_000) return res.status(429).json({ error: 'Çok fazla deneme. Bir dakika sonra tekrar dene.' });
    entry.count++;
    attempts.set(ip, entry);
    if (!equal(req.body?.username, username) || !equal(req.body?.password, password)) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    const oldToken = tokenFor(req);
    const old = sessions.get(oldToken);
    if (old) { for (const socket of old.sockets) socket.destroy(); sessions.delete(oldToken); }
    for (const [key, session] of sessions) if (session.expires <= now) { for (const socket of session.sockets) socket.destroy(); sessions.delete(key); }
    if (sessions.size >= 100) return res.status(429).json({ error: 'Oturum sınırına ulaşıldı.' });
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { expires: now + sessionMs, sockets: new Set() });
    res.setHeader('Set-Cookie', cookie(token, Math.floor(sessionMs / 1000)));
    res.json({ authenticated: true });
  });
  app.post('/api/logout', (req, res) => {
    const session = sessionFor(req);
    if (session) for (const socket of session.sockets) socket.destroy();
    sessions.delete(tokenFor(req));
    res.setHeader('Set-Cookie', cookie('', 0));
    res.json({ authenticated: false });
  });
  const staticCache = {
    dotfiles: 'deny',
    index: false,
    maxAge: '1d',
    setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
  };
  app.use('/scramjet', express.static(scramjetPath, staticCache));
  app.use('/baremux', express.static(baremuxPath, staticCache));
  app.use('/epoxy', express.static(epoxyPath, staticCache));
  app.use(express.static(join(root, 'public'), {
    dotfiles: 'deny',
    maxAge: '1h',
    setHeaders: (res, path) => {
      if (path.endsWith('.html') || /[\\/](?:sw\.js|proxy-storage\.js|app\.mjs)$/.test(path)) res.setHeader('Cache-Control', 'no-cache');
      else res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }
  }));
  app.use((req, res) => res.status(404).send('Sayfa bulunamadı.'));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: 'İstek işlenemedi.' }));
  server.on('connection', socket => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 15_000);
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (req, socket, head) => {
    if (handleMinecraftUpgrade(req, socket, head)) return;
    const reject = code => socket.end(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`);
    if (req.url !== '/wisp/') return reject('404 Not Found');
    if (req.headers.origin !== originFor(req)) return reject('403 Forbidden');
    const session = sessionFor(req);
    if (!session) return reject('401 Unauthorized');
    if (session.sockets.size >= 16) return reject('429 Too Many Requests');
    session.sockets.add(socket);
    const timer = setTimeout(() => socket.destroy(), session.expires - Date.now());
    timer.unref();
    socket.on('close', () => { clearTimeout(timer); session.sockets.delete(socket); });
    wisp.routeRequest(req, socket, head);
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 60_000;
  server.shutdown = () => { for (const socket of sockets) socket.destroy(); return new Promise(resolve => server.close(resolve)); };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = Number(process.env.PORT || 8787);
    const host = process.env.HOST || '127.0.0.1';
    const server = createProxyServer();
    server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? `Port ${port} kullanımda. .env içindeki PORT değerini değiştir.` : 'Sunucu başlatılamadı.'); process.exitCode = 1; });
    server.listen(port, host, () => console.log(`github proxy hazır: ${process.env.PUBLIC_ORIGIN || `http://${host}:${port}`}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.shutdown(); process.exit(0); });
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
