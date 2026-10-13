# Proje ayrıntıları

## Amaç ve güncel kapsam

Projenin adı **github proxy**. Kullanıcı bir adres yazıp hedef siteyi aynı sayfa içinde kullanmak, bağlantılara tıklamak ve dosya yükleyip indirmek istiyor. Kullanıcı, ilk GitHub-only araştırmasının ardından web proxy sürümünü seçti. Sunucu/barındırma hesabı bulunmadığını belirtti ve GitHub üzerinde yazılım testi yapılmasını istedi.

Güncel teslim: yerel Node.js uygulaması, Türkçe arayüz, gerçek tarayıcı testleri ve GitHub Actions CI. Canlı uzak ağ çıkışı henüz kurulmadı. Yerelde çalıştırıldığında trafik bu bilgisayarın bağlantısını kullanır; aynı bilgisayarda bir site engelliyse yerel proxy o engeli tek başına kaldırmaz.

## Veri yolu

```text
Tarayıcıdaki arayüz
  → Scramjet service worker: adres/içerik yeniden yazımı
  → BareMux + Epoxy: HTTP/TLS aktarımı
  → Oturum kontrollü /wisp/ WebSocket endpoint'i
  → Node.js sunucusunun internet bağlantısı
  → Hedef web sitesi
```

Arayüz ve aktarım endpoint'i aynı HTTPS origin üzerinde sunulur. iframe, hedef site adresi yerine yerel `/proxy/` yolunu açar. Hedef isteklerini Node.js sunucusu taşır. Bu, bir uzak Chrome/masaüstü görüntü akışı değildir.

## Dosyalar

| Dosya | Görev |
| --- | --- |
| `server.mjs` | HTTP sunucusu, giriş, oturum, CSRF ve WebSocket yetkilendirmesi. |
| `src/network.mjs` | Güvenli DNS çözümlemesi, IP ve port sınırlamaları. |
| `public/index.html`, `style.css` | Türkçe, responsive arayüz. |
| `public/app.mjs` | Proxy başlangıcı, gezinme, oturum ve dosya indirme entegrasyonu. |
| `public/sw.js` | Scramjet service worker yönlendirmesi. |
| `public/download.mjs` | Dosya adı korunarak, en fazla 50 MB indirme. |
| `scripts/setup.mjs` | Mevcut ayarları ezmeden rastgele yerel şifre oluşturma. |
| `test/security.test.mjs` | Ağ denetimi ve backend güvenlik kontrolleri. |
| `test/e2e-server.mjs` | Yalnız testlerde kullanılan kapalı fixture sunucusu. |
| `test/browser/proxy.spec.mjs` | Gerçek tarayıcı ile gezinme, JS, cookie ve dosya testleri. |
| `.github/workflows/test.yml` | GitHub Actions üzerinde otomatik doğrulama. |
| `Dockerfile`, `compose.yaml`, `deploy/Caddyfile` | Harici HTTPS barındırma için kurulum paketi. |

## Güvenlik ve doğrulama sınırları

Proxy şifresi `.env` içinde, Git dışında saklanır. Oturum kimlikleri rastgele ve bellektedir; cookie HttpOnly/SameSite=Strict'tir. Canlı HTTPS origin tanımlandığında Secure flag eklenir. Çıkış, ilgili WebSocket bağlantılarını da kapatır. API POST ve WebSocket upgrade isteklerinde origin kontrolü vardır.

DNS çözümlemesinin tüm sonuçları genel IP olmak zorundadır; bir özel IP sonucu dahi isteği reddeder. IPv4-mapped IPv6 da kontrol edilir. Bağlantıda IP yeniden çözülür ve yine bu denetimden geçer. Wisp yalnız TCP 80/443 taşır. Oturum başına en fazla dört WebSocket, bağlantı başına en fazla 64 stream kabul edilir.

Wisp 0.5.0'ın hostname başına stream sınırı uygulamasında object üzerinde yanlış iterator kullanımı bulundu; bu upstream seçenek etkinleştirilmez. Toplam stream sınırı kullanılır. DNS resolver hatası durumunda transport gerçek TCP bağlantısı kurmadan reddeder.

Test ortamında yalnız `proxy-fixture.test` hostname'i 127.0.0.1'e çözümlenir ve loopback için açık bir fixture istisnası uygulanır. Bu istisna yalnız `test/e2e-server.mjs` içindedir; üretim giriş noktasında yoktur, environment değişkeniyle açılmaz ve Docker imajına test dosyaları kopyalanmaz.

İçerik yeniden yazımı normal tarayıcının origin izolasyonunu birebir sağlamaz. Uygulama tek hesap için tasarlanmıştır. Scramjet/BareMux legacy sürümleri kullanılır; her site için çalışma veya güvenlik garantisi yoktur.

## GitHub'ın rolü

GitHub kaynak kodu ve CI testlerini barındırır. Actions job'u kontrollü fixture'a karşı gerçek yazılım testi yürütür ve biter. Kalıcı genel gezinme sunucusu veya tünel oluşturulmaz.

İlk istekteki yalnız GitHub alan adlarından, Actions üzerinden tam internet erişimi hedefi desteklenen bir dağıtım yolu değildir: [Pages statiktir](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages); Actions job'u GitHub hostname'inde web endpoint'i vermez. [Actions koşulları](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions) genel internet proxy işletimini kısıtlar. Bu teknik ve kullanım sınırları bir iş akışını “test” diye adlandırarak değişmez.

## Sonraki dağıtım adımı

Canlı kullanım için bu servise izin veren bir Node.js/WebSocket sunucusu ve HTTPS origin gerekir. Kullanıcı henüz bir sunucu sağlamadı. Docker ve Caddy örnekleri hazırlandı fakat yerel Docker olmadığı için container dağıtımı doğrulanmadı. Sunucu verildiğinde bağlantı, HTTPS, kimlik doğrulama ve ağ çıkışı o ortamda ayrıca kontrol edilmeli.
