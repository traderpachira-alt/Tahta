"""Squeeze Break (birikimli sıkışma kırılımı): dar bir kutuda alıcıların ağır bastığı yatay birikimden sonra kutunun
güçlü bir kapanışla yukarı kırılması.

Kurallar (yalnızca o güne kadarki veri):
  Kutu: önceki 40 mumun en yükseği ve en düşüğü; genişlik (tepe / dip − 1) en fazla %20
  Birikim: kutunun son 10 kapanışı ortalamada kutunun üst %60'ında (kapanışlar tavana yakın) ve kutu boyunca yön hacmi
       (yükselen günlerin hacmi − düşen günlerin hacmi, OBV değişimi) artıda
  Kırılım: kapanış kutunun tepesinin 0,1 ATR üstünde, bir önceki kapanış kutunun içinde (ilk kırılım)
  Sahte fitile karşı: kapanış günün üst %30'unda ve gövde günün aralığının en az yarısı (fitille kutu üstüne çıkıp geri
       dönen günler sayılmaz); hacim 20 günlük ortalamanın en az 1,5 katı
  Tekrar yok: bir önceki sinyalden sonraki 5 mum içinde yeni sinyal yok
  Stop: kutunun dibi; giriş − 3 ATR'den uzaksa giriş − 3 ATR
Varsayılan çıkış 20 işlem günü tutmak (20. gün kapanışında çıkış; başlangıç stopu her zaman geçerli). Karşılaştırma için
takip eden stop ve kanal çıkışı. Neden: kırılım sonrası hareket birkaç hafta sürüyor; takip stopu erken çıkarıyor.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import donchian as _dc

ID = "sqzbrk"
TIMEFRAMES = ("1D",)
VARIANTS = {"t20": "20 gün tut (20. gün kapanışı)", "trail": "Takip eden stop (+1R sonrası 1R)", "chan": "Kanal çıkışı (10 günlük dip)"}
DEFAULT_V = "t20"
CUSTOM_EXITS = ("t20", "chan")
TRAIL = (1.0, 1.0)
WARMUP = 60
BOX = 40            # kutu uzunluğu (mum)
WIDTH = 0.20        # kutu genişliği en fazla %20
POS_MIN = 0.60      # son 10 kapanış ortalamada kutunun üst %60'ında
CLV_MIN = 0.70      # kapanış günün üst %30'unda
BODY_MIN = 0.50     # gövde ≥ günün aralığının yarısı
VOLX = 1.5          # hacim ≥ 20 günlük ortalamanın 1,5 katı
BREAK_ATR = 0.1     # kapanış kutu tepesinin 0,1 ATR üstünde
MAX_STOP_ATR = 3.0
HOLD = 20
GAP = 5             # sinyaller arası en az 5 mum
COST = 0.002        # motorla aynı (signals.COST)
CAND_MAX_DIST = 0.04

META = {
    "name": "Squeeze Break",
    "short": "Dar kutuda birikim sonrası güçlü kapanışla yukarı kırılım",
    "group": "kirilim",
    "status": "live",
    "summary": "40 günlük dar bir kutuda kapanışları tavana yakın seyreden, alım hacmi ağır basan hisse kutuyu güçlü bir kapanış ve hacimle yukarı kırınca girilir; 20 gün tutulur",
    "candNote": "Kutu ve birikim şartları sağlanıyor, fiyat kutunun tepesine en fazla %4 uzakta: bir sonraki kapanış tetiğin (kutu tepesi + 0,1 ATR) üstünde, günün üst %30'unda, gövdeli ve hacimli olursa sinyal oluşur.",
    "rules": [
        "Kutu: önceki 40 günün en yükseği ve en düşüğü; genişlik en fazla %20",
        "Birikim: son 10 kapanış ortalamada kutunun üst %60'ında ve kutu boyunca yön hacmi (OBV) artıda",
        "Kırılım: kapanış kutu tepesinin 0,1 ATR üstünde, bir önceki kapanış kutunun içinde",
        "Sahte fitile karşı: kapanış günün üst %30'unda, gövde günün aralığının en az yarısı; hacim 20 günlük ortalamanın en az 1,5 katı",
        "Stop: kutunun dibi (en fazla giriş − 3 ATR) · Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺",
        "Çıkış: 20. işlem günü kapanışında; başlangıç stopu her zaman geçerli",
    ],
    "notes": [
        "Kurallar 72 farklı kutu uzunluğu / genişlik / birikim ayarı arasından seçildi; tek bir şanslı ayara değil, 40–50 günlük ve en fazla %20 genişlikteki kutuların hepsinin rastgele girişi geçtiği bölgeye dayanıyor. Sinyal sayısı az (4 yılda ~200); canlı sonuçları yıllık tablodan izleyin.",
        "Asıl farkı birikim şartı yaratıyor: kapanışlar kutunun üst kısmında değilse (%50'ye gevşetince) avantaj 2025–26'da neredeyse kayboldu. Basit Bollinger daralması + kırılım rastgele girişten iyi değildi.",
        "Kırılımdan önce hacmin kuruması şartı her ayarda sonucu kötüleştirdi; ertesi gün ya da hafta kapanışı teyidini beklemek girişi geciktirip iyileştirmedi.",
        "Sinyallerin yaklaşık yarısı aynı hissede başka bir stratejinin (çoğunlukla Donchian) açık işlemine denk gelir. Örtüşmeyen sinyaller de rastgele girişin belirgin üstündeydi (20 günde +0,38R; rastgele +0,11R); örtüşenler daha güçlüydü.",
        "20 gün tutmak takip eden stoptan iyiydi: kırılım sonrası hareket birkaç hafta sürüyor, takip stopu erken çıkarıyor.",
        "Rastgele giriş kıyası likit bütün günlerden, aynı stop mesafesiyle (3 ATR) ve aynı çıkışla yapılır.",
    ],
}


def _prep(F) -> dict:
    """Sinyal günleri {t: (dip, tepe)} — hisse başına bir kez, yalnızca geçmiş veriyle (sinyaller arası boşluk sıralı)."""
    P = F.get("_sqz")
    if P is not None:
        return P
    o, h, l, c, v, atr = F["o"], F["h"], F["l"], F["c"], F["v"], F["atr"]
    n = len(c)
    rng = h - l
    clv = np.where(rng > 0, (c - l) / np.where(rng > 0, rng, 1), 0.5)
    body = np.where(rng > 0, np.abs(c - o) / np.where(rng > 0, rng, 1), 0.0)
    v20 = pd.Series(v).shift(1).rolling(20).mean().to_numpy()
    sv = np.sign(np.r_[0.0, np.diff(c)]) * v
    sig, last = {}, -10**9
    for t in range(max(WARMUP, BOX + 1), n):
        bh, bl = float(np.max(h[t - BOX:t])), float(np.min(l[t - BOX:t]))
        if not (bh > bl > 0 and bh / bl - 1 <= WIDTH) or not np.isfinite(atr[t]):
            continue
        if not (c[t] > bh + BREAK_ATR * atr[t] and c[t - 1] <= bh):
            continue
        if np.mean((c[t - 10:t] - bl) / (bh - bl)) < POS_MIN or np.sum(sv[t - BOX:t]) <= 0:
            continue
        if clv[t] < CLV_MIN or body[t] < BODY_MIN or not (np.isfinite(v20[t]) and v[t] >= VOLX * v20[t]):
            continue
        if t <= last + GAP:
            continue
        sig[t] = (bl, bh)
        last = t
    P = F["_sqz"] = {"sig": sig, "sv": sv}
    return P


def signal(F, t) -> dict | None:
    if t < WARMUP:
        return None
    z = _prep(F)["sig"].get(t)
    if not z:
        return None
    e = F["c"][t]
    stop = max(z[0], e - MAX_STOP_ATR * F["atr"][t])
    return {"entry": e, "stop": stop, "info": {"box": [round(z[0], 4), round(z[1], 4)], "hold": HOLD}}


def baseline_stop(F, t) -> float:
    return F["c"][t] - MAX_STOP_ATR * F["atr"][t]


def simulate(F, t, entry, stop, mode, hold) -> dict:
    """t20: başlangıç stopu + 20. işlem günü kapanışında çıkış. chan: Donchian'ın kanal çıkışı."""
    if mode == "chan":
        return _dc.simulate(F, t, entry, stop, mode, hold)
    n = len(F["c"])
    risk = entry - stop
    cost_r = COST * entry / risk

    def res(status, px, i):
        return {"status": status, "r": (px - entry) / risk - cost_r, "pct": px / entry - 1 - COST, "exit_t": i, "exit": px}

    for i in range(t + 1, min(n, t + 1 + HOLD)):
        if F["l"][i] <= stop:
            return res("stop", min(stop, F["o"][i]) if i > t + 1 else stop, i)
    if n - 1 < t + HOLD:
        return {"status": "open", "r": (F["c"][-1] - entry) / risk, "pct": F["c"][-1] / entry - 1, "stop_now": stop, "armed": False}
    return res("time", F["c"][t + HOLD], t + HOLD)


def candidate(F, b) -> dict | None:
    """b kapanışında kutu ve birikim şartları sağlanıyor, kırılım yok: bir sonraki kapanış tetiği aşarsa (ve güçlü,
    hacimli bir gün olursa) sinyal. Yarınki kutu b dahil son 40 mumdur."""
    if b < WARMUP or not np.isfinite(F["atr"][b]):
        return None
    h, l, c = F["h"], F["l"], F["c"]
    bh, bl = float(np.max(h[b - BOX + 1:b + 1])), float(np.min(l[b - BOX + 1:b + 1]))
    if not (bh > bl > 0 and bh / bl - 1 <= WIDTH) or c[b] > bh:
        return None
    sv = _prep(F)["sv"]
    if np.mean((c[b - 9:b + 1] - bl) / (bh - bl)) < POS_MIN or np.sum(sv[b - BOX + 1:b + 1]) <= 0:
        return None
    trig = bh + BREAK_ATR * float(F["atr"][b])
    dist = trig / c[b] - 1
    stop = max(bl, trig - MAX_STOP_ATR * float(F["atr"][b]))
    if dist > CAND_MAX_DIST or stop >= trig:
        return None
    return {"trig": trig, "eff": trig, "dist": dist, "stop": stop, "risk": (trig - stop) / trig, "fvg": None,
            "d1": b - BOX + 1, "d2": b, "info": {"box": [round(bl, 4), round(bh, 4)]}}
