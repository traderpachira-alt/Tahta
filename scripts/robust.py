"""Sağlamlık ölçüleri ve piyasa kademesi (sinyaller için).

Sağlamlık: R dağılımı çan eğrisi değildir (kayıp stopla ≈ −1R'de sınırlı, kazanç açık uçlu); ortalama birkaç büyük işlemden
gelebilir. Bu yüzden ortalamanın yanında tipik işlemi (medyan), uçlar atıldığında kalanı (kırpılmış ortalama), en büyük
işlemlere bağımlılığı (en iyi 3 hariç toplam, en iyi %5'in payı) ve büyük kazancın ne sıklıkla geldiğini (yıllara göre
≥ 10R işlem) gösterir. Hepsi varsayılan çıkışla, BIST TÜM evreninde sonuçlanan işlemlerden.

Piyasa kademesi: BIST TÜM'de 200 günlük ortalamasının üstündeki hisse oranı (uzun vadeli genişlik) beş kademeye ayrılır.
Ölçü yalnızca o günün verisini kullanır (geleceğe bakmaz). Her kademede geçmişte açılan sinyallerin sonucu yanında verilir:
kademe bir öneri değil, geçmişin o koşuldaki karnesidir.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

BIG_R = 10.0          # "büyük kazanç" eşiği
TRIM = 0.05           # kırpılmış ortalama: en iyi ve en kötü %5 hariç
HIST_EDGES = [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0]   # R dağılımı grafiğinin sınırları
HIST_LABELS = ["< −1,5", "−1,5…−1", "−1…−0,5", "−0,5…0", "0…0,5", "0,5…1", "1…2", "2…3", "3…5", "5…10", "≥ 10"]

# Kademe: (alt sınır, ad, açıklama) — 200 günlük ortalamasının üstündeki hisse oranı
LEVELS = [
    (0.00, "Çok zayıf", "Hisselerin çok azı uzun vadeli ortalamasının üstünde; düşüş tabana yayılmış."),
    (0.25, "Zayıf", "Hisselerin çoğu uzun vadeli ortalamasının altında."),
    (0.40, "Orta", "Hisselerin yaklaşık yarısı uzun vadeli ortalamasının üstünde."),
    (0.55, "İyi", "Hisselerin çoğu uzun vadeli ortalamasının üstünde."),
    (0.70, "Çok iyi", "Yükseliş geniş tabanlı; hisselerin büyük kısmı uzun vadeli ortalamasının üstünde."),
]


def level(a200: float | None) -> int | None:
    """1 (çok zayıf) … 5 (çok iyi)."""
    if a200 is None or not np.isfinite(a200):
        return None
    return sum(a200 >= lo for lo, *_ in LEVELS)


def robustness(rs: list[float], years: list[int]) -> dict | None:
    r = np.asarray(rs, dtype=float)
    n = len(r)
    if n < 10:
        return None
    s = np.sort(r)
    k = max(1, int(n * TRIM))
    total = float(s.sum())
    top = s[n - k:].sum()
    big = {}
    for y, x in zip(years, r):
        big.setdefault(str(y), 0)
        if x >= BIG_R:
            big[str(y)] += 1
    hist = np.histogram(np.clip(r, -50, 1e6), bins=[-1e9, *HIST_EDGES, 1e9])[0]
    tm = float(s[k:n - k].mean())
    return {
        "n": n, "mean": round(float(r.mean()), 3), "med": round(float(np.median(r)), 3), "tm": round(tm, 3),
        "ex3": round(float(total - s[-3:].sum()), 1), "sum": round(total, 1),
        "topShare": round(float(top / total), 3) if total > 0 else None,
        "big": big, "hist": [int(x) for x in hist],
        "profile": profile(float(np.median(r)), tm),
    }


PROFILE_TM = 0.05   # kırpılmış ortalama bunun altındaysa sonuç birkaç büyük işleme bağlı sayılır


def profile(med: float, tm: float) -> str:
    """balanced: tipik işlem kârlı (medyan > 0) · tail: işlemlerin çoğu küçük zarar, kâr büyük işlemlerden ama uçlar atılınca da
    artıda · fragile: uçlar atılınca kalan sıfıra yakın ya da eksi (sonuç birkaç büyük işleme bağlı)."""
    if med > 0:
        return "balanced"
    return "tail" if tm >= PROFILE_TM else "fragile"


def by_level(trades: list[dict], lvl_of) -> list[dict]:
    """Kademe başına sonuçlanan işlem sayısı, kârlı oranı, ortalama ve medyan R (giriş günündeki kademeye göre)."""
    out = []
    for i in range(1, len(LEVELS) + 1):
        r = np.array([x["r"] for x in trades if lvl_of(x["d0"]) == i], dtype=float)
        out.append({"lvl": i, "n": int(len(r)), "win": round(float((r > 0).mean()), 3) if len(r) else None,
                    "avgR": round(float(r.mean()), 3) if len(r) else None, "med": round(float(np.median(r)), 3) if len(r) else None})
    return out


def level_lookup(a200: pd.Series):
    """Tarih (gün ya da 4 saatlik mum) → o günkü kademe."""
    s = a200.copy()
    s.index = pd.DatetimeIndex(s.index).normalize()
    s = s[~s.index.duplicated(keep="last")].sort_index()

    def f(d):
        v = s.asof(pd.Timestamp(d).normalize())
        return level(float(v)) if v is not None and np.isfinite(v) else None
    return f


def regime_now(b: pd.DataFrame) -> dict | None:
    if b is None or not len(b):
        return None
    a200, a50 = float(b["a200"].iloc[-1]), float(b["a50"].iloc[-1])
    lv = level(a200)
    d20 = float(b["a200"].iloc[-1] - b["a200"].iloc[-21]) if len(b) > 21 else None
    return {"date": b.index[-1].strftime("%Y-%m-%d"), "lvl": lv, "name": LEVELS[lv - 1][1], "text": LEVELS[lv - 1][2],
            "a200": round(a200, 4), "a50": round(a50, 4), "d20": None if d20 is None else round(d20, 4)}


def levels_meta() -> list[dict]:
    hi = [lo for lo, *_ in LEVELS[1:]] + [1.0]
    return [{"lvl": i + 1, "name": n, "text": t, "lo": lo, "hi": h} for i, ((lo, n, t), h) in enumerate(zip(LEVELS, hi))]
