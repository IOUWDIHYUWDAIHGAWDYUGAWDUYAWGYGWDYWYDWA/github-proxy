// Only imported by the browser test runner. Never imported by server.mjs.
import { createServer } from 'node:http';
import { createProxyServer } from '../server.mjs';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
const fixture = createServer(async (req, res) => {
  if (req.url === '/download') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="proxy-test.txt"' });
    return res.end('download via proxy');
  }
  if (req.url === '/upload') {
    let body = ''; for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'text/plain'); return res.end(body);
  }
  if (req.url === '/second') {
    res.setHeader('Content-Type', 'text/html'); return res.end('<h1>Second page</h1><a href="/">First page</a>');
  }
  if (req.url === '/cookie') {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Set-Cookie', 'target_cookie=fixture-value; Path=/; HttpOnly');
    return res.end('<h1>Cookie set</h1><a href="/cookie-report">Inspect cookie</a>');
  }
  if (req.url === '/cookie-report') {
    res.setHeader('Content-Type', 'text/html');
    return res.end(`<h1>Cookie report</h1><pre id="cookie-report">${req.headers.cookie || 'none'}</pre>`);
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html><head><title>Proxy fixture</title></head><body>
    <h1>Proxy fixture</h1><p id="script"></p><a href="/second">Second page</a><br>
    <a href="/download" download>Download file</a> <a href="/download">Download attachment</a><a href="/cookie">Cookie test</a>
    <form id="upload"><input type="file" name="file" aria-label="Test file"><button>Upload file</button></form><pre id="result"></pre>
    <script>document.querySelector('#script').textContent='JavaScript works: '+location.hostname;
    document.querySelector('#upload').addEventListener('submit', async e=>{e.preventDefault(); const data=new FormData(e.currentTarget); const response=await fetch('/upload',{method:'POST',body:data}); document.querySelector('#result').textContent=await response.text();});</script>
    </body></html>`);
});
// Port 80 is used so the UI's production port restriction is exercised too.
await new Promise(resolve => fixture.listen(80, '127.0.0.1', resolve));
const proxy = createProxyServer({ password: 'test-password-for-ci-only', network: {
  ports: [80], resolver: async hostname => { if (hostname !== 'proxy-fixture.test') throw new Error('Only the controlled fixture is allowed'); return '127.0.0.1'; }
} });
// Explicit exception for this isolated fixture; not configurable by production env.
wisp.options.allow_loopback_ips = true;
proxy.listen(8081, '127.0.0.1');
async function stop() { await proxy.shutdown(); fixture.closeAllConnections(); fixture.close(() => process.exit(0)); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
