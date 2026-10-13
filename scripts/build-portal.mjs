import { mkdir, cp, copyFile, readFile, writeFile } from 'node:fs/promises';
const directory = new URL('../portal-dist/', import.meta.url);
await mkdir(directory, { recursive: true });
await cp(new URL('../portal/', import.meta.url), directory, { recursive: true });
await copyFile(new URL('../public/style.css', import.meta.url), new URL('style.css', directory));
let status = { active: false };
if (process.env.PREVIEW_INFO) {
  const info = JSON.parse(await readFile(process.env.PREVIEW_INFO, 'utf8'));
  const url = new URL(info.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.trycloudflare.com')) throw new Error('Invalid preview URL');
  if (!Number.isFinite(Date.parse(info.expiresAt))) throw new Error('Invalid preview expiry');
  status = { active: true, url: url.origin, expiresAt: info.expiresAt, runUrl: info.runUrl };
}
await writeFile(new URL('status.json', directory), JSON.stringify(status) + '\n');
await writeFile(new URL('.nojekyll', directory), '');
console.log('GitHub Pages portal prepared.');
