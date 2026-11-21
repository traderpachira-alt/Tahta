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
| Bilanço, gelir tablosu, nakit akışı (TL) | İş Yatırım mali tablolar | şirket başına 3 günde bir |

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
`status: "test"` olan stratejiler "deneme" etiketiyle gösterilir. Yeni strateji: modülü yazın (arayüz
`strategies/__init__.py` içinde), `REGISTRY`'ye ekleyin, testini `tests/test_signals.py`'ye yazın; arayüz kendiliğinden
gösterir. Testler `tests/test_signals.py`.

Donchian kırılımı (`scripts/strategies/donchian.py`, deneme, yalnızca günlük): kapanış önceki 20 günün en yükseğinin üstünde
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
simülasyonu (işlem başına %0,5 risk, en fazla 20 pozisyon). "Hazırlanan formasyonlar" listesi ilk iki mumu oluşmuş
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

- Yahoo ve İş Yatırım resmi API değildir; sayfa yapıları değişirse veri çekme bozulabilir. Hisselerin
  yarısından azının fiyatı alınırsa yayın yapılmaz, önceki sürüm yayında kalır. İş Yatırım'a ulaşılamazsa
  son önbellekteki mali tablolar kullanılır.
- Mali tablolar sunucuyu yormamak için çalışma başına en fazla 150 şirket için çekilir; ilk kurulumda
  tümünün dolması birkaç çalışma (birkaç saat) sürer.
- Enflasyon muhasebesi (TMS 29) nedeniyle TTM toplamları farklı satın alma gücündeki dönemleri birleştirir;
  oranlar yaklaşık değerlerdir. Leasing/faktoring gibi bazı şirketler için mali tablo bulunmaz.
- Ichimoku bulutu bugünkü tarihe hizalı çizilir (26 günlük ileri kısım gösterilmez).
- Temettü kaynakları küçük şirketlerde birbirini tutmayabilir; fiyatın %1'inden küçük farklar düzeltilmez.
- Kişisel kullanım içindir, yatırım tavsiyesi değildir.
