"""Morning star sinyal modülü testleri. Çalıştırma: python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import signals as S  # noqa: E402


def base(n=80, vol=2e6):
    """Yatay seyreden, likit örnek hisse (fiyat ~100, günlük hacim 2 mn adet → ~200 mn TL)."""
    rng = np.random.default_rng(1)
    c = 100 + np.cumsum(rng.normal(0, 0.3, n))
    o = c + rng.normal(0, 0.2, n)
    h = np.maximum(o, c) + 0.5
    lo = np.minimum(o, c) - 0.5
    return pd.DataFrame({"Open": o, "High": h, "Low": lo, "Close": c, "Volume": np.full(n, vol)},
                        index=pd.bdate_range("2024-01-01", periods=n))


def with_star(df, t, big_vol=False):
    """t gününde tamamlanan bir morning star yerleştir (1. mum t-2, doji t-1, teyit t)."""
    d = df.copy()
    p = float(d["Close"].iloc[t - 3])
    rows = {t - 2: (p, p + 0.3, p - 4.3, p - 4.0),          # sert kırmızı (gövde 4, ATR ~1–1,5)
            t - 1: (p - 4.1, p - 3.6, p - 4.6, p - 4.0),     # doji (gövde 0,1)
            t: (p - 3.9, p + 1.2, p - 4.0, p + 1.0)}         # yeşil, 1. mumun tepesi (p+0,3) üstünde kapanış
    for i, (o, h, lo, c) in rows.items():
        d.iloc[i, [0, 1, 2, 3]] = [o, h, lo, c]
    if big_vol:
        d.iloc[t, 4] = d["Volume"].iloc[t - 20:t].mean() * 3
    return d


def bars(rows):
    a = np.array(rows, dtype=float)
    return {"o": a[:, 0], "h": a[:, 1], "l": a[:, 2], "c": a[:, 3], "idx": pd.bdate_range("2026-01-01", periods=len(a))}


class PatternTest(unittest.TestCase):
    def test_detects_star(self):
        df = with_star(base(), 60)
        F = S.frame(df)
        sig = S.pattern_at(F, 60)
        self.assertIsNotNone(sig)
        self.assertAlmostEqual(sig["entry"], df["Close"].iloc[60])
        self.assertAlmostEqual(sig["stop"], df["Low"].iloc[58:61].min() * (1 - S.STOP_BUF))
        self.assertIsNone(S.pattern_at(F, 59))

    def test_rules(self):
        df = with_star(base(), 60)
        # Ş5: teyit mumu 1. mumun tepesinin altında kapanırsa formasyon yok
        d = df.copy(); d.iloc[60, 3] = d["High"].iloc[58] - 0.05; d.iloc[60, 1] = d.iloc[60, 3] + 0.1
        self.assertIsNone(S.pattern_at(S.frame(d), 60))
        # Ş2: 2. mumun gövdesi büyükse (doji değil) formasyon yok
        d = df.copy(); d.iloc[59, 0] = d["Close"].iloc[59] + 2.0; d.iloc[59, 1] = d.iloc[59, 0] + 0.2
        self.assertIsNone(S.pattern_at(S.frame(d), 60))
        # Likidite: hacim çok düşükse yok
        self.assertIsNone(S.pattern_at(S.frame(with_star(base(vol=100), 60)), 60))

    def test_overhead_fvg_blocks(self):
        df = with_star(base(), 60)
        self.assertIsNotNone(S.pattern_at(S.frame(df), 60))
        d = df.copy()
        # 1. mumdan ~10 mum önce, girişin çok üstünde doldurulmamış bir düşüş boşluğu oluştur
        for i in range(45, 49):
            d.iloc[i, [0, 1, 2, 3]] = [130, 131, 129, 130]
        d.iloc[49, [0, 1, 2, 3]] = [130, 130.5, 120, 121]   # sert düşüş
        for i in range(50, 57):
            d.iloc[i, [0, 1, 2, 3]] = [110, 110.5, 109.5, 110]
        # i=50: en yüksek (110,5) < 48. mumun en düşüğü (129) → boşluk [110,5, 129]; girişin (~101) üstünde, doldurulmamış
        F = S.frame(d)
        self.assertIsNotNone(S.overhead_fvg(F, 60))
        self.assertIsNone(S.pattern_at(F, 60))

    def test_no_lookahead(self):
        df = with_star(base(120), 60)
        full = S.frame(df)
        for t in range(59, 119):  # frame en az 60 gün ister
            a, b = S.pattern_at(full, t), S.pattern_at(S.frame(df.iloc[:t + 1]), t)
            self.assertEqual(a is None, b is None, t)
            if a:
                self.assertAlmostEqual(a["stop"], b["stop"])

    def test_volume_ratio(self):
        sig = S.pattern_at(S.frame(with_star(base(), 60, big_vol=True)), 60)
        self.assertGreater(sig["volx"], 2.5)


class SimulateTest(unittest.TestCase):
    def r(self, rows, R=3):
        return S.simulate(bars([(100, 100, 100, 100)] + rows), 0, 100.0, 95.0, R)

    def test_target_and_stop(self):
        x = self.r([(100, 104, 99, 103), (103, 116, 102, 112)])
        self.assertEqual(x["status"], "tp")
        self.assertAlmostEqual(x["r"], 3 - S.COST * 100 / 5)
        x = self.r([(100, 101, 94, 96)])
        self.assertEqual(x["status"], "stop")
        self.assertAlmostEqual(x["r"], -1 - S.COST * 100 / 5)

    def test_same_bar_is_stop(self):
        self.assertEqual(self.r([(100, 130, 90, 100)])["status"], "stop")

    def test_five_r(self):
        self.assertEqual(self.r([(100, 116, 99, 112)], R=5)["status"], "open")
        self.assertEqual(self.r([(100, 126, 99, 120)], R=5)["status"], "tp")

    def test_open_and_time(self):
        self.assertEqual(self.r([(100, 102, 99, 101)] * 5)["status"], "open")
        x = self.r([(100, 102, 99, 101)] * (S.HOLD_MAX + 3))
        self.assertEqual(x["status"], "time")
        self.assertEqual(x["exit_t"], S.HOLD_MAX)


class AccountTest(unittest.TestCase):
    def test_sizing_and_limits(self):
        d = pd.bdate_range("2024-01-01", periods=30)
        win = {"d0": d[0], "d1": d[5], "pct": 0.10, "rp": 0.05}
        lose = {"d0": d[6], "d1": d[8], "pct": -0.05, "rp": 0.05}
        a = S.account([win, lose], capital=100_000, risk=0.01, max_pos=10)
        self.assertEqual(a["taken"], 2)
        self.assertAlmostEqual(a["final"], 100_000 * 1.02 * 0.99, delta=2)
        self.assertIsNone(S.account([]))

    def test_no_lookahead_in_selection(self):
        d = pd.bdate_range("2024-01-01", periods=30)
        long_win = {"d0": d[0], "d1": d[20], "pct": 0.20, "rp": 1.0, "sym": "AAA"}
        quick_loss = {"d0": d[0], "d1": d[1], "pct": -0.05, "rp": 1.0, "sym": "ZZZ"}
        a = S.account([quick_loss, long_win], capital=100_000, risk=0.5, max_pos=1)
        self.assertAlmostEqual(a["final"], 100_000 + 50_000 * 0.20, delta=2)


class RunTest(unittest.TestCase):
    def test_run_structure(self):
        prices = {"AAA": with_star(base(300), 200), "BBB": with_star(base(300), 150), "CCC": base(300)}
        R = S.run(prices, {"AAA": "30", "BBB": "TÜM", "CCC": None})
        self.assertEqual(set(R["stats"]), set(S.TIER_SETS))
        self.assertEqual(R["stats"]["BIST 30"]["3"]["n"], 1)      # yalnızca AAA
        self.assertEqual(R["stats"]["BIST TÜM"]["3"]["n"], 2)     # AAA + BBB
        self.assertIn("BIST 100", R["accounts"])
        self.assertTrue(all(a["idx"] in ("30", "TÜM") for a in R["active"] + R["recent"]))


if __name__ == "__main__":
    unittest.main()
