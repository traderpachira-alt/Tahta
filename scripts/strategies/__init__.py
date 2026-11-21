"""Sinyal stratejileri. Her strateji bu klasörde bir modüldür ve REGISTRY'ye eklenir; motor (signals.py) hepsini aynı
kurallarla (likidite, risk aralığı, çıkış varyantları, rastgele giriş kıyası, hesap simülasyonu) çalıştırır.

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
  baseline_ok(F, t)   rastgele giriş kıyasında hangi mumların kullanılacağı (ör. yalnızca yükseliş trendindekiler)
"""
from . import donchian, morningstar

# Gruplar: sinyal sayfasında stratejiler bu başlıklar altında toplanır (tarama sayfasındaki hazır taramalar gibi)
GROUPS = {"formasyon": "Mum formasyonları", "trend": "Trend takip", "kirilim": "Kırılım", "donus": "Ortalamaya dönüş"}

REGISTRY = {m.ID: m for m in (morningstar, donchian)}
