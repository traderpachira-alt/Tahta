"""Rise Baby (hızlı yükseliş devamı): SMA200 üstündeki bir hissenin 10 günde %25'ten fazla yükseldiği ilk gün momentuma
binilir. Ralliler çoğu zaman sessiz başlar ve zamanla hızlanır; başlangıçta ayırt edilemeyen hareketin kendini gösterdikten
sonraki kısmı alınır.

Kurallar (yalnızca o güne kadarki veri):
  Sinyal: kapanış SMA200 üstünde ve 10 günlük getiri ≥ %25; bu koşulun sağlandığı ilk gün (bir önceki gün sağlanmıyordu)
  Tavan: sinyal günü tavanda kapanırsa (önceki kapanışa göre ≥ %9,5 ve günün en yükseğinde kapanış) o fiyattan alım pratikte
       mümkün olmadığı için beklenir; tavanda kapanmadığı ilk günün kapanışında girilir. Tavan serisi 3 gün sürerse sinyal iptal.
  Stop: giriş − 2,5 ATR
Varsayılan çıkış kanal çıkışı (kapanış önceki 10 günün en düşüğünün altına inince; Donchian ile aynı kural); karşılaştırma için
20 gün tut, takip eden stop, sabit 3R.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import donchian as _dc

ID = "risebaby"
TIMEFRAMES = ("1D",)
VARIANTS = {"chan": "Kanal çıkışı (10 günlük dip)", "t20": "20 gün tut (20. gün kapanışı)", "trail": "Takip eden stop (+1R sonrası 1R)",
            "3": "Sabit hedef 3R"}
DEFAULT_V = "chan"
CUSTOM_EXITS = ("chan", "t20")
TRAIL = (1.0, 1.0)
WARMUP = 210
WINDOW = 10           # getiri penceresi (gün)
THRESHOLD = 0.25      # 10 günde en az %25
ATR_STOP = 2.5
LIMIT_UP = 0.095      # tavan sayılan günlük artış (BIST fiyat sınırı %10)
MAX_LOCK = 3          # bu kadar gün üst üste tavanda kalırsa sinyal iptal
HOLD = 20
COST = 0.002          # motorla aynı (signals.COST)
ACCOUNT_RISK = 0.005  # sinyaller aynı günlere yığılır; %0,5 ile düşüş yaklaşık yarıya iner

META = {
    "name": "Rise Baby",
    "short": "10 günde +%25 yükselen trenddeki hisseye momentumla binmek",
    "group": "trend",
    "status": "live",
    "summary": "SMA200 üstünde 10 günde %25'ten fazla yükselen hisseye, yükselişin kendini gösterdiği ilk gün binilir; tavan serisinde beklenir",
    "candNote": "Sinyal oluştu ama hisse tavanda kapandı: o fiyattan alım pratikte mümkün değil. Tavanda kapanmadığı ilk günün kapanışında giriş yapılır; tavan 3 gün üst üste sürerse sinyal iptal olur.",
    "rules": [
        "Sinyal: kapanış SMA200'ün üstünde ve son 10 günün getirisi ilk kez %25'i aştı",
        "Tavan: sinyal günü tavanda kapandıysa (önceki kapanışa göre ≥ %9,5 ve günün en yükseğinde kapanış) beklenir; tavanda kapanmadığı ilk günün kapanışında girilir · 3 gün üst üste tavan → sinyal iptal",
        "Stop: giriş − 2,5 ATR (1R = giriş − stop) · Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺",
        "Çıkış: kapanış önceki 10 günün en düşüğünün altına inince o kapanıştan; başlangıç stopu her zaman geçerli · En fazla 60 işlem günü",
    ],
    "notes": [
        "Kaçırılan rallilerin analizinden çıktı: hiçbir stratejide olmayan rallilerin yalnızca %16'sı bir ateşleme günüyle (sert yükseliş + hacim) başlıyordu; çoğu sessiz başlayıp zamanla hızlanıyordu (10. günde medyan +%9, zirveye kalan %20). Başlangıçta ayırt edilemeyen hareket, kendini gösterdikten sonra yakalanıyor.",
        "Sağlamlık: 5, 10 ve 15 günlük pencerelerde +%10…+%30 eşiklerinin, 2–3 ATR stopların ve farklı bölge filtrelerinin hepsinde rastgele girişin üstündeydi; eşik yükseldikçe avantaj arttı. 10 günde +%25 bu bölgenin ortasından seçildi.",
        "SMA200 şartı önemli: düşüşteki hisselerde aynı sert yükseliş sonraki 20 günde geri veriliyordu.",
        "Tavan gerçekçiliği: sinyallerin yaklaşık üçte biri tavan gününe denk geliyor; serilerin çoğu bir günde bitiyor (3 gün ve üstü ~%3). Tavanı bekleyip ilk alınabilir günün kapanışında girmek avantajı az azaltıyor (Kasım 2026 testi, BIST TÜM, kanal çıkışı: +0,74R yerine +0,69R; rastgele +0,33R). Seri bittikten sonraki açılışta almak belirgin şekilde kötüydü (+0,46R): o açılışlar genelde yüksek açılıp geri veriyor.",
        "Sinyaller aynı dönemlerde yığılır ve stoplar geniştir (medyan ~%12); hesap simülasyonu işlem başına %0,5 risk kullanır. Art arda uzun kayıp serileri (30+) görülebilir; kazanç az sayıdaki uzun trendden gelir.",
        "Sinyallerin yaklaşık yarısı aynı hissede Donchian'ın açık olduğu zamana denk gelir; örtüşmeyenler de rastgele girişin belirgin üstündeydi.",
        "Test bugünkü endeks bileşenleriyle yapıldı; momentum stratejilerinde bu sonucu bir miktar iyi gösterebilir.",
        "Rastgele giriş kıyası, SMA200 üstündeki günlerden aynı stop mesafesiyle (2,5 ATR) yapılır.",
    ],
}


def _locked(F, d) -> bool:
    """Tavanda kapanış: önceki kapanışa göre ≥ %9,5 ve günün en yükseğinde kapanış (alıcılı tavan; o fiyattan alım zor)."""
    c, h = F["c"], F["h"]
    return bool(c[d] / c[d - 1] - 1 >= LIMIT_UP and c[d] >= h[d] * 0.999)


def _prep(F) -> dict:
    """Giriş günleri {d: tavanda beklenen gün sayısı} ve son mumda tavanda bekleyen sinyal (başlangıç, gün sayısı) — hisse başına bir kez."""
    P = F.get("_rb")
    if P is not None:
        return P
    c = F["c"]
    n = len(c)
    s200 = pd.Series(c).rolling(200).mean().to_numpy()
    rW = np.full(n, np.nan)
    rW[WINDOW:] = c[WINDOW:] / c[:-WINDOW] - 1
    ok = (rW >= THRESHOLD) & (c > s200)
    entries, pending = {}, None
    for t in range(WARMUP + 1, n):
        if not (ok[t] and not ok[t - 1]):
            continue
        d = t
        while d < n and _locked(F, d):
            d += 1
        if d - t >= MAX_LOCK:
            continue                      # tavan serisi 3 gün ve üstü: iptal
        if d >= n:
            pending = (t, d - t)          # hâlâ tavanda: bekleniyor
            continue
        entries.setdefault(d, d - t)
    P = F["_rb"] = {"entries": entries, "pending": pending, "s200": s200}
    return P


def signal(F, t) -> dict | None:
    if t < WARMUP or not np.isfinite(F["atr"][t]):
        return None
    P = _prep(F)
    if t not in P["entries"]:
        return None
    e = F["c"][t]
    info = {"lock": P["entries"][t]} if P["entries"][t] else None
    out = {"entry": e, "stop": e - ATR_STOP * F["atr"][t]}
    if info:
        out["info"] = info
    return out


def baseline_stop(F, t) -> float:
    return F["c"][t] - ATR_STOP * F["atr"][t]


def baseline_ok(F, t) -> bool:
    return t >= WARMUP and bool(F["c"][t] > _prep(F)["s200"][t])


def simulate(F, t, entry, stop, mode, hold) -> dict:
    """chan: Donchian'ın kanal çıkışı. t20: başlangıç stopu + 20. işlem günü kapanışında çıkış."""
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
    """Son mumda tavanda bekleyen sinyal: tavanda kapanmadığı ilk günün kapanışında giriş (tahmini stop bugünkü fiyattan)."""
    if b < WARMUP or not np.isfinite(F["atr"][b]):
        return None
    P = _prep(F)
    if not P["pending"] or b != len(F["c"]) - 1:
        return None
    t0, k = P["pending"]
    e = float(F["c"][b])
    stop = e - ATR_STOP * float(F["atr"][b])
    return {"trig": e, "eff": e, "dist": 0.0, "stop": stop, "risk": (e - stop) / e, "fvg": None,
            "d1": t0, "d2": b, "info": {"lock": k}}
