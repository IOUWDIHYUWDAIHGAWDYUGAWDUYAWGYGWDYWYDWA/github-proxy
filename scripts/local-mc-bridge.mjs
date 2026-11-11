import express from 'express';
import { createServer } from 'node:http';
import { attachMinecraftProxy } from '../src/mc-proxy.mjs';

const port = Number(process.env.MC_BRIDGE_PORT || 2344);
const app = express();
const server = createServer(app);

const handleMinecraftUpgrade = attachMinecraftProxy(app);

// Kök adrese gidildiğinde otomatik olarak yerel Türkiye köprülü 1.21.11 Minecraft'a yönlendir
app.get('/', (req, res) => {
  res.redirect(302, `/mc-play/?proxy=${encodeURIComponent(`http://127.0.0.1:${port}`)}&version=1.21.11&username=thevynex`);
});

server.on('upgrade', (req, socket, head) => {
  if (handleMinecraftUpgrade(req, socket, head)) return;
  socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
});

server.listen(port, '127.0.0.1', () => {
  console.log('=====================================================');
  console.log('🇹🇷 MİNECRAFT 1.21.11 TÜRKİYE AĞI KÖPRÜSÜ HAZIR!');
  console.log(`Oyun Adresi: http://127.0.0.1:${port}/`);
  console.log('DiyojenNW (play.diyojennw.com.tr) ve tüm TR sunucularına');
  console.log('kendi Türkiye IP adresiniz ve CORS-free texturepack desteğiyle bağlanır.');
  console.log('Kapatmak için bu pencereyi kapatabilirsiniz.');
  console.log('=====================================================');
});
