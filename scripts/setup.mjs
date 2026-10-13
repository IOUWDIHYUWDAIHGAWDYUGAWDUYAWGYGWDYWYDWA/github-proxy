import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

try {
  await writeFile(new URL('../.env', import.meta.url), `HOST=127.0.0.1\nPORT=8787\nPROXY_USER=proxy\nPROXY_PASSWORD=${randomBytes(24).toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  console.log('.env oluşturuldu. Kullanıcı adı: proxy. Şifren .env dosyasında; public repoya eklenmez. Başlatmak için npm start.');
} catch (err) {
  if (err.code === 'EEXIST') console.log('.env zaten var; mevcut bilgiler korundu.');
  else throw err;
}
