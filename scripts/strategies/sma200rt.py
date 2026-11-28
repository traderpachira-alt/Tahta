"""SMA200 Retest: yükseliş trendinde, ortalamadan belirgin uzaklaşmış fiyatın 200 günlük ortalamaya geri çekilip
dönmesi (trendin ana desteğinin testi).

Kurallar (yalnızca o güne kadarki veri):
  Trend: SMA50 > SMA200, SMA200 yükseliyor (20 mum öncesinden yüksek) ve kapanış SMA200 üstünde
  Uzama: son 60 mumda kapanış en az bir kez SMA200'ün %15 üstüne çıkmış (geri çekilme gerçek bir trendden geliyor)
  Test: son 4 mumda (bugün dahil) en düşük fiyat SMA200'ün en fazla %3 üstüne (ya da altına) inmiş
  Dönüş: kapanış önceki mumun en yükseğinin üstünde ve günün üst %40'ında
  Stop: son 4 mumun en düşüğü ile SMA200'ün küçüğü − 0,5 ATR
Varsayılan çıkış +1R'den sonra takip eden stop; karşılaştırma için sabit 2R ve 3R. Kanal çıkışı bu sinyalde rastgele
girişten iyi değildi (dönüşün süresi kısa).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ID = "sma200rt"
TIMEFRAMES = ("1D",)
VARIANTS = {"trail": "Takip eden stop (+1R sonrası 1R)", "2": "Sabit hedef 2R", "3": "Sabit hedef 3R"}
DEFAULT_V = "trail"
TRAIL = (1.0, 1.0)
WARMUP = 220
EXT = 1.15          # son 60 mumda SMA200'ün %15 üstü
TOL = 1.03          # test: en düşük SMA200'ün en fazla %3 üstü
TEST_BARS = 4
STOP_ATR = 0.5
CLV_MIN = 0.6
CAND_MAX_DIST = 0.05

META = {
    "name": "SMA200 Retest",
    "short": "Trendde 200 günlük ortalamaya geri çekilme ve dönüş",
    "group": "trend",
    "status": "passive",
    "summary": "Yükseliş trendinde ortalamadan uzaklaşmış hisse 200 günlük ortalamaya kadar geri çekilip dönünce girilir",
    "candNote": "Fiyat son günlerde SMA200'e indi ve trend şartları sağlanıyor: bir sonraki kapanış bugünkü en yüksek fiyatı (tetik) ve SMA200'ü aşarsa ve günün üst kısmında kapanırsa sinyal oluşur.",
    "rules": [
        "Trend: SMA50 > SMA200, SMA200 yükseliyor (20 gün öncesinden yüksek), kapanış SMA200 üstünde",
        "Uzama: son 60 günde kapanış en az bir kez SMA200'ün %15 üstüne çıkmış",
        "Test: son 4 günde en düşük fiyat SMA200'ün en fazla %3 üstüne inmiş (altına sarkabilir)",
        "Dönüş: kapanış önceki günün en yükseğinin üstünde ve günün üst %40'ında → o kapanışta giriş",
        "Stop: son 4 günün en düşüğü ile SMA200'ün küçüğünün 0,5 ATR altı (1R = giriş − stop) · Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺",
        "Çıkış: fiyat +1R'ye ulaşınca stop, görülen en yüksek fiyatın 1R altından takip eder · En fazla 60 işlem günü",
    ],
    "notes": [
        "Kurallar son 4 yılın günlük verisinde birkaç derin geri çekilme kurgusu arasından seçildi (50 günlük tepeden %15 düşüş sonrası dönüş, hacmi kuruyan geri çekilme, dipten çapalı VWAP desteği rastgele girişten iyi değildi); canlı sonuçları yıllık tablodan izleyin.",
        "Hem BIST 100'de hem BIST TÜM'de rastgele girişin üstünde; uzama (%15–30) ve test toleransı (%2–5) değiştirilince de avantaj sürdü.",
        "2025–26'da avantaj küçüldü: trendlerin çoğu SMA200'ü kırıp düşüşe döndü. Piyasa genelinde zayıflıkta dikkat.",
        "Kanal çıkışı bu sinyalde rastgele girişten iyi değildi: dönüş hareketi kısa sürüyor; takip eden stop ya da sabit hedef daha uygun.",
        "FVG Push ve Donchian ile örtüşmesi çok düşük (yaklaşık %3): trendin daha derin geri çekilmelerini yakalar.",
        "Rastgele giriş kıyası, yükseliş trendinde (SMA50 > SMA200, kapanış SMA200 üstünde) olan günlerden seçilir.",
    ],
}


def _prep(F) -> dict:
    P = F.get("_s200rt")
    if P is None:
        cs = pd.Series(F["c"])
        P = F["_s200rt"] = {"s50": cs.rolling(50).mean().to_numpy(), "s200": cs.rolling(200).mean().to_numpy()}
    return P


def _trend(F, P, t) -> bool:
    s50, s200, c = P["s50"], P["s200"], F["c"]
    if not (np.isfinite(s200[t]) and np.isfinite(s200[t - 20])):
        return False
    if not (s50[t] > s200[t] and s200[t] > s200[t - 20]):
        return False
    return bool(np.nanmax(c[t - 60:t] / s200[t - 60:t]) >= EXT)


def _clv(F, t) -> float:
    r = F["h"][t] - F["l"][t]
    return (F["c"][t] - F["l"][t]) / r if r > 0 else 0.5


def signal(F, t) -> dict | None:
    if t < WARMUP or not np.isfinite(F["atr"][t]):
        return None
    P, c, h, l = _prep(F), F["c"], F["h"], F["l"]
    s200 = P["s200"]
    if not (c[t] > s200[t] and _trend(F, P, t)):
        return None
    if not np.min(l[t - TEST_BARS + 1:t + 1] / s200[t - TEST_BARS + 1:t + 1]) <= TOL:
        return None
    if not (c[t] > h[t - 1] and _clv(F, t) >= CLV_MIN):
        return None
    stop = min(float(np.min(l[t - TEST_BARS + 1:t + 1])), float(s200[t])) - STOP_ATR * F["atr"][t]
    return {"entry": c[t], "stop": stop, "info": {"sma200": round(float(s200[t]), 4)}}


def baseline_stop(F, t) -> float:
    return F["c"][t] - 2.2 * F["atr"][t]


def baseline_ok(F, t) -> bool:
    P = _prep(F)
    return t >= WARMUP and bool(P["s50"][t] > P["s200"][t] and F["c"][t] > P["s200"][t])


def candidate(F, b) -> dict | None:
    """b kapanışında trend ve test şartları sağlanmış, dönüş henüz yok: bir sonraki kapanış bugünkü en yüksek fiyatı aşarsa sinyal."""
    if b < WARMUP or not np.isfinite(F["atr"][b]):
        return None
    P, c, h, l = _prep(F), F["c"], F["h"], F["l"]
    s200 = P["s200"]
    if not (c[b] >= 0.97 * s200[b] and _trend(F, P, b)):     # bugün SMA200'ün biraz altına sarkmış olabilir
        return None
    # yarınki test penceresi b-2..b+1: bugüne kadarki kısmında SMA200'e değmiş olmalı
    if not np.min(l[b - TEST_BARS + 2:b + 1] / s200[b - TEST_BARS + 2:b + 1]) <= TOL:
        return None
    if c[b] > h[b - 1] and _clv(F, b) >= CLV_MIN:
        return None      # bugün zaten sinyal
    trig = float(h[b])
    eff = max(trig, float(s200[b]))                         # kapanış SMA200'ün de üstünde olmalı
    dist = eff / c[b] - 1
    stop = min(float(np.min(l[b - TEST_BARS + 2:b + 1])), float(s200[b])) - STOP_ATR * F["atr"][b]
    if dist > CAND_MAX_DIST or stop >= eff:
        return None
    return {"trig": trig, "eff": eff, "dist": dist, "stop": stop, "risk": (eff - stop) / eff, "fvg": None,
            "d1": b - TEST_BARS + 2, "d2": b, "info": {"sma200": round(float(s200[b]), 4)}}
