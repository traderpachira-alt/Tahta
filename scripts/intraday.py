"""4 saatlik mumlar: Yahoo saatlik verisinden (son ~2 yıl) BIST seansı için günde iki mum.

- 1. mum: seans açılışından 13:30'a kadar (Yahoo saatlik çubukları 09:30–12:30 etiketli), 2. mum: 13:30'dan kapanışa.
  Mum zamanı bitiş saatiyle etiketlenir (13:30 ve 18:00).
- Saatlik veri bedelsiz/bölünmelere göre düzeltilmemiş olabilir: her günün son 4 saatlik kapanışı, düzeltilmiş günlük kapanışa
  eşitlenecek şekilde o günün tüm fiyatları çarpanla ölçeklenir (hacim ters orantılı).
- Likidite filtresi için 'turn' sütunu: ÖNCEKİ günün 20 günlük ortalama işlem hacmi (günlük veriden; ileriye bakmaz).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def _naive(idx):
    return idx.tz_localize(None) if getattr(idx, "tz", None) is not None else idx


def to_h4(h: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame | None:
    """Saatlik çubuklar (Europe/Istanbul) + düzeltilmiş günlük fiyatlar → 4 saatlik mumlar."""
    h = h.dropna(subset=["Close"])
    if len(h) < 200:
        return None
    idx = h.index.tz_convert("Europe/Istanbul") if h.index.tz is not None else h.index
    day = _naive(idx).normalize()
    half = np.where(idx.hour < 13, 0, 1)
    g = h.assign(_d=day, _h=half).groupby(["_d", "_h"]).agg(
        Open=("Open", "first"), High=("High", "max"), Low=("Low", "min"), Close=("Close", "last"), Volume=("Volume", "sum"))
    g.index = [pd.Timestamp(d) + (pd.Timedelta(hours=13, minutes=30) if k == 0 else pd.Timedelta(hours=18)) for d, k in g.index]
    dclose = daily["Close"].copy()
    dclose.index = _naive(dclose.index).normalize()
    gday = pd.Series(g.index.normalize(), index=g.index)
    last = g.groupby(g.index.normalize())["Close"].last()
    fac_by_day = (dclose.reindex(last.index) / last).ffill().bfill()
    fac = gday.map(fac_by_day).to_numpy()
    if not np.isfinite(fac).all():
        return None
    for k in ("Open", "High", "Low", "Close"):
        g[k] = g[k] * fac
    g["Volume"] = g["Volume"] / fac
    turn = (daily["Close"] * daily["Volume"]).rolling(20).mean().shift(1)
    turn.index = _naive(turn.index).normalize()
    g["turn"] = gday.map(turn).to_numpy()
    return g


def load_h4(symbols: list[str], daily: dict[str, pd.DataFrame], log=print) -> dict[str, pd.DataFrame]:
    """symbols için saatlik veriyi indirip 4 saatlik mumlara çevirir. Hata olursa boş sözlük döner."""
    import yfinance as yf

    out = {}
    for i in range(0, len(symbols), 100):  # Yahoo'yu yormamak için 100'erli gruplar
        chunk = symbols[i:i + 100]
        try:
            raw = yf.download([s + ".IS" for s in chunk], period="730d", interval="1h", auto_adjust=False,
                              progress=False, group_by="ticker", threads=True)
        except Exception as e:  # noqa: BLE001
            log(f"  saatlik veri alınamadı ({e})")
            continue
        for s in chunk:
            try:
                h = raw[s + ".IS"]
            except KeyError:
                continue
            g = to_h4(h, daily[s]) if s in daily else None
            if g is not None:
                out[s] = g
    log(f"4 saatlik mumlar: {len(out)}/{len(symbols)} hisse.")
    return out
