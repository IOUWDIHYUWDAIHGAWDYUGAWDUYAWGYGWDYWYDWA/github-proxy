# github proxy

Adres veya arama yazarak hedef siteyi sayfa içinde açan, giriş korumalı bir **web proxy**. Uzak Chrome görüntüsü yerine HTML, CSS ve JavaScript yeniden yazımı kullanır.

**Durum:** yerel uygulama hazır. Genel erişime açık bir proxy sunucusu yayınlanmadı. Yerelde çalıştırıldığında hedef sitelere bu bilgisayarın ağından çıkar. GitHub Actions yalnız yazılımın otomatik testlerini çalıştırır.

## Yerelde başlatma

Node.js 22 veya üzeri gerekir (CI ve Docker: Node.js 24).

```powershell
npm ci --ignore-scripts
npm run setup
npm start
```

[http://localhost:8787](http://localhost:8787) adresini aç. Kullanıcı adı `proxy`; rastgele şifre `npm run setup` tarafından yerel `.env` dosyasına yazılır. Şifre ekranda veya loglarda yazdırılmaz. `.env` Git tarafından yok sayılır.

Giriş yaptıktan sonra adres alanına örneğin `https://example.com` yaz. Şemasız alan adları HTTPS olarak açılır; arama metni DuckDuckGo'ya yönlendirilir. Geri, ileri, yenileme ve tam ekran düğmeleri vardır.

## Doğrulanan davranışlar

Kontrollü bir test sitesi üzerinde sayfa içinde gezinme, JavaScript, bağlantılar, geri gitme, form üzerinden dosya yükleme ve iki farklı indirme yolu test edilir. İndirilen dosyanın adı ve içeriği doğrulanır. Hedef site cookie'lerinin emülasyonu ve proxy oturum cookie'sinin hedefe gönderilmemesi de kontrol edilir.

Backend testleri hatalı URL'leri, giriş/CSRF denetimini, oturum iptalini, yetkisiz WebSocket bağlantılarını, giriş denemesi sınırını ve özel IP adreslerini denetler. Masaüstü/mobil görünüm de tarayıcı testindedir. Bu kontroller bütün internet sitelerinin veya Roblox'un sorunsuz çalıştığı anlamına gelmez.

## Testler

```powershell
npm test
npx playwright install chromium
npm run test:e2e
```

Yüklü Chrome'u kullanmak için PowerShell'de testten önce `$env:PLAYWRIGHT_CHANNEL = 'chrome'` ayarla.

GitHub'daki **Actions → Proxy tests** iş akışı aynı güvenlik ve tarayıcı testlerini çalıştırır. Manuel `Run workflow` da desteklenir. Test job'u dışarıya sunucu/tünel açmaz ve iş bitince kapanır. Test fixture'ı 127.0.0.1:80 portunu kullanır; bu port boş ve kullanılabilir olmalıdır.

**Actions → Website connectivity test → Run workflow** ile Discord, Roblox veya Wikipedia için kısa bir gerçek HTTPS/proxy testi yapılabilir. Bu iş akışı siteyi GitHub makinesinde uygulamanın içinde açar; DNS/HTTPS raporu ve ekran görüntüsünü `site-connectivity-results` artifact'ına kaydeder. Siteye canlı bağlanılabilen bir adres oluşturmaz. Sertifika doğrulaması kapatılmaz. Rapor, sitenin bütün işlevlerinin çalıştığını garanti etmez.

## Canlı kullanım

Proxy arka ucunu Node.js ve WebSocket destekleyen, kullanım koşulları bu hizmete izin veren bir sunucuda çalıştırmak gerekir. İstekler o sunucunun ağından çıkar. HTTPS gereklidir; `localhost` geliştirme istisnasıdır. GitHub Pages tek başına arka ucu çalıştırmaz.

Kurulum paketi: [Dockerfile](Dockerfile), [compose.yaml](compose.yaml) ve [Caddy örneği](deploy/Caddyfile). Docker/Caddy dağıtımı bu bilgisayarda çalıştırılarak doğrulanmadı; bir canlı barındırma hesabı henüz sağlanmadı.

Docker kurulmuş sunucuda `.env` oluşturup:

```sh
docker compose up -d --build
```

Compose uygulamayı yalnız sunucunun `127.0.0.1:8787` adresinde açar. Ayrı olarak kurulu Caddy'yi `deploy/Caddyfile` ile bu adrese yönlendir; Caddy servisinin ortamında `PROXY_DOMAIN=proxy.example.com` ayarla ve uygulama `.env` dosyasına `PUBLIC_ORIGIN=https://proxy.example.com` ekle. Hostname'in DNS'i sunucuya yönelmeli ve 80/443 portları Caddy'ye ulaşmalıdır. Örnek alan adını gerçek adresinle değiştir.

`PUBLIC_ORIGIN` HTTPS cookie'sini ve API/WebSocket kaynak kontrolünü etkinleştirir. Şifreyi boş bırakmak veya 16 karakterden kısa kullanmak sunucunun başlamasını engeller.

## Sınırlar

- Roblox web sitesini açmak, Roblox oyun istemcisinin trafiğini taşımak değildir. Bu uygulama bilgisayar genelinde VPN sağlamaz.
- CAPTCHA, bazı giriş sağlayıcıları, DRM, WebRTC, servis çalışanları ve karmaşık uygulamalar uyumsuz olabilir.
- İndirmeler bu sürümde bellekte toplanır ve **50 MB** ile sınırlıdır. Yükleme sınırları hedef site ve barındırma sağlayıcısına bağlıdır.
- TCP hedef portları 80 ve 443 ile sınırlıdır; doğrudan IP hedefleri, UDP, özel ağ ve loopback bağlantıları engellenir.
- Tek proxy hesabı içindir; çok kullanıcılı bir hizmet veya tarayıcı düzeyinde güvenlik izolasyonu değildir. Proxy motoru deneysel; önemli hesaplarda normal tarayıcıyla aynı güvenlik garantileri verilmez.
- Hedef sitelerin oturum verileri tarayıcıda proxy motorunun depolamasında tutulur. Proxyden çıkış bağlantıyı kapatır; hedef sitenin saklanmış oturumunu temizlemek için bu origin'in site verilerini tarayıcıdan temizle.
- GitHub-hosted Actions makineleri genel gezinme/VPN hizmeti olarak işletilmez. Actions bu repodaki yazılımın testi içindir.

## Motor ve lisanslar

- [Scramjet](https://github.com/MercuryWorkshop/scramjet): paket manifest'i MIT dese de paket içindeki LICENSE, AGPL-3.0 metnidir; bu projede AGPL koşulları esas alınır. npm'in kararlı `1.1.0` sürümü kullanılır. V2 npm'de alpha olarak yayınlanıyor.
- [BareMux](https://github.com/MercuryWorkshop/bare-mux): paket içindeki LICENSE MIT'tir; V1 ile uyumlu aktarım arayüzü, upstream tarafından deprecated olarak işaretlenmiş.
- [Epoxy Transport](https://github.com/MercuryWorkshop/epoxy-transport): AGPL-3.0; BareMux ile uyumlu `2.1.28` sürümü.
- [Wisp JS](https://github.com/MercuryWorkshop/wisp-js): LGPL-3.0-or-later; Node.js aktarım sunucusu. Eski ve güvenlik sorunları nedeniyle kaldırılmış `wisp-server-node` kullanılmaz.

Paketlerle gelen lisans dosyaları `node_modules` içinde korunur. Epoxy Transport manifest'i AGPL-3.0-only bildirir; bu npm paketinde ayrı LICENSE dosyası bulunmaz. Projenin kendi kodu [AGPL-3.0](LICENSE) altında yayınlanır; uygulama kaynakları bu public repoda bulunur. Fork ederek dağıtıyorsan arayüzdeki kaynak bağlantısını kendi kaynağına güncelle.

Ayrıntılar: [PROJE.md](PROJE.md). Katkı talimatları: [AGENTS.md](AGENTS.md).
