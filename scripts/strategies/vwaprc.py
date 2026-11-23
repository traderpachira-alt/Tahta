"""VWAP Reclaim (tepeden çapalı VWAP'ı geri alma): sert düşüşten sonra fiyatın, 1 yıllık tepeden bu yana işlem görmüş
hacmin ortalama maliyetini (tepeden çapalı VWAP) ilk kez geri alması.

Kurallar (yalnızca o güne kadarki veri):
  Çapa: son 250 mumun en yüksek fiyatlı günü (1 yıllık tepe); VWAP tepe gününden bu yana tipik fiyat × hacim / hacim
  Düşüş: tepeden bu yana en düşük fiyat tepenin en az %30 altına inmiş
  Yaş: tepe en az 80 mum önce (taze bir tepeden hemen sonraki tepki sayılmaz)
  Geri alma: kapanış VWAP'ın üstünde, bir önceki kapanış altında; tepeden 5 mum sonrasından bu yana VWAP üstünde hiç kapanış yok
       (ilk geri alma) ve çapa değişmemiş
  Stop: giriş − 2 ATR
Varsayılan çıkış kanal çıkışı (kapanış önceki 10 günün en düşüğünün altına inince; Donchian ile aynı kural), karşılaştırma için
takip eden stop ve sabit 3R. Neden: tepeden bu yana alanlar ortalamada başa baş noktasına gelir; satış baskısı azalır ve
toparlanma teyit edilir.
"""
from __future__ import annotations

import numpy as np

from . import donchian as _dc

ID = "vwaprc"
TIMEFRAMES = ("1D",)
VARIANTS = {"chan": "Kanal çıkışı (10 günlük dip)", "trail": "Takip eden stop (+1R sonrası 1R)", "3": "Sabit hedef 3R"}
DEFAULT_V = "chan"
CUSTOM_EXITS = ("chan",)
TRAIL = (1.0, 1.0)
WARMUP = 251
LOOK = 250          # çapa: son 250 mumun tepesi
DROP = 0.30         # tepeden en az %30 düşüş
MIN_AGE = 80        # tepe en az 80 mum önce
ATR_STOP = 2.0
CAND_MAX_DIST = 0.04

META = {
    "name": "VWAP Reclaim",
    "short": "Sert düşüş sonrası tepeden çapalı VWAP'ın ilk geri alınışı",
    "group": "dip",
    "status": "live",
    "summary": "1 yıllık tepesinden en az %30 düşen hisse, tepeden bu yana alanların ortalama maliyetini (tepeden çapalı VWAP) ilk kez geri alınca girilir",
    "candNote": "Düşüş ve yaş şartları sağlanmış, fiyat tepe-VWAP'ının en fazla %4 altında: kapanış VWAP'ın (tetik) üstüne çıkarsa sinyal oluşur. Tetik VWAP'ın bugünkü değeridir; yarın hacimle biraz değişebilir.",
    "rules": [
        "Çapa: son 1 yılın (250 mum) en yüksek fiyatlı günü; VWAP o günden bu yana tipik fiyat × hacim / toplam hacim",
        "Düşüş: tepeden bu yana fiyat tepenin en az %30 altına inmiş · tepe en az 80 mum önce",
        "Geri alma: kapanış tepe-VWAP'ının üstünde, bir önceki kapanış altında; tepeden bu yana VWAP üstünde ilk kapanış",
        "Stop: giriş − 2 ATR (1R = giriş − stop) · Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺",
        "Çıkış: kapanış önceki 10 günün en düşüğünün altına inince o kapanıştan; başlangıç stopu her zaman geçerli · En fazla 60 işlem günü",
    ],
    "notes": [
        "Kurallar son 4 yılın günlük verisinde birçok dipten dönüş kurgusu arasından seçildi (taban kırılımı, çift dip, kapitülasyon, SMA50'yi geri alma rastgele girişten iyi değildi); canlı sonuçları yıllık tablodan izleyin.",
        "Avantaj BIST 100 dışındaki hisselerden geliyor; BIST 100'de sonuç rastgele girişe yakın. Endeks gruplarını tabloda karşılaştırın.",
        "Sinyallerin çoğu geldiğinde fiyat SMA200'ün üstüne çıkmış olur: dibi değil, toparlanmanın teyidini yakalar.",
        "Seyrek bir sinyaldir; mevcut stratejilerle örtüşmesi düşüktür (yaklaşık %10).",
        "Rastgele giriş kıyası, 1 yıllık tepesinin en az %30 altına inmiş hisselerin günlerinden seçilir.",
    ],
}


def _prep(F) -> dict:
    """Tepeden çapalı VWAP (av), çapa (anc) ve tepeden bu yana en düşük (lo) — hisse başına bir kez."""
    P = F.get("_vwaprc")
    if P is not None:
        return P
    c, h, l, v = F["c"], F["h"], F["l"], F["v"]
    tp = (h + l + c) / 3
    cpv, cv = np.cumsum(tp * v), np.cumsum(v)
    n = len(c)
    av, anc, lo = np.full(n, np.nan), np.full(n, -1), np.full(n, np.nan)
    for t in range(LOOK, n):
        a = t - LOOK + int(np.argmax(h[t - LOOK:t + 1]))
        anc[t] = a
        den = cv[t] - (cv[a - 1] if a > 0 else 0.0)
        if den > 0:
            av[t] = (cpv[t] - (cpv[a - 1] if a > 0 else 0.0)) / den
        lo[t] = np.min(l[a:t + 1])
    P = F["_vwaprc"] = {"av": av, "anc": anc, "lo": lo}
    return P


def _setup(F, P, t) -> bool:
    """t itibarıyla düşüş, yaş ve 'henüz geri alınmadı' şartları (t kapanışı hariç)."""
    a = P["anc"][t]
    if a < 0 or t - a < MIN_AGE or not np.isfinite(P["av"][t]):
        return False
    if not P["lo"][t] <= F["h"][a] * (1 - DROP):
        return False
    c, av = F["c"], P["av"]
    return not np.any(c[a + 5:t] > av[a + 5:t])


def signal(F, t) -> dict | None:
    if t < WARMUP or not np.isfinite(F["atr"][t]):
        return None
    P, c = _prep(F), F["c"]
    if P["anc"][t - 1] != P["anc"][t] or not (c[t] > P["av"][t] and c[t - 1] <= P["av"][t - 1]):
        return None
    if not _setup(F, P, t):
        return None
    a = int(P["anc"][t])
    return {"entry": c[t], "stop": c[t] - ATR_STOP * F["atr"][t],
            "info": {"avwap": round(float(P["av"][t]), 4), "peak": round(float(F["h"][a]), 4)}}


def baseline_stop(F, t) -> float:
    return F["c"][t] - ATR_STOP * F["atr"][t]


def baseline_ok(F, t) -> bool:
    """Rastgele kıyas: 1 yıllık tepesinin en az %30 altına inmiş hisselerin günleri."""
    if t < WARMUP:
        return False
    P = _prep(F)
    a = P["anc"][t]
    return bool(a >= 0 and P["lo"][t] <= F["h"][a] * (1 - DROP))


def simulate(F, t, entry, stop, mode, hold) -> dict:
    return _dc.simulate(F, t, entry, stop, mode, hold)


def candidate(F, b) -> dict | None:
    """b kapanışında şartlar hazır, fiyat VWAP'ın en fazla %4 altında: bir sonraki kapanış VWAP'ı aşarsa sinyal."""
    if b < WARMUP or not np.isfinite(F["atr"][b]):
        return None
    P, c = _prep(F), F["c"]
    if not (c[b] <= P["av"][b]) or not _setup_now(F, P, b):
        return None
    trig = float(P["av"][b])
    dist = trig / c[b] - 1
    if dist > CAND_MAX_DIST:
        return None
    stop = trig - ATR_STOP * F["atr"][b]
    a = int(P["anc"][b])
    return {"trig": trig, "eff": trig, "dist": dist, "stop": stop, "risk": (trig - stop) / trig, "fvg": None,
            "d1": max(a, b - 20), "d2": b, "info": {"avwap": round(trig, 4), "peak": round(float(F["h"][a]), 4)}}


def _setup_now(F, P, b) -> bool:
    """Son mum için: b+1 henüz yok; şartlar b'ye kadarki kapanışlarla (b dahil, hepsi VWAP altında) sağlanıyor mu."""
    a = P["anc"][b]
    if a < 0 or b + 1 - a < MIN_AGE or not np.isfinite(P["av"][b]):
        return False
    if not P["lo"][b] <= F["h"][a] * (1 - DROP):
        return False
    return not np.any(F["c"][a + 5:b + 1] > P["av"][a + 5:b + 1])
