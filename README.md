# github proxy

GitHub adresinden açılan bir web arayüzüne hedef site adresi yazmak ve o siteyi GitHub Actions makinesinin internet bağlantısı üzerinden kullanmak için proje araştırması.

**Durum: gereksinimler ve uygulanabilirlik araştırması hazır. Çalışan proxy/VPN veya yayınlanmış tarayıcı servisi yok.**

## İstenen kullanım

1. Kullanıcı yalnızca GitHub alan adları üzerinden projeye erişir.
2. Arayüze bir web sitesi adresi girer.
3. GitHub Actions hedef siteye bağlanır; içerik arayüzde gösterilir.
4. Bağlantılar, oturum açma, JavaScript, dosya yükleme ve indirme çalışır.

Kullanıcının bilgisayarı yerine GitHub Actions makinesinin ağı hedef siteye çıkar. Harici VPS, uzak Chrome sunucusu veya üçüncü taraf tünel adresi istenmiyor.

## Mevcut engel

GitHub Pages statik HTML/CSS/JavaScript barındırır. Sunucu tarafında proxy çalıştırmaz. Bir hedef siteyi doğrudan iframe'e koymak da istekleri GitHub ağından çıkarmaz: bağlantıyı ziyaretçinin tarayıcısı kurar ve hedef sitenin çerçeve güvenlik kuralları uygulanır.

GitHub Actions bir web barındırma servisi değildir. Bir job içinde HTTP sunucusu başlatmak, bu sunucuya `github.com` veya `github.io` altında erişilebilir bir adres sağlamaz. Dışarı açmak için ek bağlantı altyapısı gerekir; üçüncü taraf tünel kullanımı projenin kabul edilen kapsamına uymuyor.

GitHub API'si üzerinden istek/yanıt mesajlaşması teorik olarak tasarlanabilir; ancak bu, desteklenen bir proxy taşıma katmanı değildir. Kimlik doğrulama, kota, gecikme, veri gizliliği ve büyük dosya sorunları vardır. Bu araştırmada böyle bir servis kurulmadı.

Ayrıca GitHub'ın Actions koşulları, GitHub-hosted runner'ların ilgili yazılım projesinin üretimi, testi, dağıtımı veya yayınlanması dışındaki faaliyetlerde kullanılmasını kısıtlıyor. Genel internet erişimi amacıyla Actions'ı VPN/proxy olarak işletmek bu koşullarla çelişir.

Bu nedenle belirtilen gereksinimlerin tamamını karşılayan, GitHub tarafından desteklenen bir uygulama yolu doğrulanamadı.

## Belgeler

- [Proje kapsamı ve teknik değerlendirme](PROJE.md)
- [Sonraki çalışmalar için talimatlar](AGENTS.md)

## Birincil kaynaklar

13 Ekim 2026 tarihinde kontrol edildi:

- [GitHub Pages nedir?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Actions ürün koşulları](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions)
- [GitHub-hosted runner açıklaması](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)
- [GitHub REST API kota sınırları](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
