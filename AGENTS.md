# Çalışma talimatları

- Kullanıcıyla Türkçe iletişim kur.
- Önce README.md ve PROJE.md dosyalarını oku.
- Projenin adı github proxy.
- Kullanıcı başlangıçta yalnız GitHub adresleri ve Actions ağından çıkış istedi. Sınırlar açıklandıktan sonra harici sunucudan çıkış yapan web proxy seçeneğini kabul etti.
- Güncel mimari: Node.js web proxy, sayfa içinde hedef site, GitHub'da kaynak kod ve CI. Barındırma adresi henüz verilmedi.
- Kullanıcı harici tünel açıklamasından sonra siteyi kurmayı istedi. Manuel geliştirme önizlemesi: GitHub Pages portalı + Actions'ta en fazla 30 dakika çalışan şifreli proxy + Cloudflare Quick Tunnel. Kalıcı genel gezinme/VPN hizmetine dönüştürme veya otomatik yeniden başlatma ekleme.
- Uzak Chrome çözümüne geçme; kabul edilen seçenek web proxy.
- GitHub Pages üzerinde iframe/fetch kullanmanın GitHub ağından çıkış sağlamadığını açık tut.
- Teknik olarak mümkün olmayan veya doğrulanmamış davranışları çalışıyor diye sunma.
- Yerel doğrulama ile canlı dağıtımı ayırt et. Canlı barındırma sağlanmadan canlı proxy adresi vaat etme.
- Kimlik bilgileri, tokenlar, cookie'ler ve kullanıcı dosyalarını public repoya veya Actions loglarına koyma.
- Yeni GitHub teknik özelliklerini ve ürün koşullarını birincil kaynaklardan kontrol et.
- Kod eklenirse yalnızca gerçekten uygulanmış davranışları belgele ve uygun kontrolleri çalıştır.
