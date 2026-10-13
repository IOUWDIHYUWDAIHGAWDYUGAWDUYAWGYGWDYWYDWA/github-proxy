# Proje ayrıntıları

## Kullanıcının kesinleştirdiği amaç

Projenin adı **github proxy**. Kullanıcı bir GitHub sitesini açacak, bir hedef adres yazacak ve hedef siteyi bu arayüz içinde kullanacak. Hedefe giden bağlantıyı GitHub Actions kuracak. Bu, bilgisayar genelinde çalışan bir VPN istemcisi yerine tarayıcıdan kullanılan bir web proxy isteğidir.

Örnek senaryo: kullanıcının ağından bir siteye erişilemiyorsa hedefe Actions ağından erişilip içerik GitHub arayüzüne aktarılacak. Hedef sitenin Actions ağından erişilebilir olması ayrıca doğrulanmalıdır; erişim garantisi yoktur.

## Kesin kapsam

| Gereksinim | Açıklama |
| --- | --- |
| Giriş adresi | Yalnız GitHub adresleri; harici tünel alan adı kabul edilmiyor. |
| Ağ çıkışı | GitHub-hosted Actions makinesi. |
| Arayüz | Hedef siteyi arama/adres alanından açma ve içerikte gezinme. |
| Etkileşim | JavaScript, bağlantılar, formlar, oturum/cookie işlemleri. |
| Dosyalar | Hedef siteye yükleme; hedef siteden indirme. |
| Sunucu | Harici VPS veya uzak Chrome sunucusu istenmiyor. |
| Kaynak kod | Public GitHub repo; proje belgeleri bu klasörde. |

## İstenen veri yolu

```text
Kullanıcının tarayıcısı
    → GitHub alan adındaki giriş/aktarım katmanı
    → GitHub Actions içindeki proxy
    → Hedef web sitesi
    → Aynı yol üzerinden kullanıcıya yanıt
```

Eksik bileşen, GitHub alan adında sunulabilen çift yönlü aktarım katmanıdır. Pages bu katmanı sağlamaz; Actions job'u da kendiliğinden GitHub alan adında bir servis endpoint'i oluşturmaz.

## Değerlendirilen yollar

| Yol | Sonuç |
| --- | --- |
| Pages üzerinde iframe | İstekler kullanıcının ağından çıkar. Hedefin CSP/X-Frame-Options kuralları gömülmeyi engelleyebilir. |
| Pages JavaScript'i ile doğrudan fetch | İstekler yine kullanıcının ağından çıkar; CORS kısıtları da uygulanır. |
| Actions içinde HTTP sunucusu | GitHub hostname'i altında doğrudan erişim adresi sağlamaz. |
| Actions + üçüncü taraf tünel | Ek alan adı gerekir; kullanıcının açık şartına uymuyor. |
| Harici sunucuda uzak Chrome | Kullanıcının açık şartına uymuyor. |
| GitHub API'sini mesaj kuyruğu olarak kullanma | Teorik aktarım yapılabilir; desteklenen VPN/proxy değildir. Kota, gecikme, oturum ve gizlilik sorunları çözülmüş değildir. |

HTTP yanıtlarını kopyalamak tek başına tam tarayıcı deneyimi sağlamaz. HTML, CSS, JavaScript ve URL yeniden yazımı; cookie izolasyonu; yönlendirmeler; WebSocket; yükleme ve indirme akışları gerekir. Roblox sitesini görüntülemek ile Roblox oyun istemcisinin ağ trafiğini taşımak farklı gereksinimlerdir. Bu projede oyun istemcisi desteği doğrulanmadı.

## GitHub kullanım koşulları

[Actions koşullarındaki](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions) sınırlama genel internet proxy kullanımını etkiliyor. Bir iş akışına “test” adı vermek, genel internet gezinmesini yazılım testi haline getirmez. GitHub'ın orantısız yük ve CDN/serverless kullanımıyla ilgili sınırlamaları da aktarım tasarımında dikkate alınmalıdır.

## Başlangıç çalışmasında yapılanlar

- Yerel klasör ve `gh` bağlantısı kontrol edildi.
- Kullanıcının gereksinimleri ve reddettiği alternatifler kaydedildi.
- GitHub'ın birincil teknik belgeleri ve ürün koşulları kontrol edildi.
- Proje belgeleri oluşturuldu.

Bu belge canlı proxy bağlantısı, erişim aşma garantisi veya uçtan uca test sonucu bildirmez.

## Devam etmek için gereken karar

Mevcut kapsam altında çalışan bir servis vaat edilmemeli. Devam için ya GitHub tarafından bu kullanımın desteklendiği/izin verildiği bir çözüm doğrulanmalı ya da kullanıcı bağlantı veya barındırma şartını değiştirmeli. Böyle bir değişiklik kullanıcıdan gelmeden VPS, Cloudflare tüneli veya uzak Chrome çözümüne geçilmemeli.
