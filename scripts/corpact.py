"""Düzeltilmemiş kurumsal işlemler (bedelsiz / bedelli sermaye artırımı, bölünme, birleşme, sermaye azaltımı).

Yahoo, BIST'teki bedelsiz sermaye artırımlarının çoğunu fiyatlara yansıtmıyor: fiyat bir günde bölünme oranında düşmüş
görünüyor. BIST'te açılış fiyatı da önceki kapanışın ±%10'u ile sınırlı olduğu için, açılışın önceki kapanıştan %11'den fazla
farklı olduğu bir gün normal işlemle oluşamaz: kurumsal işlem sayılır ve o günden önceki fiyatlar açılış oranıyla (açılış /
önceki kapanış) geriye doğru düzeltilir. Oran, işlem gününün "baz fiyat"ına en yakın gözlemdir (açılış bazdan en fazla ±%10
sapabilir).

Güvenlik:
  - kapanış da aynı yönde %11'den fazla değişmiş olmalı (bozuk tek bir açılış değeri düzeltme yaptırmasın)
  - aynı gün WIDE_MIN ya da daha fazla hissede görülen boşluk piyasa geneli sayılır (ör. deprem sonrası açılış; Yahoo'daki
    eksik günler) ve düzeltilmez
  - bir hissede CLUSTER işlem günü içinde birden fazla boşluk varsa veri hatası sayılır, düzeltilmez, raporlanır
Düzeltme: o günden önceki Open/High/Low/Close × oran, Volume ÷ oran, Dividends × oran; "Stock Splits" sütununa 1/oran yazılır
(Yahoo'nun bölünme biçimi; temettü eşleştirmesi bu sütunu kullanır).
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import pandas as pd

GAP = 0.11        # açılış ve kapanışın önceki kapanıştan en az bu kadar sapması (BIST fiyat sınırı %10)
WIDE_MIN = 5      # aynı gün bu kadar ya da daha fazla hissede → piyasa geneli, düzeltilmez
CLUSTER = 10      # bir hissede bu kadar işlem günü içinde birden çok boşluk → veri hatası, düzeltilmez


def _raw(df: pd.DataFrame) -> list[tuple[int, pd.Timestamp, float]]:
    o, c = df["Open"].to_numpy(float), df["Close"].to_numpy(float)
    out = []
    for t in range(1, len(c)):
        p = c[t - 1]
        if not (p > 0 and o[t] > 0 and np.isfinite(p) and np.isfinite(o[t])):
            continue
        g, cc = o[t] / p - 1, c[t] / p - 1
        if abs(g) > GAP and abs(cc) > GAP and np.sign(g) == np.sign(cc):
            out.append((t, df.index[t], float(o[t] / p)))
    return out


def detect(prices: dict[str, pd.DataFrame]) -> tuple[dict, dict, list]:
    """Döner: (olaylar {kod: [(tarih, oran)]}, şüpheli {kod: [tarih]}, piyasa geneli günler [tarih])."""
    raw = {s: _raw(df) for s, df in prices.items() if {"Open", "Close"} <= set(df.columns)}
    day = lambda ts: pd.Timestamp(ts).strftime("%Y-%m-%d")  # noqa: E731
    counts = Counter(day(ts) for v in raw.values() for _, ts, _ in v)
    wide = sorted(d for d, n in counts.items() if n >= WIDE_MIN)
    events, suspicious = {}, {}
    for s, v in raw.items():
        v = [e for e in v if day(e[1]) not in wide]
        for t, ts, f in v:
            if any(u != t and abs(u - t) <= CLUSTER for u, _, _ in v):
                suspicious.setdefault(s, []).append(day(ts))
            else:
                events.setdefault(s, []).append((ts, f))
    return events, suspicious, wide


def apply(df: pd.DataFrame, events: list[tuple[pd.Timestamp, float]]) -> pd.DataFrame:
    """Olaylardan önceki fiyatları oranla geriye doğru düzelt (en yeni olaydan eskiye doğru birikimli)."""
    if not events:
        return df
    df = df.copy()
    fac = np.ones(len(df))
    split = np.zeros(len(df))
    for ts, f in events:
        k = df.index.get_loc(ts)
        fac[:k] *= f
        split[k] = 1.0 / f
    for col in ("Open", "High", "Low", "Close"):
        if col in df.columns:
            df[col] = df[col].to_numpy(float) * fac
    if "Volume" in df.columns:
        df["Volume"] = df["Volume"].to_numpy(float) / fac
    if "Dividends" in df.columns:
        df["Dividends"] = df["Dividends"].to_numpy(float) * fac
    old = df["Stock Splits"].to_numpy(float) if "Stock Splits" in df.columns else np.zeros(len(df))
    df["Stock Splits"] = np.where(split > 0, np.where(old > 0, old * split, split), old)
    return df


def adjust_all(prices: dict[str, pd.DataFrame]) -> dict:
    """prices sözlüğünü yerinde düzeltir. Döner: özet {events, suspicious, wide, n_stocks, n_events}."""
    events, suspicious, wide = detect(prices)
    for s, ev in events.items():
        prices[s] = apply(prices[s], ev)
    return {"events": {s: [(pd.Timestamp(t).strftime("%Y-%m-%d"), round(f, 4)) for t, f in v] for s, v in events.items()},
            "suspicious": suspicious, "wide": wide, "n_stocks": len(events), "n_events": sum(len(v) for v in events.values())}
