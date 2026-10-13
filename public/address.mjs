export function addressToUrl(value) {
  const input = value.trim();
  if (!input) throw new Error('Bir site adresi veya arama yaz.');
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
  const candidate = hasScheme ? input : /\s/.test(input) || !input.includes('.') ? `https://duckduckgo.com/?q=${encodeURIComponent(input)}` : `https://${input}`;
  let url;
  try { url = new URL(candidate); } catch { throw new Error('Geçerli bir site adresi yaz.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Yalnız http ve https adresleri açılabilir.');
  if (url.username || url.password) throw new Error('Adres içinde kullanıcı adı veya şifre kullanma.');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Bu proxy yalnız 80 ve 443 portlarını destekliyor.');
  return url.href;
}
