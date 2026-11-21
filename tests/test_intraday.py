"""4 saatlik mum dönüşümü testleri. Çalıştırma: python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import intraday  # noqa: E402


def hourly(days, price=100.0, split_day=None, ratio=2.0):
    rows, idx = [], []
    for d in pd.bdate_range("2025-01-01", periods=days):
        f = ratio if split_day is not None and d < split_day else 1.0   # bölünme öncesi düzeltilmemiş (2 kat) fiyat
        for k, hh in enumerate([9, 10, 11, 12, 13, 14, 15, 16, 17]):
            p = (price + k) * f
            rows.append((p, p + 0.5 * f, p - 0.5 * f, p + 0.2 * f, 1000.0 / f))
            idx.append(pd.Timestamp(d.year, d.month, d.day, hh, 30, tz="Europe/Istanbul"))
    return pd.DataFrame(rows, index=pd.DatetimeIndex(idx), columns=["Open", "High", "Low", "Close", "Volume"])


def daily_of(h_adj):
    d = h_adj.copy()
    d.index = d.index.tz_localize(None).normalize()
    g = d.groupby(level=0).agg(Open=("Open", "first"), High=("High", "max"), Low=("Low", "min"), Close=("Close", "last"), Volume=("Volume", "sum"))
    return g


class H4Test(unittest.TestCase):
    def test_two_bars_per_day(self):
        h = hourly(40)
        g = intraday.to_h4(h, daily_of(h))
        self.assertEqual(len(g), 80)
        self.assertEqual({(t.hour, t.minute) for t in g.index}, {(13, 30), (18, 0)})
        first = g.iloc[0]
        self.assertAlmostEqual(first["Open"], 100.0)          # 09:30 çubuğunun açılışı
        self.assertAlmostEqual(first["High"], 103.5)          # 09:30–12:30 çubuklarının en yükseği
        self.assertAlmostEqual(g.iloc[1]["Close"], 108.2)     # günün son çubuğunun kapanışı

    def test_split_adjustment(self):
        split = pd.Timestamp("2025-01-20")
        adj = hourly(40)                                       # düzeltilmiş gerçek seviye
        raw = hourly(40, split_day=split)                      # bölünme öncesi günler 2 kat
        g = intraday.to_h4(raw, daily_of(adj))
        self.assertTrue(np.allclose(g["Close"].to_numpy(), intraday.to_h4(adj, daily_of(adj))["Close"].to_numpy()))

    def test_turnover_uses_previous_day(self):
        h = hourly(40)
        d = daily_of(h)
        g = intraday.to_h4(h, d)
        prev = (d["Close"] * d["Volume"]).rolling(20).mean().shift(1)
        day = g.index[-1].normalize()
        self.assertAlmostEqual(g["turn"].iloc[-1], prev.loc[day])


if __name__ == "__main__":
    unittest.main()
