"""Piyasa genişliği: BIST TÜM hisselerinin kaçı 50 ve 200 günlük ortalamasının üstünde; 4 yıllık geçmişe göre yeri ve yorum.

Yorum hem olumsuzlukları hem olumlulukları öne çıkarır: seviye (çok zayıf … çok güçlü), yön (son 10/20 günde değişim),
kısa ve uzun vadenin ilişkisi, endeksle uyum. Kurallar burada; arayüz yalnızca gösterir.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

LEVELS = [(0.15, "çok zayıf"), (0.35, "zayıf"), (0.65, "dengeli"), (0.85, "güçlü"), (1.01, "çok güçlü")]


def level(x: float) -> str:
    return next(lab for lim, lab in LEVELS if x < lim)


def series(prices: dict[str, pd.DataFrame], tiers: dict[str, str | None]) -> pd.DataFrame:
    """Günlük oranlar: a50, a200 (ortalaması hesaplanabilen hisseler içinde), n (hisse sayısı)."""
    def nz(s):
        s = s.copy()
        s.index = s.index.tz_localize(None) if getattr(s.index, "tz", None) is not None else s.index
        return s
    C = pd.DataFrame({t: nz(df["Close"]) for t, df in prices.items() if tiers.get(t) in ("30", "50", "100", "TÜM")}).sort_index()
    m50, m200 = C.rolling(50).mean(), C.rolling(200).mean()
    a50 = (C > m50).where(m50.notna() & C.notna()).mean(axis=1)
    a200 = (C > m200).where(m200.notna() & C.notna()).mean(axis=1)
    n = m200.notna().sum(axis=1)
    out = pd.DataFrame({"a50": a50, "a200": a200, "n": n})
    return out[out["n"] >= 100]


def interpret(b: pd.DataFrame, idx: pd.Series | None = None) -> dict:
    """Son değerler, 4 yıllık dilimler, değişimler ve yorum (olumlu/olumsuz notlar, genel ton)."""
    last = b.index[-1]
    h = b[b.index >= last - pd.DateOffset(years=4)]
    a50, a200 = float(b["a50"].iloc[-1]), float(b["a200"].iloc[-1])
    ch = lambda col, k: float(b[col].iloc[-1] - b[col].iloc[-1 - k]) if len(b) > k else 0.0
    d50_5, d50_10, d50_20, d200_20 = ch("a50", 5), ch("a50", 10), ch("a50", 20), ch("a200", 20)
    pct = lambda col, x: float((h[col] <= x).mean())
    pos, neg = [], []
    pts = lambda x: f"{x * 100:+.0f} puan"
    # Yön
    if d50_10 >= 0.15:
        pos.append(f"Kısa vadeli genişlik hızla artıyor (10 günde {pts(d50_10)}): yükseliş tabana yayılıyor.")
    elif d50_10 >= 0.05:
        pos.append(f"Ortalamasının üstüne çıkan hisse sayısı artıyor (10 günde {pts(d50_10)}).")
    elif d50_10 <= -0.15:
        neg.append(f"Satış tabana yayılıyor: 50 günlük ortalamasının üstündeki hisse oranı 10 günde {pts(d50_10)}.")
    elif d50_10 <= -0.05:
        neg.append(f"Ortalamasının altına inen hisse sayısı artıyor (10 günde {pts(d50_10)}).")
    if -0.05 < d50_10 < 0.05 and d50_20 >= 0.05:
        pos.append(f"Son 20 günde hafif iyileşme var ({pts(d50_20)}): satış baskısı azalıyor olabilir.")
    # Dipten dönüş
    lo20 = float(b["a50"].iloc[-21:].min())
    if lo20 <= 0.20 and d50_5 >= 0.05 and a50 > lo20 + 0.05:
        pos.append(f"Dipten dönüş işareti: oran son 20 günde %{lo20 * 100:.0f} seviyesine kadar indikten sonra yükselmeye başladı. "
                   "Geçmişte bu tür dönüşlerin ardından 40 günlük endeks getirisi ortalamanın üstündeydi (az sayıda örnek; kesin değil).")
    # Yarıyı geçme
    prev = b["a50"].iloc[-21:-1]
    if a50 >= 0.5 and len(prev) and float(prev.min()) < 0.5:
        pos.append("Hisselerin yarıdan fazlası yeniden 50 günlük ortalamasının üstüne çıktı.")
    if a50 < 0.5 and len(prev) and float(prev.max()) >= 0.5:
        neg.append("Hisselerin yarıdan fazlası 50 günlük ortalamasının altına indi.")
    # Uzun vade
    if a200 >= 0.65:
        pos.append(f"Uzun vadeli trend sağlıklı: 200 günlük ortalamasının üstündeki hisse oranı %{a200 * 100:.0f}.")
    elif a200 <= 0.25:
        neg.append(f"Uzun vadede yaygın zayıflık: 200 günlük ortalamasının üstündeki hisse oranı yalnızca %{a200 * 100:.0f}.")
    if d200_20 >= 0.08:
        pos.append(f"Uzun vadeli genişlik de iyileşiyor (20 günde {pts(d200_20)}).")
    elif d200_20 <= -0.08:
        neg.append(f"Uzun vadeli genişlik bozuluyor (20 günde {pts(d200_20)}).")
    if a50 > a200 + 0.10 and d50_10 > 0:
        pos.append("Kısa vade uzun vadenin önünde: toparlanma önce kısa vadede görülür, sürerse uzun vadeyi de yukarı çeker.")
    # Aşırılıklar
    if a50 >= 0.85:
        neg.append("Aşırı ısınma: hisselerin çok büyük kısmı ortalamasının üstünde; kısa vadede yorulma olabilir.")
    if a50 <= 0.15:
        neg.append(f"Panik bölgesi: 50 günlük ortalamasının üstündeki hisse oranı yalnızca %{a50 * 100:.0f} (son 4 yılın en düşük %{max(pct('a50', a50) * 100, 1):.0f} dilimi). "
                   "Bu bölgeler geçmişte çoğu zaman dibe yakın dönemlerdi, ama düşüşün haftalarca sürdüğü örnekler de oldu.")
    # Endeksle uyum
    if idx is not None and len(idx) > 250:
        xi = idx.reindex(b.index).ffill()
        near_hi = float(xi.iloc[-1]) >= float(xi.iloc[-250:].max()) * 0.97
        near_lo = float(xi.iloc[-1]) <= float(xi.iloc[-250:].min()) * 1.03
        if near_hi and a50 < 0.40:
            neg.append("Endeks zirveye yakın ama genişlik zayıf: yükseliş az sayıda büyük hisseye dayanıyor.")
        if near_hi and a50 >= 0.60:
            pos.append("Endeks zirveye yakın ve genişlik destekliyor: yükseliş geniş tabanlı.")
        if near_lo and d50_10 > 0.05:
            pos.append("Endeks dibe yakınken genişlik iyileşiyor: satış baskısı hafifliyor olabilir.")
    score = len(pos) - len(neg)
    tone = "pos" if score > 0 else "neg" if score < 0 else "neu"
    trend = "toparlanıyor" if d50_10 >= 0.05 else "zayıflıyor" if d50_10 <= -0.05 else "yatay"
    head = f"{level(a50).capitalize()} · {trend}"
    hist = h.iloc[::5]
    if hist.index[-1] != h.index[-1]:
        hist = pd.concat([hist, h.iloc[[-1]]])
    return {
        "date": last.strftime("%Y-%m-%d"), "n": int(b["n"].iloc[-1]),
        "a50": round(a50, 4), "a200": round(a200, 4), "p50": round(pct("a50", a50), 3), "p200": round(pct("a200", a200), 3),
        "d50_10": round(d50_10, 4), "d50_20": round(d50_20, 4), "d200_20": round(d200_20, 4),
        "med50": round(float(h["a50"].median()), 4), "med200": round(float(h["a200"].median()), 4),
        "lvl50": level(a50), "lvl200": level(a200), "head": head, "tone": tone, "pos": pos, "neg": neg,
        "hist": [[d.strftime("%Y-%m-%d"), round(float(r.a50), 3), round(float(r.a200), 3)] for d, r in hist.iterrows()],
    }


def compute(prices: dict[str, pd.DataFrame], tiers: dict[str, str | None], idx: pd.DataFrame | None = None) -> dict | None:
    b = series(prices, tiers)
    if len(b) < 30:
        return None
    xi = None
    if idx is not None:
        xi = idx["Close"].copy()
        xi.index = xi.index.tz_localize(None) if getattr(xi.index, "tz", None) is not None else xi.index
    return interpret(b, xi)
