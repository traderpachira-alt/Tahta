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
  divrun       yüksek verimli temettü öncesi koşu (olay / takvim) · 10 gün · temettü sezonu · tarihte çıkış (hak kullanım öncesi)
  rsrot        BIST 100'de oynaklığa göre ayarlı göreli güç, en güçlü 10 hisse (portföy) · aylık yenileme · BIST 100 200 günlük ortalama üstü · ay sonu
  Araştırılanlar (henüz strateji değil):
  - trend içi geri çekilme (RSI2 / 3 gün düşüş, fiyat SMA200 üstü): ilk parametrelerle rastgele girişten iyi değil; haritadaki
    boşluğu doldurduğu için parametreleri (ör. teyitli dönüş, farklı çıkış) yeniden çalışılacak
  - göreli güç rotasyonu BIST TÜM'de: balon hisseleri seçip 2026 çöküşünde ağır kaybetti (yalnızca BIST 100 sürümü eklendi)
  - piyasa geneli dip (SMA50 üstündeki hisse oranı): 4 yılda 3–17 sinyal, rastgeleden belirgin iyi değil; strateji değil,
    piyasa durumu göstergesi olarak kullanılabilir

Yeni strateji eklemek:
  1. Bu klasöre `yeni.py` yazın (aşağıdaki arayüz; örnek: morningstar.py).
  2. Aşağıdaki REGISTRY'ye ekleyin. Sıra, sinyal sayfasındaki sıradır.
  3. tests/test_signals.py'ye formasyon testleri ekleyin.

Arayüz (modül düzeyinde):
  ID          kısa kimlik, ör. "morningstar" (veri ve adreslerde kullanılır; sonradan değiştirmeyin)
  META        {"name", "short" (tek satır), "group" (GROUPS anahtarı), "status" ("live" | "test": sayfada "deneme" etiketi),
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
  baseline_ok(F, t)   rastgele giriş kıyasında hangi mumların kullanılacağı (ör. yalnızca yükseliş trendindekiler)
"""
from . import divrun, donchian, morningstar, rsrot

# Gruplar: sinyal sayfasında stratejiler bu başlıklar altında toplanır (tarama sayfasındaki hazır taramalar gibi)
GROUPS = {"formasyon": "Mum formasyonları", "trend": "Trend takip", "kirilim": "Kırılım", "donus": "Ortalamaya dönüş", "olay": "Takvim / olay", "portfoy": "Portföy"}

REGISTRY = {m.ID: m for m in (morningstar, donchian, divrun)}
# Portföy stratejileri: giriş/stop yerine dönemsel olarak yenilenen bir portföy tutar; motoru kullanmaz, kendi run(prices,
# tiers, idx) fonksiyonuyla aylık simülasyon yürütür (ör. göreli güç rotasyonu).
PORTFOLIOS = {m.ID: m for m in (rsrot,)}
