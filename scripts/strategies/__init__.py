"""Sinyal stratejileri. Her strateji bu klasörde bir modüldür ve REGISTRY'ye eklenir; motor (signals.py) hepsini aynı
kurallarla (likidite, risk aralığı, çıkış varyantları, rastgele giriş kıyası, hesap simülasyonu) çalıştırır.

İlke: her strateji farklı bir piyasa davranışını yakalamalı ve çıkışı o davranışın süresine uymalı. Yeni strateji eklemeden
önce şunlar yazılır: ne yakalıyor (hangi davranış), ne kadar sürüyor, hangi piyasa ortamında çalışıyor, mevcut
stratejilerden farkı ne. Test, rastgele girişe göre fark (aynı stop ve çıkışla) ve mevcut stratejilerle örtüşmeye bakar.
Örnek ders: kanal çıkışı Donchian'da avantajı 3 kat artırdı ama morning star'da avantajı sıfırladı; kısa bir dönüşü yakalayan
sinyale uzun tutan çıkış vermek, onu sıradan bir piyasa bahsine çevirir.

Strateji haritası (ne yakalıyor · süre · ortam · çıkış):
  morningstar  sert düşüş sonrası kısa vadeli dönüş (aşırı satışın tükenmesi) · ~9 gün · her ortam · +1R sonrası takip stopu
  donchian     yükseliş trendinde devam eden kırılım (momentum) · ~3–4 hafta · yükseliş trendi · kanal çıkışı (10 günlük dip)
  fvgpb        trend içi geri çekilme: itkinin bıraktığı yükseliş FVG'sine ilk dönüşte teyitli giriş · ~3 hafta · yükseliş trendi ·
               kanal çıkışı (Donchian'la aynı trendlerde sık örtüşür; kırılım yerine geri çekilmede ikinci giriş)
  sqzbrk       dar kutuda (40 gün, ≤ %20) birikim sonrası güçlü kapanışla kırılım · 20 gün · her ortam · 20. gün kapanışı
               (Donchian'la sık örtüşür; örtüşmeyen sinyaller de rastgeleden iyiydi)
  msbrk        düşüş yapısından (LL + LH) sonra daralan bölgenin (LH + HL) yukarı kırılımı, salınım ölçekleri k = 4…7 ·
               ~3–4 hafta · düşüş sonrası · kanal çıkışı (dipten dönüş; Squeeze Break ile örtüşmesi çok az)
  risebaby     SMA200 üstünde 10 günde +%25 yükselen hisseye momentumla binmek (sessiz başlayıp hızlanan ralliler) · ~3–4 hafta ·
               yükseliş trendi · kanal çıkışı; tavanda kapanan sinyal günü beklenir, 3 gün tavan → iptal
  sma200rt     trendde 200 günlük ortalamaya derin geri çekilme ve dönüş · ~2 hafta · yükseliş trendi · +1R sonrası takip stopu
  vwaprc       sert düşüş (tepeden ≥%30) sonrası tepeden çapalı VWAP'ın ilk geri alınışı (toparlanma teyidi) · ~4 hafta ·
               düşüş sonrası · kanal çıkışı (avantaj BIST 100 dışında)
  divrun       yüksek verimli temettü öncesi koşu (olay / takvim) · 10 gün · temettü sezonu · tarihte çıkış (hak kullanım öncesi)
  rsrot        BIST 100'de oynaklığa göre ayarlı göreli güç, en güçlü 10 hisse (portföy) · aylık yenileme · BIST 100 200 günlük ortalama üstü · ay sonu
  Araştırılanlar (henüz strateji değil):
  - trend içi geri çekilme, ilk deneme (RSI2 / 3 gün düşüş, fiyat SMA200 üstü): rastgele girişten iyi değildi; FVG bölgesi +
    teyitli dönüş kurgusuyla (fvgpb) yeniden kuruldu
  - göreli güç rotasyonu BIST TÜM'de: balon hisseleri seçip 2026 çöküşünde ağır kaybetti (yalnızca BIST 100 sürümü eklendi)
  - kaçırılan ralliler (son 4 yılda 20 günde ≥%25 yükselen 5.190 hareketin %78'i hiçbir stratejide yok): çoğu SMA200 altında,
    düşüş trendinden dönüşte başlıyor. Dipten dönüş için taban kırılımı, çift dip, kapitülasyon dönüşü, SMA50'yi geri alma
    rastgele girişten iyi değildi; tepeden çapalı VWAP'ı geri alma (vwaprc) sağlam çıktı
  - trend içi derin geri çekilme: 50 günlük tepeden %15 düşüş sonrası dönüş, hacmi kuruyan geri çekilme, dipten çapalı VWAP
    desteği rastgeleye yakın ya da kötü; SMA200 testi (sma200rt) sağlam çıktı
  - oynaklık sıkışması: Bollinger daralması + kırılım rastgeleyle aynı; kutu içinde birikim şartları (kapanışlar kutunun
    üst %60'ında, yön hacmi artıda) avantaj sağladı → sqzbrk. 72 ayarlık taramada 30 günlük ve %25 genişlikteki kutular zayıf;
    hacim kuruması şartı her ayarda kötüleştirdi; ertesi gün / hafta kapanışı teyidi girişi geciktirip iyileştirmedi
  - piyasa yapısıyla sıkışma (HH-HL sonrası LH-HL): yükselişteki daralmanın kırılımı rastgeleden iyi değildi (Donchian'la
    örtüşüyor); düşüşteki daralmanın kırılımı tek ölçekte (k = 5) iyi ama ayara hassastı → 4–7 ölçek birleşimi (msbrk)
  - kaçan rallilerin başlangıcı: yalnızca %16'sı ateşleme günüyle (≥ %5 + ≥ 2 kat hacim) başlıyor; çoğu sessiz başlıyor ve
    hızlanıyor → hareket kendini gösterdikten sonra binmek (risebaby). "Sessiz toparlanma" (düzgün, oynaklığı düşük yükseliş)
    rastgeleden iyiydi ama kaçan rallileri yakalamadı (%1–3); bekletiliyor
  - haftalık boşluk (dolmayan): 2022–24 güçlü, 2025–26 çalışmadı; aylık boşluk güçlü ama çok seyrek (izlemede)
  - piyasa geneli dip (SMA50 üstündeki hisse oranı): 4 yılda 3–17 sinyal, rastgeleden belirgin iyi değil; strateji değil,
    piyasa durumu göstergesi olarak kullanılabilir

Yeni strateji eklemek:
  1. Bu klasöre `yeni.py` yazın (aşağıdaki arayüz; örnek: morningstar.py).
  2. Aşağıdaki REGISTRY'ye ekleyin. Sıra, sinyal sayfasındaki sıradır. (PASSIVE: kod kalır, sinyal üretilmez.)
  3. tests/test_signals.py'ye formasyon testleri ekleyin.

Arayüz (modül düzeyinde):
  ID          kısa kimlik, ör. "morningstar" (veri ve adreslerde kullanılır; sonradan değiştirmeyin)
  META        {"name", "short" (tek satır), "group" (GROUPS anahtarı), "status" ("live"),
               "summary", "rules": [...], "notes": [...], isteğe bağlı "candNote" (hazırlanan kurulumların açıklaması)}
  TIMEFRAMES  desteklenen periyotlar, ör. ("1D", "4H")
  VARIANTS    {anahtar: açıklama}; anahtar "trail" (takip eden stop) ya da hedef R'si ("3", "5" …)
  DEFAULT_V   varsayılan çıkış varyantı
  TRAIL       (takibin başladığı R, takip mesafesi R), ör. (1.0, 1.0)
  WARMUP      sinyal aramaya başlamadan önce gereken mum sayısı
  signal(F, t)        t mumunun kapanışında giriş varsa {"entry", "stop"} (+ isteğe bağlı "info": {...}); yoksa None.
                      Yalnızca t'ye kadarki veriyi kullanmalı. Likidite ve risk aralığı motor tarafından kontrol edilir.
  baseline_stop(F, t) rastgele giriş kıyasında kullanılacak stop (stratejinin stop yapısıyla aynı mantık)
  candidate(F, b)     isteğe bağlı: b kapanışında "hazırlanan" kurulum varsa {"trig", "eff", "dist", "stop", "risk", ...}
  CAND_MAX_DIST       candidate varsa: tetiğe en fazla uzaklık
  İsteğe bağlı kancalar (kullanmayan stratejiler motorun varsayılanıyla çalışır):
  CUSTOM_EXITS        stratejinin kendi yürüttüğü çıkış varyantları, ör. ("chan",)
  simulate(F, t, entry, stop, mode, hold)  bu varyantlar için işlem yürütme; signals.simulate ile aynı biçimde sonuç döner
                      (açık işlemde "stop_now", "armed" ve isteğe bağlı "exit_level": kapanışla çıkış seviyesi)
  ACCOUNT_RISK        hesap simülasyonunda işlem başına risk (bakiyenin oranı); yoksa signals.ACCOUNT["risk"]
  F["sym"]            motorun verdiği hisse kodu: fiyat dışı veri (ör. temettü takvimi) modül düzeyinde tutulup bununla okunur
  candidate(...)["info"] / signal(...)["info"]  kayıtlara aynen eklenen ek bilgi (sayfada gösterilir)
  REENTRY             stop sonrası yeniden giriş penceresi (gün; 0/yok = kapalı): başlangıç stopu tetiklendikten sonra bu süre içinde
                      kapanış ilk girişin üstüne dönerse bir kez daha girilir (stop: çıkıştan bu yana en düşük − 0,2 ATR, en fazla
                      3 ATR); kayıtta info.re = 1
  baseline_ok(F, t)   rastgele giriş kıyasında hangi mumların kullanılacağı (ör. yalnızca yükseliş trendindekiler)
"""
from . import divrun, donchian, fvgpb, morningstar, msbrk, risebaby, rsrot, sma200rt, sqzbrk, vwaprc

# Gruplar: sinyal sayfasında stratejiler bu başlıklar altında toplanır (tarama sayfasındaki hazır taramalar gibi)
GROUPS = {"formasyon": "Mum formasyonları", "trend": "Trend takip", "kirilim": "Kırılım", "donus": "Ortalamaya dönüş", "dip": "Dipten dönüş", "olay": "Takvim / olay", "portfoy": "Portföy"}

REGISTRY = {m.ID: m for m in (morningstar, donchian, sqzbrk, fvgpb, msbrk, divrun)}
# Pasif stratejiler: kodları ve testleri yerinde, sinyal üretmez ve uygulamada görünmez; araştırmada ve sonraki testlerde
# kullanılabilir (ör. signals.run(prices, tiers, PASSIVE["vwaprc"])). Yeniden açmak için REGISTRY'ye taşıyın.
#   sma200rt  SMA200 Retest  2026'da zarar (−0,08R/işlem, nakitle sınırlı hesap 100 bin → 74 bin); büyük kazanç kuyruğu yok,
#             denenen piyasa filtreleri 2022–25'i bozuyordu
#   risebaby  Rise Baby      sonuç birkaç büyük işleme bağlı: 2026'da en iyi ve en kötü %5 hariç ortalama −0,34R
#   vwaprc    VWAP Reclaim   4 yıllık kârın çoğu 11 işlemden; 2026'da en iyi 3 işlem hariç −6,6R
PASSIVE = {m.ID: m for m in (sma200rt, risebaby, vwaprc)}
ALL = {**REGISTRY, **PASSIVE}
# Portföy stratejileri: giriş/stop yerine dönemsel olarak yenilenen bir portföy tutar; motoru kullanmaz, kendi run(prices,
# tiers, idx) fonksiyonuyla aylık simülasyon yürütür (ör. göreli güç rotasyonu).
PORTFOLIOS = {m.ID: m for m in (rsrot,)}
