using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Net;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.ServiceProcess;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace GithubProxyVPN {
  static class Program {
    public const string Tunnel = "GithubProxyDesktop";
    public static readonly string Store = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "GithubProxyVPN");
    public static readonly string Profile = Path.Combine(Store, Tunnel + ".conf.dpapi");
    public static string Engine { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WireGuard", "wireguard.exe"); } }
    [STAThread] static void Main(string[] args) {
      if (args.Contains("--self-test")) { SelfTest(); return; }
      Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new MainForm());
    }
    public static string Validate(string text) {
      if (text.Length > 65536) throw new Exception("Yapılandırma 64 KB sınırını aşıyor.");
      string section = ""; int interfaces = 0, peers = 0;
      var values = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
      var allowedI = new [] { "PrivateKey", "Address", "DNS", "MTU", "ListenPort" };
      var allowedP = new [] { "PublicKey", "PresharedKey", "Endpoint", "AllowedIPs", "PersistentKeepalive" };
      var clean = new StringBuilder();
      foreach (string raw in text.Split('\n')) {
        string line = raw.Split('#')[0].Trim(); if (line.Length == 0) continue;
        if (line.Equals("[Interface]",StringComparison.OrdinalIgnoreCase)) { section="I"; interfaces++; }
        else if (line.Equals("[Peer]",StringComparison.OrdinalIgnoreCase)) { section="P"; peers++; }
        else {
          int eq=line.IndexOf('='); if(eq<1 || section.Length==0) throw new Exception("Geçersiz WireGuard yapılandırması.");
          string key=line.Substring(0,eq).Trim(), value=line.Substring(eq+1).Trim();
          if (!(section=="I" ? allowedI : allowedP).Contains(key,StringComparer.OrdinalIgnoreCase)) throw new Exception("Desteklenmeyen ayar: " + key);
          string id=section+":"+key; if(values.ContainsKey(id)) throw new Exception("Yinelenen ayar: "+key); values[id]=value;
        }
        clean.AppendLine(line);
      }
      if(interfaces!=1 || peers!=1) throw new Exception("Tam tünel için bir Interface ve bir Peer gerekli.");
      foreach(string key in new [] { "I:PrivateKey", "P:PublicKey" }) {
        string value; if(!values.TryGetValue(key,out value)) throw new Exception("Anahtar eksik.");
        byte[] bytes; try { bytes=Convert.FromBase64String(value); } catch { throw new Exception("Geçersiz WireGuard anahtarı."); }
        if(bytes.Length!=32 || bytes.All(b=>b==0)) throw new Exception("Geçersiz WireGuard anahtarı.");
      }
      string routes; if(!values.TryGetValue("P:AllowedIPs",out routes) || !routes.Split(',').Select(s=>s.Trim()).Contains("0.0.0.0/0")) throw new Exception("Tam tünel için AllowedIPs içinde 0.0.0.0/0 gerekli.");
      foreach(string route in routes.Split(',')) CheckCidr(route.Trim());
      string address; if(!values.TryGetValue("I:Address",out address)) throw new Exception("Interface Address gerekli.");
      foreach(string item in address.Split(',')) CheckCidr(item.Trim());
      string dns; if(!values.TryGetValue("I:DNS",out dns)) throw new Exception("DNS sunucusu gerekli.");
      foreach(string item in dns.Split(',')) { IPAddress ip; if(!IPAddress.TryParse(item.Trim(),out ip)) throw new Exception("DNS alanı IP adresi içermeli."); }
      string endpoint; if(!values.TryGetValue("P:Endpoint",out endpoint)) throw new Exception("VPN sunucu adresi eksik.");
      Uri uri; if(!Uri.TryCreate("udp://"+endpoint,UriKind.Absolute,out uri) || uri.Port<1 || uri.Port>65535 || uri.UserInfo.Length>0 || uri.AbsolutePath!="/") throw new Exception("Endpoint sunucu:port biçiminde olmalı.");
      return clean.ToString();
    }
    static void CheckCidr(string value) {
      var parts=value.Split('/'); IPAddress ip; int prefix;
      if(parts.Length!=2 || !IPAddress.TryParse(parts[0],out ip) || !int.TryParse(parts[1],out prefix) || prefix<0 || prefix>(ip.AddressFamily==System.Net.Sockets.AddressFamily.InterNetwork?32:128)) throw new Exception("Geçersiz IP/prefix adresi.");
    }
    [StructLayout(LayoutKind.Sequential)] struct Blob { public int Length; public IntPtr Data; }
    [DllImport("crypt32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CryptProtectData(ref Blob input,string description,IntPtr entropy,IntPtr reserved,IntPtr prompt,int flags,out Blob output);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
    public static byte[] Encrypt(string text) {
      byte[] data=Encoding.UTF8.GetBytes(text); var input=new Blob {Length=data.Length,Data=Marshal.AllocHGlobal(data.Length)}; Blob output;
      try {
        Marshal.Copy(data,0,input.Data,data.Length);
        if(!CryptProtectData(ref input,Tunnel,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,5,out output)) throw new Exception("Windows şifreleme işlemi başarısız.");
        try { var result=new byte[output.Length]; Marshal.Copy(output.Data,result,0,result.Length); return result; } finally {LocalFree(output.Data);}
      } finally { for(int i=0;i<data.Length;i++) Marshal.WriteByte(input.Data,i,0); Marshal.FreeHGlobal(input.Data); Array.Clear(data,0,data.Length); }
    }
    public static void Save(string config) {
      var security=new DirectorySecurity(); security.SetAccessRuleProtection(true,false);
      foreach(var sid in new [] {WellKnownSidType.LocalSystemSid,WellKnownSidType.BuiltinAdministratorsSid}) security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid,null),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
      if(Directory.Exists(Store) && (File.GetAttributes(Store)&FileAttributes.ReparsePoint)!=0) throw new Exception("Yapılandırma klasörü bağlantı içeremez.");
      Directory.CreateDirectory(Store,security); Directory.SetAccessControl(Store,security);
      if(File.Exists(Profile) && (File.GetAttributes(Profile)&FileAttributes.ReparsePoint)!=0) throw new Exception("Yapılandırma dosyası bağlantı içeremez.");
      byte[] encrypted=Encrypt(config); string temp=Path.Combine(Store,Guid.NewGuid().ToString("N")+".tmp");
      try { File.WriteAllBytes(temp,encrypted); if(File.Exists(Profile)) File.Replace(temp,Profile,null); else File.Move(temp,Profile); } finally {if(File.Exists(temp)) File.Delete(temp);}
    }
    public static ServiceController Service() { return new ServiceController("WireGuardTunnel$"+Tunnel); }
    public static bool Running() { try {using(var s=Service()) return s.Status==ServiceControllerStatus.Running;} catch {return false;} }
    public static int Run(string exe,string args) {
      using(var p=Process.Start(new ProcessStartInfo(exe,args) {UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden})) {
        if(!p.WaitForExit(30000)) {try{p.Kill();}catch{} throw new Exception("WireGuard işlemi zaman aşımına uğradı.");} return p.ExitCode;
      }
    }
    public static void Connect() {
      if(!File.Exists(Engine)) throw new Exception("Önce resmî WireGuard bileşenini kur.");
      if(!File.Exists(Profile)) throw new Exception("Önce sunucuna ait .conf dosyasını içe aktar.");
      if(Running()) return;
      bool exists; using(var s=Service()) {try {var status=s.Status; exists=true;} catch {exists=false;}}
      if(exists) {using(var s=Service()) {s.Start(); s.WaitForStatus(ServiceControllerStatus.Running,TimeSpan.FromSeconds(15));}}
      else if(Run(Engine,"/installtunnelservice \""+Profile+"\"")!=0) throw new Exception("WireGuard tüneli başlatılamadı. Yapılandırmayı kontrol et.");
      // The application never enables automatic connection on Windows startup.
      if(Run(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"sc.exe"),"config \"WireGuardTunnel$"+Tunnel+"\" start= demand")!=0) {
        Disconnect(); throw new Exception("Başlangıç ayarı uygulanamadı; tünel kapatıldı.");
      }
    }
    public static void Disconnect() {
      if(!File.Exists(Engine)) throw new Exception("WireGuard bileşeni bulunamadı.");
      bool exists; using(var s=Service()) {try {var status=s.Status; exists=true;}catch{exists=false;}}
      if(exists && Run(Engine,"/uninstalltunnelservice "+Tunnel)!=0) throw new Exception("Tünel kaldırılamadı. WireGuard veya services.msc üzerinden kontrol et.");
    }
    public static string Handshake() {
      string wg=Path.Combine(Path.GetDirectoryName(Engine),"wg.exe"); if(!File.Exists(wg)) return "Tünel açık; el sıkışması kontrol edilemiyor.";
      var info=new ProcessStartInfo(wg,"show "+Tunnel+" latest-handshakes") {UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
      using(var p=Process.Start(info)) {
        var output=p.StandardOutput.ReadToEndAsync(); var errors=p.StandardError.ReadToEndAsync();
        if(!p.WaitForExit(2000)) {try{p.Kill();}catch{} return "Tünel açık; durum sorgusu gecikti.";}
        if(p.ExitCode!=0) return "Tünel açık; sunucu doğrulaması bekleniyor.";
        string[] parts=output.Result.Trim().Split(new [] {'\t',' ','\r','\n'},StringSplitOptions.RemoveEmptyEntries); long stamp;
        if(parts.Length>=2 && long.TryParse(parts[1],out stamp) && stamp>0) {
          long age=(long)(DateTime.UtcNow-new DateTime(1970,1,1)).TotalSeconds-stamp;
          return age>=0 && age<180 ? "Bağlı • sunucuyla el sıkışması doğrulandı." : "Tünel açık • son el sıkışması güncel değil.";
        }
        return "Tünel açık • sunucudan yanıt bekleniyor.";
      }
    }
    static void SelfTest() {
      string key=Convert.ToBase64String(Enumerable.Repeat((byte)7,32).ToArray());
      string config="[Interface]\nPrivateKey="+key+"\nAddress=10.8.0.2/32\nDNS=1.1.1.1\n[Peer]\nPublicKey="+key+"\nEndpoint=vpn.example.com:51820\nAllowedIPs=0.0.0.0/0, ::/0\n";
      Validate(config); int count=1;
      foreach(string bad in new [] {config.Replace("0.0.0.0/0","10.0.0.0/8"),config+"\nPostUp=calc.exe",config.Replace("DNS=1.1.1.1","DNS=bad"),config+"\n[Peer]\nPublicKey="+key,config.Replace("Address=10.8.0.2/32","Address=invalid")}) {bool rejected=false;try{Validate(bad);}catch{rejected=true;}if(!rejected)throw new Exception("Validation test failed"); count++;}
      byte[] decrypted=ProtectedData.Unprotect(Encrypt(config),null,DataProtectionScope.LocalMachine); if(Encoding.UTF8.GetString(decrypted)!=config)throw new Exception("Encryption test failed"); count++;
      Console.WriteLine("PASS: "+count+" checks; no VPN service or network settings changed.");
    }
  }
  class MainForm:Form {
    readonly Color bg=Color.FromArgb(13,17,24), panel=Color.FromArgb(22,31,46), blue=Color.FromArgb(155,197,255);
    readonly Label status=new Label(), detail=new Label(), engine=new Label();
    readonly Button connect=new Button(), disconnect=new Button(), import=new Button();
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer(); bool busy=false, polling=false;
    public MainForm() {
      Text="github proxy VPN"; Size=new Size(650,510); MinimumSize=new Size(620,490); StartPosition=FormStartPosition.CenterScreen; BackColor=bg; ForeColor=Color.White; Font=new Font("Segoe UI",10); AutoScaleMode=AutoScaleMode.Dpi;
      var title=new Label {Text="github proxy  /  VPN",Font=new Font("Segoe UI",22,FontStyle.Bold),AutoSize=true,Location=new Point(32,28)}; Controls.Add(title);
      Controls.Add(new Label {Text="Tailscale gerektirmeyen Windows istemcisi",AutoSize=true,ForeColor=blue,Location=new Point(35,81)});
      var card=new Panel {BackColor=panel,Location=new Point(32,123),Size=new Size(566,144),Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right}; Controls.Add(card);
      status.Text="Bağlı değil"; status.Font=new Font("Segoe UI",16,FontStyle.Bold); status.SetBounds(20,20,526,38); card.Controls.Add(status);
      detail.Text="Sunucuna ait WireGuard .conf dosyasını içe aktar."; detail.SetBounds(20,68,526,56); detail.ForeColor=Color.LightSteelBlue; card.Controls.Add(detail);
      import.Text=".conf içe aktar"; connect.Text="Bağlan"; disconnect.Text="Bağlantıyı kes";
      int x=32; foreach(var b in new []{import,connect,disconnect}) {b.SetBounds(x,289,178,44);b.FlatStyle=FlatStyle.Flat;b.BackColor=b==connect?blue:panel;b.ForeColor=b==connect?bg:Color.White;Controls.Add(b);x+=194;}
      engine.SetBounds(34,354,560,28); engine.ForeColor=Color.LightSteelBlue; Controls.Add(engine);
      var install=new LinkLabel {Text="Resmî WireGuard bileşenini indir",AutoSize=true,LinkColor=blue,Location=new Point(34,390)}; install.LinkClicked+=(s,e)=>Process.Start("https://www.wireguard.com/install/"); Controls.Add(install);
      Controls.Add(new Label {Text="VPN sunucusu gerekir. Mevcut web proxy adresi .conf yerine kullanılamaz.",ForeColor=Color.Gray,AutoSize=false,Location=new Point(34,427),Size=new Size(560,35)});
      import.Click+=async(s,e)=>await Work(()=>Import()); connect.Click+=async(s,e)=>await Work(()=>Program.Connect()); disconnect.Click+=async(s,e)=>await Work(()=>Program.Disconnect());
      timer.Interval=2500; timer.Tick+=async(s,e)=>await RefreshStatus(); timer.Start(); Shown+=async(s,e)=>await RefreshStatus();
      FormClosing+=(s,e)=>{if(busy){e.Cancel=true;return;} if(Program.Running()){var choice=MessageBox.Show("Pencere kapanınca VPN açık kalacak. Bağlantıyı kesmek için İptal'e basıp 'Bağlantıyı kes' düğmesini kullan.","VPN açık",MessageBoxButtons.OKCancel,MessageBoxIcon.Information);if(choice==DialogResult.Cancel)e.Cancel=true;} if(!e.Cancel)timer.Stop();};
    }
    void Import() {
      if(Program.Running())throw new Exception("Profili değiştirmeden önce bağlantıyı kes.");
      // File dialogs must run on the UI thread.
      string path=null; Invoke((Action)(()=>{using(var dialog=new OpenFileDialog {Filter="WireGuard yapılandırması (*.conf)|*.conf",Title="Sunucuna ait yapılandırmayı seç"})if(dialog.ShowDialog(this)==DialogResult.OK)path=dialog.FileName;}));
      if(path==null)return; if(new FileInfo(path).Length>65536)throw new Exception("Dosya çok büyük."); Program.Save(Program.Validate(File.ReadAllText(path)));
    }
    async Task Work(Action action) {
      if(busy)return;busy=true;connect.Enabled=disconnect.Enabled=import.Enabled=false;
      try {await Task.Run(action);} catch(Exception ex) {MessageBox.Show(this,ex.Message,"İşlem tamamlanamadı",MessageBoxButtons.OK,MessageBoxIcon.Information);} finally {busy=false;} await RefreshStatus();
    }
    async Task RefreshStatus() {
      if(polling||busy||IsDisposed)return;polling=true;
      try {
        bool running=await Task.Run(()=>Program.Running()); string text=running?await Task.Run(()=>Program.Handshake()):"Bağlı değil";
        if(IsDisposed)return;status.Text=text.StartsWith("Bağlı •")?"Bağlı":"Tünel "+(running?"açık":"kapalı");status.ForeColor=running?blue:Color.White;
        detail.Text=running?text:(File.Exists(Program.Profile)?"Profil hazır. Bağlan düğmesi tüm internet çıkışını bu tünele yönlendirir.":"Sunucuna ait WireGuard .conf dosyasını içe aktar.");
        engine.Text=File.Exists(Program.Engine)?"WireGuard bileşeni bulundu":"WireGuard bileşeni kurulu değil";
        connect.Enabled=!running&&File.Exists(Program.Engine)&&File.Exists(Program.Profile);disconnect.Enabled=running;import.Enabled=!running;
      } finally {polling=false;}
    }
  }
}
