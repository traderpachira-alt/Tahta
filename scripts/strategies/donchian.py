"""Donchian kanal kırılımı (20 gün), yalnızca günlük mumlar.

Kurallar (yalnızca o güne kadarki veri):
  Kırılım: kapanış önceki 20 günün en yükseğinin üstünde ve bir önceki kapanış o günkü kanalın içinde (ilk kırılım günü)
  T  Trend: kapanış SMA200'ün üstünde ve SMA50 > SMA200
  H  Yakın direnç yok: önceki 1 yılın (250 gün) tepesi girişin 0–2R üstünde değil (ya girişin altında ya da 2R'den uzak)
  G  Üstte doldurulmamış düşüş FVG'si yok (morning star'daki tanımla, son 80 mum)
İşlem: giriş kırılım günü kapanışında; başlangıç stopu = giriş − 2 × ATR 14.
Varsayılan çıkış (kanal çıkışı): kapanış önceki 10 günün en düşüğünün altına inince o kapanıştan çıkılır; başlangıç stopu
her zaman geçerli (stopun altında açılan günde açılıştan). Karşılaştırma için takip eden stop ve sabit 5R de test edilir.
Rastgele giriş kıyası yalnızca yükseliş trendindeki günlerden (T koşulu) seçilir; böylece trend filtresinin katkısı ayrılır.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import morningstar as _ms

ID = "donchian"
TIMEFRAMES = ("1D",)
VARIANTS = {"chan": "Kanal çıkışı (10 günlük dip)", "trail": "Takip eden stop (+1R sonrası 1R)", "5": "Sabit hedef 5R"}
DEFAULT_V = "chan"
CUSTOM_EXITS = ("chan",)
TRAIL = (1.0, 1.0)
N_ENTRY = 20            # kırılım kanalı
N_EXIT = 10             # çıkış kanalı
ATR_STOP = 2.0          # başlangıç stopu: 2 ATR
PEAK_LOOK = 250         # yakın direnç için geriye bakılan gün
PEAK_R = 2.0            # tepe girişin bu kadar R'si içinde üstteyse işlem yok
WARMUP = 200
ACCOUNT_RISK = 0.005   # hesap simülasyonu: işlem başına bakiyenin %0,5'i (sinyaller yığılır; küçük pozisyonla daha çoğuna yer açılır)
CAND_MAX_DIST = 0.03    # hazırlanan kurulumlar: kanal tepesine en fazla %3 uzaklık
COST = 0.002            # motorla aynı (signals.COST); kanal çıkışı burada yürütüldüğü için tekrar tanımlı

META = {
    "name": "Donchian Break",
    "short": "20 günlük kanalın kırılımı, trend ve direnç filtreli",
    "group": "kirilim",
    "status": "test",
    "summary": "Fiyat son 20 günün zirvesinin üstünde kapanınca, yükseliş trendinde ve yakında direnç yokken girilir; trend sürdükçe taşınır",
    "rules": [
        "Kırılım: kapanış önceki 20 günün en yükseğinin üstünde (ilk kırılım günü; bir önceki kapanış kanalın içinde)",
        "Trend: kapanış SMA200'ün üstünde ve SMA50 > SMA200",
        "Yakın direnç yok: önceki 1 yılın tepesi girişin 0–2R üstünde değil",
        "Yol açık: girişin üstünde doldurulmamış düşüş FVG'si (fiyat boşluğu) yok",
        "Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺ · yalnızca günlük mumlar",
        "Giriş: kırılım günü kapanışı · Başlangıç stopu: giriş − 2 ATR (1R = giriş − stop)",
        "Çıkış: kapanış önceki 10 günün en düşüğünün altına inince o kapanıştan; başlangıç stopu her zaman geçerli · En fazla 60 işlem günü",
    ],
    "notes": [
        "Deneme aşamasında: kurallar son 4 yılın günlük verisiyle seçildi; canlı sonuçları yıllık tablodan izleyin.",
        "Başarı oranı düşüktür (~%35–40): kârın çoğu az sayıdaki uzun trendden gelir. Art arda kayıplar normaldir.",
        "Kanal çıkışı, takip eden stopa göre işlem başına yaklaşık 3 kat kazandırdı: kırılımlar trend sürdükçe taşındığında kazanır.",
        "Son iki yılda (2025–2026) avantaj BIST 100 dışındaki hisselerden geldi; BIST 100'de sonuç sıfıra yakındı. Endeks gruplarını tabloda karşılaştırın.",
        "Rastgele giriş kıyası yalnızca yükseliş trendindeki günlerden seçilir: fark, trend filtresinin ötesindeki katkıyı gösterir.",
        "Test bugünkü endeks bileşenleriyle yapıldı: bugün endekste olan hisseler geçmişte zaten yükselmiş olabilir; bu, kırılım stratejilerinde sonucu olduğundan iyi gösterebilir.",
        "Hesap simülasyonu işlem başına bakiyenin %0,5'ini riske eder: sinyaller aynı dönemlerde yığılır ve stop uzak (2 ATR) olduğu için %1 riskte nakit 8 civarı pozisyonda dolar; %0,5 ile daha çok sinyale yer kalır, kayıp serileri daha az aşındırır.",
        "4 saatlik mumlarda belirgin şekilde zayıf çıktı (gün içi sahte kırılımlar); bu yüzden yalnızca günlük.",
    ],
}


def _prep(F) -> dict:
    """Göstergeleri hisse başına bir kez hesapla (F içinde saklanır)."""
    P = F.get("_dc")
    if P is None:
        h, lo, c = pd.Series(F["h"]), pd.Series(F["l"]), pd.Series(F["c"])
        P = F["_dc"] = {
            "top": h.shift(1).rolling(N_ENTRY).max().to_numpy(),        # önceki 20 günün en yükseği (t hariç)
            "lowx": lo.shift(1).rolling(N_EXIT).min().to_numpy(),       # önceki 10 günün en düşüğü (t hariç)
            "sma50": c.rolling(50).mean().to_numpy(), "sma200": c.rolling(200).mean().to_numpy(),
            "peak": h.shift(1).rolling(PEAK_LOOK).max().to_numpy(),
        }
    return P


def _trend(P, c, t) -> bool:
    return bool(c[t] > P["sma200"][t] and P["sma50"][t] > P["sma200"][t])


def _clear(F, P, t, entry, stop) -> bool:
    """Yakın direnç (1 yıllık tepe 0–2R üstte) ve üstte doldurulmamış düşüş FVG'si yok."""
    R = entry - stop
    pk = P["peak"][t]
    if np.isfinite(pk) and entry < pk < entry + PEAK_R * R:
        return False
    return not any(g[0] > entry for g in _ms.unfilled_bearish_fvgs(F, t))


def signal(F, t) -> dict | None:
    if t < WARMUP:
        return None
    P, c, atr = _prep(F), F["c"], F["atr"]
    top = P["top"]
    if not (np.isfinite(top[t]) and np.isfinite(top[t - 1]) and c[t] > top[t] and c[t - 1] <= top[t - 1]):
        return None
    if not (np.isfinite(atr[t]) and _trend(P, c, t)):
        return None
    entry = c[t]
    stop = entry - ATR_STOP * atr[t]
    if stop <= 0 or not _clear(F, P, t, entry, stop):
        return None
    return {"entry": entry, "stop": stop, "info": {"top": round(float(top[t]), 4)}}


def baseline_stop(F, t) -> float:
    return F["c"][t] - ATR_STOP * F["atr"][t]


def baseline_ok(F, t) -> bool:
    """Rastgele kıyas yalnızca yükseliş trendindeki günlerden."""
    return t >= WARMUP and _trend(_prep(F), F["c"], t)


def simulate(F, t, entry, stop, mode, hold) -> dict:
    """Kanal çıkışı: başlangıç stopu + kapanış önceki 10 günün en düşüğünün altına inince kapanıştan çık."""
    n = len(F["c"])
    lowx = _prep(F)["lowx"]
    risk = entry - stop
    cost_r = COST * entry / risk

    def res(status, px, i):
        return {"status": status, "r": (px - entry) / risk - cost_r, "pct": px / entry - 1 - COST, "exit_t": i, "exit": px}

    for i in range(t + 1, min(n, t + 1 + hold)):
        if F["l"][i] <= stop:
            return res("stop", min(stop, F["o"][i]) if i > t + 1 else stop, i)
        if i > t + 1 and F["c"][i] < lowx[i]:
            return res("chan", F["c"][i], i)
    if n - 1 < t + hold:
        # Bir sonraki kapanışın altına inmemesi gereken seviye: son 10 günün en düşüğü
        level = float(np.min(F["l"][max(0, n - N_EXIT):n]))
        return {"status": "open", "r": (F["c"][-1] - entry) / risk, "pct": F["c"][-1] / entry - 1, "stop_now": stop, "armed": False,
                "exit_level": level}
    return res("time", F["c"][t + hold], t + hold)


def candidate(F, b) -> dict | None:
    """b kapanışı itibarıyla kırılıma yakın (kanal tepesine en fazla %3) ve trend filtresini geçen hisseler.
    Tetik: bir sonraki kapanış son 20 günün en yükseğinin (b dahil) üstünde olmalı."""
    if b < WARMUP:
        return None
    P, c, h, atr = _prep(F), F["c"], F["h"], F["atr"]
    trig = float(np.max(h[b - N_ENTRY + 1:b + 1]))
    if not (np.isfinite(atr[b]) and c[b] <= trig and _trend(P, c, b)):
        return None
    dist = trig / c[b] - 1
    if dist > CAND_MAX_DIST:
        return None
    stop = trig - ATR_STOP * atr[b]
    pk = float(np.max(h[max(0, b - PEAK_LOOK + 1):b + 1]))
    R = trig - stop
    if pk > trig and pk < trig + PEAK_R * R:
        return None
    if any(g[0] > trig for g in _ms.unfilled_bearish_fvgs(F, b + 1)):
        return None
    top_i = b - N_ENTRY + 1 + int(np.argmax(h[b - N_ENTRY + 1:b + 1]))
    return {"trig": trig, "eff": trig, "dist": dist, "stop": stop, "risk": R / trig, "fvg": None, "d1": top_i, "d2": b}
