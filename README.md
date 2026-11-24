# Tahta — BIST Analiz

BIST hisseleri için kişisel bir analiz arayüzü: **tarama**, **teknik analiz** ve **temel analiz**.
Tarayıcıda çalışır, telefonda ana ekrana eklenince uygulama gibi açılır (PWA).

## Ne var?

- **Tarama:** BIST TÜM'deki tüm hisseler (~580); her hissenin BIST 30 / 50 / 100 / TÜM etiketi.
  Fiyat / Trend / Momentum / Temettü / Temel sütun grupları, BIST 30/50/100/TÜM ve Yıldız/Ana/Alt/YİP etiketi, sıralama, endeks ve sektör filtresi,
  kendi filtrelerin (ör. `RSI 14 < 30`, `F/K < 8`) ve hazır taramalar (aşırı satım/alım, güçlü trend,
  golden cross, MACD / Supertrend / Fisher al, Stoch RSI dipte, bulut üstünde, 52H zirvesi, hacim patlaması,
  ucuz, kârlı büyüme). ★ ile izleme listesi.
- **Temettü:** açıklanmış ama henüz ödenmemiş temettüler (tarihli ya da "tarih bekleniyor"), takvim yılı bazında bu yıl ve geçen yılın toplamı ve verimi (güncel fiyata göre), yıllık değişim,
  bu yılki ödeme sayısı, son ödeme, son 5 yılda kaç yıl ödediği, kesintisiz yıl, 5 yıllık ortalama verim, dağıtma oranı; hisse sayfasında ödeme geçmişi.
- **Tedbir uyarısı:** tedbirli hissenin yanında ⚠; üzerine gelince/dokununca tedbirler.
- **Destek / direnç (confluence):** önceki yıl/çeyrek/ay/hafta yüksek-düşük-orta (EQ), dönem açılışları, haftalık
  dönüş noktaları, 1 yıllık hacim profili (POC/VAH/VAL), 52 hafta, SMA200/50, haftalık SMA50, aylık pivot, kapanmamış
  boşluklar ve yuvarlak sayılar yarım ATR toleransla bölgelere birleştirilir; ağırlıklı skor (≥ 10 güçlü) ve kesişim
  sayısı. Grafikte katman, hisse sayfasında tablo, taramada uzaklık/güç sütunları ve hazır taramalar, portföyde destek.
- **Arayüz düzeni:** üstte Tarama · Sinyaller · Portföy · Karşılaştır (telefonda alt sekme çubuğu); Rehber (?) ve
  Aktar (⚙) sağ üstte; veri tarihi üst çubukta rozet olarak (eskiyse sarı). Taramanın üstünde "Bugün" kartları (açık
  sinyaller, portföy, izleme listesi, 14 gün içindeki temettüler). Hazır taramalar Teknik / Temettü / Temel / Kayıtlı
  başlıkları altında gruplu. Hisse sayfasında grafik üstte, altında sekmeler (Genel, Destek / direnç, Temettü, Temel ve
  değerleme, Sektör); göstergeler tek menüde, açık olanlar etiket olarak; verisi olmayan kartlar gizlenir. Uzun
  açıklamalar "ⓘ" satırlarında katlı.
- **Veri sağlığı:** her güncellemede kaynakların durumu (fiyatlar, 4 saatlik mumlar, sinyaller, tedbirler, temettü takvimi ve
  geçmişi, İş Yatırım, mali tablolar, Piyasa Nabzı, döviz) `summary.json` → `health` ve GitHub iş akışı özetine yazılır;
  sitede veri rozetine dokununca görünür. Rozet; veri 4 günden eskiyse, hafta içi son güncellemeden 26 saat (hafta sonu 74)
  geçtiyse ya da bir kaynak sorunluysa sarıya döner.
- **Piyasa Nabzı** (0–100; kısa/uzun vade genişliğinin 4 yıllık dilimi 25+25, kısa/uzun vade yönü 20+15, kısa vadenin önderliği 15; Kritik · Zayıf · Kararsız · Sağlıklı · Güçlü) ve **piyasa genişliği** (`scripts/breadth.py`, testleri `tests/test_breadth.py`): BIST TÜM hisselerinin 50 ve 200 günlük
  ortalamasının üstündeki oranı, 4 yıllık dilimi, 10/20 günlük değişimi ve kurallı yorum (olumlu ve olumsuz işaretler: yön,
  dipten dönüş, yarıyı geçme, uzun vade, aşırı ısınma, endeksle uyumsuzluk). Taramanın Bugün kartlarında; dokununca grafik.
- **Sütun seçimi ve sırası:** her sekmede yalnızca temel sütunlar açık gelir (8–11 sütun); "☰ Görünüm" ile sütun gizle/göster, diğer sekmelerden ya da ek alanlardan
  sütun ekle, ↑ ↓ ile sırala; bilgisayarda başlıkları sürükleyerek de sıralanır. Sekme başına saklanır,
  "Varsayılana dön" ile sıfırlanır.
- **Kayıtlı taramalar:** filtre + endeks + sektör + hazır tarama kombinasyonunu adıyla kaydet, tek dokunuşla aç.
- **Hisse detayı:** mum grafik + hacim; katmanlar: SMA20/50/200, VWMA20, Bollinger, Ichimoku, Supertrend;
  alt paneller: RSI, Stoch RSI, MACD, Fisher, ATR. Doğrusal / log / % ölçek, fiyat eksenini sürükleyerek dikey
  yakınlaştırma, mıknatıslı imleç, hacim aç/kapa, görünümü sıfırla, tam ekran. Getiriler, 52 haftalık aralık, teknik özet,
  sektör medyanıyla karşılaştırmalı temel oranlar, aynı sektördeki hisseler.
- **Karşılaştır:** en fazla 5 hisse + BIST 100, dönem başı = 100; dönem getirisi, BIST 100'e göre fark,
  en büyük düşüş ve volatilite tablosu.
- **Portföy:** alım/satım işlemleriyle yönetilir (tarih, adet, fiyat, komisyon); ortalama maliyet ve
  gerçekleşen K/Z ortalama maliyet yöntemiyle hesaplanır, tamamı satılanlar "Kapanan pozisyonlar"a geçer.
  TL nakit akışı: alımlar TL bakiyeden ya da dışarıdan, satış gelirleri TL bakiyeye ya da portföy dışına;
  para yatır/çek; net yatırılan ve toplam getiri. Hak kullanımı gerçekleşen temettüler (hak kullanımından önceki gün
  sonunda eldeki adetle) tespit edilir, net tutar ve hedef (TL bakiye / portföy dışı) kullanıcıya onaylatılır.
  Kategoriler: *Temettü* (verim, maliyete göre verim, yıllık beklenen temettü,
  sıradaki temettü), *Trend / Momentum* (Supertrend, trend, RSI; trend bozulunca "Çıkış sinyali"),
  *Emtia / İtibari* (gram altın, gram gümüş, TL, dolar, euro), *Kripto* (BTC, ETH, SOL, BNB, USDT, USDC): USDT/USDC TL ile alınır; BTC/ETH/SOL/BNB USDT ya da
  USDC bakiyesiyle (fiyat $ cinsinden), TL karşılığı işlem günü kuruyla hesaplanır. Toplam değer, kâr/zarar, günlük değişim,
  kategori dağılımı. Veriler yalnızca cihazda saklanır.
- **Bulut senkronizasyonu (isteğe bağlı):** portföy, izleme listesi ve kayıtlı taramalar kullanıcının kendi özel
  GitHub Gist'inde tutulur; erişim anahtarı (yalnızca `gist` yetkisi) sadece cihazın tarayıcısında saklanır.
  Açılışta, uygulamaya dönünce ve değişiklikten sonra eşitlenir; iki cihaz habersiz değiştirirse sorulur.
  Site bağlantısı paylaşılabilir: başkaları kendi (boş) portföyünü görür.
- **Aktar (⚙):** izleme listesi, kayıtlı taramalar ve portföyü bir kod ya da bağlantıyla başka cihaza taşı.
- **Güncelleme uyarısı:** yeni sürüm yayınlanınca uygulamada "Yeni sürüm hazır · Yenile" çıkar.

## Veri kaynakları

| Veri | Kaynak | Sıklık |
|---|---|---|
| Fiyat, hacim, bölünmeler (5 yıl, günlük; bölünmelere göre düzeltilmiş) | Yahoo Finance (~15 dk gecikmeli) | seans boyunca saatte bir |
| Temettü geçmişi | temettuhisseleri.com hisse sayfaları (ana) + Yahoo, karşılaştırmalı | hisse başına haftada bir; yeni temettü açıklanınca hemen |
| Pazar (Yıldız/Ana/Alt/YİP) | KAP Pazarlar sayfası | günde bir |
| Dolar, euro, gram altın, gram gümüş, kripto (TL) | Yahoo Finance (USDTRY, EURTRY, ons altın/gümüş × kur, BTC-USD vb. × kur) | seans boyunca saatte bir |
| Tedbirler | GCM Yatırım tedbir listesi + `scripts/tedbirler.csv` | her çalışmada |
| Açıklanmış (ödenmemiş) temettüler, net | temettuhisseleri.com temettü tarihleri sayfası | 6 saatte bir |
| Endeks bileşenleri (BIST 30/50/100/TÜM) | Borsa İstanbul resmi dosyası | her çalışmada |
| Sektör, halka açıklık, piyasa değeri | İş Yatırım özet tablosu | 6 saatte bir |
| Bilanço, gelir tablosu, nakit akışı (TL) | İş Yatırım mali tablolar | yalnızca yeni bilanço gelince (son çeyreği eksik şirkete günde bir kontrol; 120 günde bir tam yenileme) |

Temel oranlar güncel fiyat ve son 12 ay (TTM) mali tablolarla **burada hesaplanır**:
F/K = piyasa değeri / TTM net kâr (ana ortaklık), PD/DD = piyasa değeri / ana ortaklık özkaynakları,
FD/FAVÖK = (piyasa değeri + net finansal borç) / TTM (faaliyet kârı + amortisman),
büyüme oranları yılbaşından bu yana geçen yılın aynı dönemine göre. Banka ve sigorta şirketlerinde
satışa dayalı oranlar (marj, FD/FAVÖK, borç/ÖK) hesaplanmaz.

Skorlar (`scripts/scores.py`, testleri `tests/test_scores.py`): **Piotroski F-skoru** (0–9, son 12 ay ile bir yıl önceki
son 12 ay; bankalarda hesaplanmaz), **temettü güvenlik skoru** (0–100: dağıtma oranı 20, serbest nakit akışı karşılama 20,
net borç/FAVÖK 15, süreklilik 15, kesinti geçmişi 10, özkaynak kârlılığı 10, F-skoru 10; uygulanamayan bileşenler
dışarıda bırakılıp 100'e ölçeklenir) ve **verim bandı** (hissenin piyasaya göre veriminin — son 12 ay verimi / temettü ödeyenlerin medyan verimi —
kendi 4 yıllık geçmişindeki yüzdelik dilimi; piyasa genelindeki verim değişimi ayıklanır, mutlak dilim de verilir). Hisse sayfasındaki mali tablolar (8 çeyrek / 3 yıl) `data/fin/KOD.json` dosyalarından gelir.

DCF (`scripts/dcf.py`, hesaplayıcı `web/js/dcf.js`, testleri `tests/test_dcf.py`, `tests/dcf.test.mjs`): dolar bazında
indirgenmiş nakit akışı. Nakit akışları dönem sonu kuruyla dolara çevrilir; iskonto oranı ABD 10Y (her güncellemede) + ayarlı
beta × piyasa risk primi (%4,5) + ülke risk primi (%4). Net borç ve azınlık payları düşülür. Ana gösterge ters DCF
(fiyatın ima ettiği büyüme); hisse sayfasında varsayımlar değiştirilebilir. Banka, sigorta, finansal kuruluş, GYO, yatırım
ortaklığı ve holdinglere ve serbest nakit akışı negatif şirketlere uygulanmaz.

Sinyaller modüler: `scripts/signals.py` ortak motordur (likidite ve risk filtresi, işlem yürütme, rastgele giriş kıyası,
hesap simülasyonu, endeks gruplarına göre istatistik); her strateji `scripts/strategies/` altında ayrı bir modüldür ve
`strategies/__init__.py`'deki `REGISTRY`'ye eklenir. Stratejiler gruplar (`GROUPS`: mum formasyonları, trend takip, kırılım,
ortalamaya dönüş) altında sinyal sayfasında listelenir; "Tüm stratejiler" görünümünde açık sinyaller birlikte ve stratejiler
karşılaştırma tablosunda görünür, bir strateji seçilince yalnızca onun sinyalleri, kuralları ve ayrıntılı testi açılır.
Yeni strateji: modülü yazın (arayüz
`strategies/__init__.py` içinde), `REGISTRY`'ye ekleyin, testini `tests/test_signals.py`'ye yazın; arayüz kendiliğinden
gösterir. Testler `tests/test_signals.py`.

FVG Push (`scripts/strategies/fvgpb.py`, "Trend takip"): kapanış SMA200 üstünde ve SMA50 > SMA200; gövdesi
≥ 1 ATR yeşil itki mumunun bıraktığı yükseliş FVG'sine 2–30 mum sonra ilk geri çekilme (alt sınırın altında kapanış bölgeyi
geçersiz kılar), üstte doldurulmamış düşüş FVG'si yok; dokunuştan itibaren 4 mum içinde kapanış önceki mumun tepesini aşınca
giriş; stop alt sınır − 0,5 ATR; kanal çıkışı (varsayılan), takip eden stop ve sabit 3R karşılaştırma; %1 risk. Teyit bekleyen
bölgeler hazırlanan kurulumlarda. Donchian'la aynı trendlerde sık örtüşür (ikinci giriş noktası), ayrı izlenir.

Squeeze Break (`scripts/strategies/sqzbrk.py`, "Kırılım"): önceki 40 günün kutusu en fazla %20 genişlikte; son 10
kapanış ortalamada kutunun üst %60'ında ve kutu boyunca yön hacmi (OBV) artıda; kapanış kutu tepesinin 0,1 ATR üstünde
(ilk kırılım), günün üst %30'unda, gövde ≥ aralığın yarısı, hacim ≥ 1,5 kat → giriş; stop kutunun dibi (en fazla 3 ATR);
20. işlem günü kapanışında çıkış (varsayılan), takip eden stop ve kanal çıkışı karşılaştırma. Donchian'la sık örtüşür.

Structure Break (`scripts/strategies/msbrk.py`, "Dipten dönüş"): salınım tepeleri/dipleri (her iki yanında k mum boyunca
en yüksek/en düşük, k = 4…7; k mum sonra kesinleşir) ile önce düşüş yapısı (alçalan tepe ve dip), ardından daralma (daha alçak
tepe, daha yüksek dip); kapanış bu bölgenin tepesini 30 mum içinde ilk kez aşınca giriş (bölge dibi altında kapanış bölgeyi
bozar); herhangi bir ölçekte kırılım sinyaldir. Stop giriş − 2 ATR (bölge dibi, 3 ATR, bölge ortası ve kırılım mumu dibi de test edildi); kanal çıkışı (varsayılan), 20 gün
tut, takip eden stop, sabit 2R / 3R. Kırılım günü için hacim/kapanış şartı yok.

SMA200 Retest (`scripts/strategies/sma200rt.py`, "Trend takip"): SMA50 > SMA200, SMA200 yükseliyor, son 60 günde kapanış
SMA200'ün en az %15 üstüne çıkmış; son 4 günde en düşük SMA200'ün en fazla %3 üstüne inmiş; kapanış SMA200 ve önceki günün
tepesinin üstünde, günün üst %40'ında → giriş; stop son 4 günün dibi ile SMA200'ün küçüğü − 0,5 ATR; +1R sonrası takip stopu
(varsayılan), sabit 2R ve 3R karşılaştırma. Kanal çıkışı bu sinyalde rastgeleden iyi değildi.

VWAP Reclaim (`scripts/strategies/vwaprc.py`, "Dipten dönüş"): 1 yıllık tepeden bu yana fiyat en az %30 düşmüş, tepe en az
80 mum önce; kapanış tepeden çapalı VWAP'ın (tepe gününden bu yana tipik fiyat × hacim / hacim) ilk kez üstüne çıkınca giriş;
stop giriş − 2 ATR; kanal çıkışı (varsayılan), takip eden stop ve sabit 3R. Avantaj BIST 100 dışında; rastgele giriş kıyası
tepeden ≥ %30 düşmüş hisselerin günlerinden.

Temettü Rallisi (`scripts/strategies/divrun.py`, "Takvim / olay" grubu): brüt verimi ≥ %5 olan temettüde
hak kullanımdan önceki son günden 10 iş günü önce kapanışta giriş, son gün kapanışta çıkış, stop yok (pozisyon büyüklüğü için 1R = 3 ATR, en fazla fiyatın %15'i). Olay verisi: geçmiş
hak kullanımları (sitede doğrulanmış, bedelsize göre düzeltilmiş brüt temettü) + açıklanmış yaklaşan temettüler (net → brüt).
Motor her hissede `F["sym"]` verir; strateji takvimi modül düzeyinde (`EVENTS`) tutar. Girişe 1–5 gün kalanlar hazırlanan
kurulumlarda görünür. Elenen: trend içi geri çekilme (RSI2 / 3 gün düşüş) BIST'te rastgele girişten iyi değildi.

Göreli güç rotasyonu (`scripts/strategies/rsrot.py`, "Portföy" grubu, portföy stratejisi türü — motoru kullanmaz,
kendi aylık simülasyonunu yürütür): her ayın ilk işlem günü BIST 100 hisseleri (20 mn ₺ hacim) son 6 ay getirisi (son ay
hariç) / günlük oynaklık ile sıralanır, +%200 üstü yükselenler dışlanır, en güçlü 10 hisse eşit ağırlıkla tutulur; BIST 100
200 günlük ortalamanın altındaysa nakit. %22'yi aşan günlük hareketler veri hatası sayılır. Sayfada güncel portföy, bugün
sıralansa önizlemesi, son dengelemeler ve BIST 100 al-tut kıyası.

Strateji ilkesi: her strateji farklı bir piyasa davranışını yakalamalı ve çıkışı o davranışın süresine uymalı (ör. kanal
çıkışı Donchian'da avantajı 3 kat artırdı, morning star'da sıfırladı). Strateji haritası `scripts/strategies/__init__.py`
içinde tutulur: morning star = sert düşüş sonrası kısa dönüş (~9 gün, takip stopu); Donchian = trend içinde kırılım
(~3–4 hafta, kanal çıkışı).

Donchian Break (`scripts/strategies/donchian.py`, yalnızca günlük): kapanış önceki 20 günün en yükseğinin üstünde
(ilk kırılım günü), kapanış SMA200 üstünde ve SMA50 > SMA200, önceki 1 yılın tepesi girişin 0–2R üstünde değil, üstte
doldurulmamış düşüş FVG'si yok. Stop giriş − 2 ATR; varsayılan çıkış kanal çıkışı (kapanış önceki 10 günün en düşüğünün altına
inince), karşılaştırma için takip eden stop ve sabit 5R. Kanal çıkışı stratejinin kendi `simulate`'iyle yürür (`CUSTOM_EXITS`);
rastgele kıyas yalnızca yükseliş trendindeki günlerden (`baseline_ok`). Bu kancaları kullanmayan stratejiler (morning star)
motorun varsayılanıyla aynen çalışır.

Morning star (`scripts/strategies/morningstar.py`): 1. mum sert kırmızı
(gövde ≥ 0,5 ATR), 2. mum küçük (gövde ≤ 1. mumun %30'u), 3. mum yeşil ve 1. mumun tepesinin üstünde kapanıyor; 1. mumdan önceki 80 mumda
oluşmuş, doldurulmamış ve girişin üstünde kalan bir düşüş FVG'si varsa işlem yok; 20 mn ₺ hacim filtresi. Giriş 3. mumun kapanışında, başlangıç stopu üç mumun en düşüğünün %0,1 altında; fiyat +1R'ye ulaşınca stop en yüksek
fiyatın 1R altından takip eder, sabit hedef yok (sabit 3R/5R karşılaştırma için test edilir). Her
güncellemede son 4 yıl BIST 30/50/100/TÜM için yeniden test edilir: rastgele giriş kıyası, yıllara göre sonuç, hesap
simülasyonu (100.000 ₺ bakiye, işlem başına bakiyenin %1’i — strateji `ACCOUNT_RISK` ile değiştirir, Donchian %0,5; iki biçimde: nakitle sınırlı — pozisyon boştaki nakdi aşarsa sinyal kaçar — ve sınırsız — bütün sinyaller). "Hazırlanan formasyonlar" listesi ilk iki mumu oluşmuş
(sert kırmızı + doji) ve ertesi gün tamamlanabilecek hisseleri tetik fiyatı, tahmini stop ve FVG engeliyle gösterir (tetiğe
uzaklık en fazla %6). Kurallar BIST'te seçildi; ABD ve Almanya'da etki bulunmadı.

Aynı kurallar 4 saatlik mumlarda da çalışır (`scripts/intraday.py`, testleri `tests/test_intraday.py`): Yahoo'nun
saatlik verisi (son ~2 yıl) günde iki muma çevrilir (açılış–13:30 ve 13:30–kapanış), bölünmelere göre günlük
kapanışa ölçeklenir; yalnızca 20 mn ₺ hacim filtresini geçen hisseler indirilir. 4 saatlik işlemler en fazla 120 mum
(~60 gün) tutulur. Açık sinyaller, hazırlananlar ve son sonuçlar tek tabloda, *Periyot* sütununda 1G / 4S olarak
ayrılır; test sonuçları periyoda göre ayrı gösterilir. `--no-intraday` ile 4 saatlik kısım atlanır.

Temettü: temettuhisseleri.com tutarları **net** ve bedelsizlere göre **düzeltilmemiş**tir; Yahoo'nun bölünme
çarpanları ve o tarihteki stopajla (2022–2024 arası %10, öncesi ve sonrası %15, GYO/YO %0) brüt, düzeltilmiş
tutara çevrilir (`scripts/temettu.py`). İki kaynak uyuşuyorsa Yahoo tutarı kullanılır; fiyatın %1'inden büyük bir
fark varsa hak kullanım günündeki fiyat boşluğu (bilgi veriyorsa) ya da site esas alınır; yalnızca sitede olan
temettüler eklenir. Düzeltmeler iş akışı kaydında listelenir.

## Kurulum (bir kez)

1. GitHub'da depo → **Settings → Pages → Build and deployment → Source: "GitHub Actions"** seçin.
   (Özel/private depoda Pages için ücretli GitHub planı gerekir; ücretsiz planda depoyu public yapmak gerekir.)
2. **Actions** sekmesi → "Veriyi güncelle ve yayınla" → **Run workflow**. ~3–5 dk sonra site
   `https://<kullanıcı-adı>.github.io/<depo-adı>/` adresinde açılır.
3. Telefonda: siteyi açın → iPhone'da Paylaş → *Ana Ekrana Ekle*; Android'de menü → *Uygulamayı yükle*.

## Yerelde deneme

```bash
pip install -r scripts/requirements.txt
scripts/dev.sh          # ÖRNEK (rastgele) veriyle, internet gerekmez
scripts/dev.sh --real   # gerçek veriyle
# -> http://localhost:8000
node --test tests/*.test.mjs   # portföy hesap testleri (yayından önce GitHub'da da çalışır)
```

Kod yapısı: `scripts/` veri çekme (Python), `web/` arayüz — `web/js/` altında modüller
(`pfcore.js` portföy hesapları, `portfolio.js` portföy ekranı, `screener.js` tarama, `detail.js` hisse sayfası,
`sync.js` Gist senkronu …), `web/ind.js` göstergeler, `tests/` testler.

## Bilinen sınırlar

- Python kütüphanelerinin sürümleri `scripts/requirements.txt` içinde sabittir (yfinance, pandas, numpy); yükseltme
  bilerek ve yerelde denenerek yapılır.
- Yahoo ve İş Yatırım resmi API değildir; sayfa yapıları değişirse veri çekme bozulabilir. Hisselerin
  yarısından azının fiyatı alınırsa yayın yapılmaz, önceki sürüm yayında kalır. İş Yatırım'a ulaşılamazsa
  son önbellekteki mali tablolar kullanılır.
- Mali tablolar bilanço döneminde güncellenir: son çeyreği önbellekte olan şirket atlanır; eksik olana tek istekle (son 4 çeyrek)
  yeni bilanço gelip gelmediği kontrol edilir (çeyrek bitiminden sonraki ilk 30 gün haftada bir, sonra günde bir; hiç verisi
  olmayan şirkette haftada bir). Önbellekte olmayan şirket tam çekilir (12 çeyrek, 3 istek); geriye dönük düzeltmeler için 120
  günde bir tam yenileme. Çalışma başına en fazla 200 istek.
- Enflasyon muhasebesi (TMS 29) nedeniyle TTM toplamları farklı satın alma gücündeki dönemleri birleştirir;
  oranlar yaklaşık değerlerdir. Leasing/faktoring gibi bazı şirketler için mali tablo bulunmaz.
- Ichimoku bulutu bugünkü tarihe hizalı çizilir (26 günlük ileri kısım gösterilmez).
- Temettü kaynakları küçük şirketlerde birbirini tutmayabilir; fiyatın %1'inden küçük farklar düzeltilmez.
- Kişisel kullanım içindir, yatırım tavsiyesi değildir.
