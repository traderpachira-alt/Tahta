"""FVG geri çekilmesi: yükseliş trendinde, güçlü bir itkinin bıraktığı yükseliş FVG'sine (fiyat boşluğu) ilk geri çekilmede
teyitli dönüşle giriş.

Kurallar (yalnızca o güne kadarki veri):
  Trend: kapanış SMA200 üstünde ve SMA50 > SMA200 (dokunuş günü)
  İtki ve boşluk: ortadaki mum güçlü yeşil (gövde ≥ 1 ATR); 3. mumun en düşüğü 1. mumun en yükseğinin üstünde →
       boşluk [1. mumun en yükseği, 3. mumun en düşüğü]
  Geri çekilme: boşluk oluştuktan 2–30 mum sonra fiyatın boşluğa İLK inişi (en düşük ≤ üst sınır); boşluğun altında kapanış
       olursa bölge geçersiz
  Yol açık: dokunuş günü girişin üstünde doldurulmamış düşüş FVG'si yok (morning star'daki tanım)
  Teyit ve giriş: dokunuştan itibaren 4 mum içinde (dokunuş günü dahil) kapanış önceki mumun en yükseğini aşar ve bölge
       bozulmaz (kapanış alt sınırın üstünde, en düşük alt sınırın %3'ünden fazla altına inmez) → o kapanışta giriş
  Stop: boşluğun alt sınırı − 0,5 ATR
Varsayılan çıkış kanal çıkışı (kapanış önceki 10 günün en düşüğünün altına inince; Donchian ile aynı kural), karşılaştırma
için takip eden stop ve sabit 3R. Donchian'dan ayrı bir stratejidir: aynı trendde ikinci bir giriş noktası sağlar ve ayrı izlenir.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import donchian as _dc
from . import morningstar as _ms

ID = "fvgpb"
TIMEFRAMES = ("1D",)
VARIANTS = {"chan": "Kanal çıkışı (10 günlük dip)", "trail": "Takip eden stop (+1R sonrası 1R)", "3": "Sabit hedef 3R"}
DEFAULT_V = "chan"
CUSTOM_EXITS = ("chan",)
TRAIL = (1.0, 1.0)
WARMUP = 210
ACCOUNT_RISK = 0.01
IMPULSE_ATR = 1.0        # itki mumu gövdesi ≥ 1 ATR
MIN_AGE, MAX_AGE = 2, 30 # dokunuş, boşluk oluştuktan 2–30 mum sonra
CONFIRM_BARS = 4         # teyit dokunuş günü dahil 4 mum içinde
BREAK_TOL = 0.97         # teyit beklerken en düşük alt sınırın %3'ünden fazla altına inmemeli
STOP_ATR = 0.5           # stop: alt sınır − 0,5 ATR
BASE_STOP_ATR = 2.5      # rastgele kıyasta stop mesafesi (ortalama FVG stopuna yakın)
CAND_MAX_DIST = 0.06

META = {
    "name": "FVG geri çekilmesi",
    "short": "Trendde güçlü itkinin bıraktığı boşluğa ilk geri çekilmede teyitli dönüş",
    "group": "trend",
    "status": "test",
    "candNote": "Fiyat yükseliş FVG'sine ilk kez inmiş, teyit bekleniyor: önümüzdeki mumlarda kapanış önceki mumun en yükseğini (tetik) aşarsa ve bölge bozulmazsa sinyal oluşur. Teyit penceresi dokunuş günü dahil 4 mum.",
    "summary": "Yükseliş trendinde güçlü bir itkinin bıraktığı fiyat boşluğuna (FVG) geri çekilen hisse, boşlukta tutunup yukarı dönünce alınır",
    "rules": [
        "Trend: kapanış SMA200'ün üstünde ve SMA50 > SMA200",
        "İtki ve boşluk: gövdesi en az 1 ATR olan güçlü yeşil mum yukarıda fiyat boşluğu (yükseliş FVG'si) bırakır",
        "Geri çekilme: boşluk oluştuktan 2–30 mum sonra fiyat boşluğa ilk kez iner; boşluğun altında kapanış bölgeyi geçersiz kılar",
        "Yol açık: girişin üstünde doldurulmamış düşüş FVG'si yok",
        "Teyit: dokunuştan itibaren 4 mum içinde kapanış önceki mumun en yükseğini aşar (bölge bozulmadan) → o kapanışta giriş",
        "Stop: boşluğun alt sınırının 0,5 ATR altı (1R = giriş − stop) · Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺",
        "Çıkış: kapanış önceki 10 günün en düşüğünün altına inince o kapanıştan; başlangıç stopu her zaman geçerli · En fazla 60 işlem günü",
    ],
    "notes": [
        "Deneme aşamasında. Kurallar son 4 yılın günlük verisinde birkaç giriş/stop/çıkış varyasyonu arasından seçildi; canlı sonuçları yıllık tablodan izleyin.",
        "En güçlü etki BIST 100'de; BIST TÜM'de rastgele girişe göre fark daha küçük. Endeks gruplarını tabloda karşılaştırın.",
        "Teyit şart: boşluğa dokunur dokunmaz almak (teyitsiz) belirgin şekilde zayıftı.",
        "Donchian ile sık örtüşür: sinyallerin yaklaşık yarısında aynı hissede açık bir Donchian işlemi vardır, aylık sonuçlar yüksek korelasyonludur. Aynı trende kırılımda değil geri çekilmede ikinci bir giriştir; ayrı izlenir.",
        "Takip eden stop başarı oranını %55–57'ye çıkarır ama işlem başına avantajı yaklaşık yarıya indirir. Karşılaştırma tabloda.",
        "2026'da diğer trend stratejileri gibi zayıfladı (piyasa genelindeki düşüş).",
    ],
}


def _prep(F) -> dict:
    """Hisse başına bir kez, yalnızca geçmiş veriyle: teyit günleri {t: (alt, üst)} ve son mumda teyit bekleyen bölge."""
    P = F.get("_fvgpb")
    if P is not None:
        return P
    o, h, lo, c, atr, turn = F["o"], F["h"], F["l"], F["c"], F["atr"], F["turn"]
    n = len(c)
    cs = pd.Series(c)
    s50, s200 = cs.rolling(50).mean().to_numpy(), cs.rolling(200).mean().to_numpy()
    zones, pending, sig = [], [], {}
    for t in range(3, n):
        if lo[t] > h[t - 2] and c[t - 1] > o[t - 1] and np.isfinite(atr[t - 1]) and c[t - 1] - o[t - 1] >= IMPULSE_ATR * atr[t - 1]:
            zones.append({"i": t, "bot": h[t - 2], "top": lo[t], "touched": False})
        zones = [z for z in zones if t - z["i"] <= MAX_AGE and c[t] >= z["bot"]]
        # Teyit bekleyenler: süre dolan ya da bozulanlar düşer; koşul sağlanırsa bu mum sinyal
        keep = []
        for p in pending:
            if t - p["k"] >= CONFIRM_BARS or lo[t] < p["bot"] * BREAK_TOL or c[t] < p["bot"]:
                continue
            if c[t] > h[t - 1] and t not in sig:
                sig[t] = (p["bot"], p["top"])
                continue
            keep.append(p)
        pending = keep
        if not (turn[t] >= 20e6 and np.isfinite(atr[t]) and t >= WARMUP):
            continue
        up = c[t] > s200[t] and s50[t] > s200[t]
        for z in sorted(zones, key=lambda z: -z["i"]):
            if z["touched"] or t < z["i"] + MIN_AGE or lo[t] > z["top"]:
                continue
            z["touched"] = True
            if not up or any(g[0] > z["top"] for g in _ms.unfilled_bearish_fvgs(F, t)):
                continue
            p = {"k": t, "bot": z["bot"], "top": z["top"]}
            # dokunuş günü teyit (kapanış önceki mumun tepesini aşıyor) ise hemen sinyal
            if c[t] > h[t - 1] and c[t] >= z["bot"] and lo[t] >= z["bot"] * BREAK_TOL and t not in sig:
                sig[t] = (z["bot"], z["top"])
            else:
                pending.append(p)
    P = F["_fvgpb"] = {"sig": sig, "pending": pending, "s50": s50, "s200": s200}
    return P


def signal(F, t) -> dict | None:
    if t < WARMUP:
        return None
    z = _prep(F)["sig"].get(t)
    if not z or not np.isfinite(F["atr"][t]):
        return None
    entry = F["c"][t]
    return {"entry": entry, "stop": z[0] - STOP_ATR * F["atr"][t], "info": {"fvg": [round(z[0], 4), round(z[1], 4)]}}


def baseline_stop(F, t) -> float:
    return F["c"][t] - BASE_STOP_ATR * F["atr"][t]


def baseline_ok(F, t) -> bool:
    P = _prep(F)
    return t >= WARMUP and bool(F["c"][t] > P["s200"][t] and P["s50"][t] > P["s200"][t])


def simulate(F, t, entry, stop, mode, hold) -> dict:
    return _dc.simulate(F, t, entry, stop, mode, hold)


def candidate(F, b) -> dict | None:
    """Son mumda teyit bekleyen bölge: bir sonraki kapanış bugünkü en yüksek fiyatı aşarsa sinyal."""
    if b < WARMUP or not np.isfinite(F["atr"][b]):
        return None
    P = _prep(F)
    live = [p for p in P["pending"] if b - p["k"] < CONFIRM_BARS - 1]
    if not live or b in P["sig"]:
        return None
    p = max(live, key=lambda p: p["k"])
    trig = float(F["h"][b])
    dist = trig / F["c"][b] - 1
    stop = p["bot"] - STOP_ATR * F["atr"][b]
    if dist > CAND_MAX_DIST or stop >= trig:
        return None
    return {"trig": trig, "eff": trig, "dist": dist, "stop": stop, "risk": (trig - stop) / trig, "fvg": None,
            "d1": p["k"], "d2": b, "info": {"zone": [round(p["bot"], 4), round(p["top"], 4)]}}
