"""Morning star (sabah yıldızı) alım kurulumu.

Kurallar (yalnızca o güne kadarki veri; canlı sinyal ve test aynı kodu kullanır):
  1. mum: kırmızı ve sert (gövde ≥ 0,5 × ATR 14)
  2. mum: küçük gövde / doji (gövde ≤ 1. mum gövdesinin %30'u)                       — Ş2
  3. mum: yeşil ve 1. mumun EN YÜKSEĞİNİN üstünde kapanış                             — Ş5
  FVG: 1. mumdan önceki 80 mumda oluşmuş, 1. mum anında doldurulmamış ve girişin ÜSTÜNDE kalan bir düşüş FVG'si
       (fiyat boşluğu: 3. mumun en yükseği < 1. mumun en düşüğü) varsa işlem yok — boşluk hedefe giden yolda direnç olur.
İşlem: giriş 3. mumun kapanışında; başlangıç stopu = üç mumun en düşüğü × (1 − %0,1). Varsayılan çıkış takip eden stop
(+1R'den sonra en yüksek fiyatın 1R altı); karşılaştırma için sabit 3R ve 5R.
"""
from __future__ import annotations

import numpy as np

ID = "morningstar"
TIMEFRAMES = ("1D", "4H")
VARIANTS = {"trail": "Takip eden stop (+1R sonrası 1R)", "3": "Sabit hedef 3R", "5": "Sabit hedef 5R"}
DEFAULT_V = "trail"
TRAIL = (1.0, 1.0)
WARMUP = 22
ACCOUNT_RISK = 0.01                   # hesap simülasyonu: işlem başına bakiyenin %1'i (sinyal seyrek, nakit nadiren dolar)
BODY_ATR = 0.5                        # 1. mum gövdesi ≥ 0,5 ATR
DOJI_MAX = 0.30                       # 2. mum gövdesi ≤ 1. mum gövdesinin %30'u
STOP_BUF = 0.001                      # stop, üç mumun en düşüğünün %0,1 altı
FVG_LOOK = 80                         # üstteki düşüş FVG'si için geriye bakılan mum sayısı
CAND_MAX_DIST = 0.06                  # hazırlanan formasyonlar: tetiğe en fazla %6 uzaklık

META = {
    "name": "Morning star",
    "group": "formasyon",
    "status": "live",
    "short": "3 mumluk dönüş formasyonu",
    "candNote": "Sert kırmızı mum ve ardından doji oluşmuş; bir sonraki mum yeşil ve tetiğin üstünde kapanırsa morning star tamamlanır. Geçmişte bu adayların yalnızca ~%3'ü sinyale dönüştü (tetiğe yakın olanlarda daha sık). Kesin stop, 3. mumun en düşüğü de hesaba katılarak kapanıştan sonra belirlenir.",
    "summary": "Sert düşüşten sonra kararsızlık (doji) ve ardından satıcıların başladığı yerin üstüne çıkan güçlü yeşil mum",
    "rules": [
        "1. mum kırmızı ve sert: gövdesi en az 0,5 ATR",
        "2. mum küçük (doji benzeri): gövdesi 1. mumun gövdesinin en fazla %30'u",
        "3. mum yeşil ve 1. mumun en yükseğinin üstünde kapanıyor",
        "Yol açık: 1. mumdan önceki 80 mumda oluşmuş, doldurulmamış ve girişin üstünde kalan bir düşüş FVG'si (fiyat boşluğu) yok",
        "Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺",
        "Giriş: 3. mumun kapanışı · Başlangıç stopu: üç mumun en düşüğünün %0,1 altı (1R = giriş − stop)",
        "Çıkış: fiyat +1R'ye ulaşınca stop, görülen en yüksek fiyatın 1R altından takip eder (yalnızca yukarı); sabit hedef yok · En fazla 60 işlem günü",
    ],
    "notes": [
        "Avantaj 2022–2024'te belirgindi, 2025–2026'da zayıfladı. Canlı sonuçları yıllık tablodan izleyin.",
        "Üstte doldurulmamış düşüş FVG'si olan formasyonlar test edilen her örneklemde (günlük BIST 100, BIST 100 dışı, 4 saatlik) belirgin şekilde zayıftı; bu yüzden elenir.",
        "Aynı kurallar ABD (S&P 100) ve Almanya (DAX 40) hisselerinde rastgele girişten iyi sonuç vermedi: etki BIST'e özgü görünüyor.",
        "En güçlü etki orta ölçekli hisselerde (BIST 100'ün 31–100. sıraları); BIST 30'da zayıf.",
        "Sermayenin çoğu zaman boşta kalır; tek başına strateji olarak değil, giriş zamanlaması aracı olarak kullanın.",
        "Takip eden stop, sabit 3R hedefe göre toplamda biraz daha az kazandırır; karşılığında işlemlerin yarısından fazlası kârla kapanır, kayıp serileri ve düşüşler kısalır. Karşılaştırma tabloda.",
        "Hesap simülasyonu işlem başına bakiyenin %1'ini riske eder: sinyaller seyrek olduğu için nakit nadiren dolar; %0,5 risk getiriyi belirgin düşürür. Yine de art arda 10+ kayıp yaşanabilir.",
        "4 saatlik test yalnızca son ~2 yılı (Yahoo saatlik veri sınırı) kapsar; günlük testten kısa olduğu için daha az güvenilirdir.",
        "4 saatlik mumlar 13:30 ve kapanışta biter. Veri gecikmeli gelir ve site saatlik güncellenir: 13:30 sinyali sayfada birkaç saat sonra görünebilir, giriş fiyatı o zamana kadar değişmiş olabilir.",
    ],
}


def _first_two(F, a, b) -> bool:
    """a: sert kırmızı mum, b: doji."""
    o, c = F["o"], F["c"]
    body1 = o[a] - c[a]
    atr = F["atr"][a]
    return bool(np.isfinite(atr) and c[a] < o[a] and body1 >= BODY_ATR * atr and abs(c[b] - o[b]) <= DOJI_MAX * body1)


def signal(F, t) -> dict | None:
    """t mumunun kapanışında morning star tamamlandıysa {"entry", "stop"}; değilse None."""
    if t < WARMUP:
        return None
    o, h, lo, c = F["o"], F["h"], F["l"], F["c"]
    a, b = t - 2, t - 1
    if not _first_two(F, a, b):
        return None
    if not (c[t] > o[t] and c[t] > h[a]):
        return None
    if overhead_fvg(F, t) is not None:
        return None
    return {"entry": c[t], "stop": min(lo[a], lo[b], lo[t]) * (1 - STOP_BUF)}


def baseline_stop(F, t) -> float:
    return min(F["l"][t - 2], F["l"][t - 1], F["l"][t]) * (1 - STOP_BUF)


def overhead_fvg(F, t) -> tuple[float, float] | None:
    """t'de tamamlanan formasyonun 1. mumundan (t-2) önceki FVG_LOOK mumda oluşan, 1. mum anında doldurulmamış ve girişin
    üstünde kalan düşüş FVG'si: (alt, üst) ya da None. Düşüş FVG'si: i. mumun en yükseği < (i-2). mumun en düşüğü;
    boşluk [h[i], l[i-2]]. Doldurulma: sonraki mumlardan birinin en yükseği boşluğun üst sınırına ulaşırsa."""
    h, lo = F["h"], F["l"]
    a = t - 2
    entry = F["c"][t]
    for i in range(max(2, a - FVG_LOOK), a):
        if h[i] < lo[i - 2] and h[i] > entry:
            top = lo[i - 2]
            if h[i + 1:a + 1].max() < top:
                return (h[i], top)
    return None


def unfilled_bearish_fvgs(F, a) -> list[tuple[float, float]]:
    """a. mumdan önceki FVG_LOOK mumda oluşmuş ve a anında doldurulmamış düşüş FVG'leri: [(alt, üst)]."""
    h, lo = F["h"], F["l"]
    out = []
    for i in range(max(2, a - FVG_LOOK), a):
        if h[i] < lo[i - 2] and h[i + 1:a + 1].max() < lo[i - 2]:
            out.append((h[i], lo[i - 2]))
    return out


def candidate(F, b) -> dict | None:
    """b kapanışında ilk iki mum hazırsa (a = b-1 sert kırmızı, b doji) bir sonraki mum için tetik.
    Tetik: kapanış 1. mumun en yükseğinin üstünde ve yeşil olmalı; girişin üstünde kalan doldurulmamış düşüş FVG'si
    sinyali engellediği için kapanış bu boşlukların alt sınırını da geçmelidir (etkin tetik)."""
    if b < WARMUP:
        return None
    h, lo, c = F["h"], F["l"], F["c"]
    a = b - 1
    if not _first_two(F, a, b):
        return None
    trig = h[a]
    blocks = [g for g in unfilled_bearish_fvgs(F, a) if g[0] > trig]
    eff = max([trig] + [g[0] for g in blocks])
    dist = eff / c[b] - 1
    stop = min(lo[a], lo[b]) * (1 - STOP_BUF)
    if dist > CAND_MAX_DIST:
        return None
    fvg = max(blocks, key=lambda g: g[0]) if blocks else None
    return {"trig": trig, "eff": eff, "dist": dist, "stop": stop, "risk": (eff - stop) / eff, "fvg": fvg,
            "d1": a, "d2": b}
