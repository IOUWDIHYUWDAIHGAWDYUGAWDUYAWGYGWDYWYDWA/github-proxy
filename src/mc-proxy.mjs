import net from 'node:net';
import { resolveSrv } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createSafeResolver, isPublicAddress } from './network.mjs';

/**
 * Attaches mwc-proxy compatible WebSocket-to-TCP bridge (/api/vm/net/*)
 * so Minecraft Web Client (1.8 - 1.21.11+) can connect to real Minecraft servers
 * through the GitHub Actions server's network and IP address.
 */
export function attachMinecraftProxy(app, safeResolve = createSafeResolver()) {
  const mcSockets = new Map();
  const mcWss = new WebSocketServer({ noServer: true });

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
