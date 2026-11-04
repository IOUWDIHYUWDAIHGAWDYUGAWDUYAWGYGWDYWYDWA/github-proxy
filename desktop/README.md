# github proxy VPN — Windows

Tailscale gerektirmeyen yerel Windows uygulaması. Resmî WireGuard Windows bileşenini yönetir; kendi VPN protokolünü veya sürücüsünü içermez.

1. [Resmî WireGuard](https://www.wireguard.com/install/) Windows bileşenini kur.
2. `dist/GithubProxyVPN.exe` uygulamasını aç; Windows yönetici izni ister.
3. VPN sunucuna/sağlayıcına ait `.conf` dosyasını içe aktar.
4. **Bağlan** düğmesini kullan. Servisin başlaması ile sunucuyla el sıkışmasının doğrulanması ayrı gösterilir.
5. Bitirdiğinde **Bağlantıyı kes** düğmesine bas. Pencereyi kapatmak VPN'i kendiliğinden kesmez; bu durumda uygulama uyarır.

Bir sunucu veya geçerli `.conf` sağlanmadığı için gerçek VPN bağlantısı doğrulanmadı. Mevcut GitHub Pages/Cloudflare web proxy URL'si WireGuard yapılandırması olarak kullanılamaz. Bu program GitHub Actions iş akışını değiştirmez.

Tam IPv4 tüneli için tek Peer, `AllowedIPs = 0.0.0.0/0`, IP biçiminde DNS ve Interface Address gerekir. IPv6 internet erişimi için sunucu desteği, IPv6 Interface Address ve `::/0` rotası da gerekir. Tek peer ve `/0` için resmî Windows WireGuard bileşeninin firewall koruması uygulanır; yerel ağ erişimi de etkilenebilir. [WireGuard Windows routing/firewall açıklaması](https://git.zx2c4.com/wireguard-windows/about/docs/netquirk.md).

İçe aktarılan yapılandırma `%ProgramData%\GithubProxyVPN\GithubProxyDesktop.conf.dpapi` içinde Windows DPAPI ile şifreli saklanır. Klasöre yalnız SYSTEM ve yöneticiler erişebilir. Kaynak `.conf` dosyan değiştirilmez. Anahtarlar arayüze, loglara veya repoya yazılmaz. Özel komut çalıştıran PreUp/PostUp vb. ayarlar reddedilir. Otomatik Windows başlangıcı etkinleştirilmez.

Uygulama yalnız `WireGuardTunnel$GithubProxyDesktop` servisini yönetir; başka tünelleri kaldırmaz. İmzalanmamış yerel derlemedir. Windows 10/11 x64 ve .NET Framework 4.8 gerektirir. Derleme: `powershell -ExecutionPolicy Bypass -File desktop/build.ps1`. Derleme testi yapılandırma doğrulama ve DPAPI round-trip kontrolü yapar; servisi başlatmaz, ağ ayarını değiştirmez.

Kaynak kod, ana reponun AGPL-3.0 lisansı kapsamındadır. WireGuard ayrı kurulur ve kendi lisansına tabidir. [Resmî servis CLI belgesi](https://git.zx2c4.com/wireguard-windows/about/docs/enterprise.md).
