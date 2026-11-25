import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import corpact as C  # noqa: E402


def frame(close, opens=None, start="2024-01-01"):
    c = np.asarray(close, dtype=float)
    o = np.asarray(opens if opens is not None else np.r_[c[0], c[:-1]], dtype=float)
    return pd.DataFrame({"Open": o, "High": np.maximum(o, c) * 1.01, "Low": np.minimum(o, c) * 0.99, "Close": c,
                         "Volume": np.full(len(c), 1000.0), "Dividends": np.zeros(len(c))}, index=pd.bdate_range(start, periods=len(c)))


class CorpActTest(unittest.TestCase):
    def test_bonus_issue_adjusted(self):
        # %100 bedelsiz: 100 → açılış 50, kapanış 51
        c = [100.0] * 20 + [51.0] + [51.0] * 10
        o = list(np.r_[c[0], c[:-1]]); o[20] = 50.0
        df = frame(c, o)
        df.iloc[5, df.columns.get_loc("Dividends")] = 2.0
        P = {"AAA": df}
        out = C.adjust_all(P)
        a = P["AAA"]
        self.assertEqual(out["n_events"], 1)
        self.assertAlmostEqual(a["Close"].iloc[19], 50.0)                    # 100 × 0,5
        self.assertAlmostEqual(a["Volume"].iloc[19], 2000.0)
        self.assertAlmostEqual(a["Dividends"].iloc[5], 1.0)
        self.assertAlmostEqual(a["Stock Splits"].iloc[20], 2.0)
        self.assertAlmostEqual(a["Close"].iloc[25], 51.0)                    # sonrası değişmez
        self.assertLess(abs(a["Close"].pct_change()).max(), 0.11)

    def test_normal_limit_moves_untouched(self):
        c = [100.0 * 1.1 ** k for k in range(10)] + [150.0] * 10              # art arda tavanlar (%10)
        P = {"AAA": frame(c)}
        self.assertEqual(C.adjust_all(P)["n_events"], 0)

    def test_bad_open_alone_ignored(self):
        c = [100.0] * 30
        o = list(c); o[15] = 40.0                                            # bozuk açılış, kapanış normal
        P = {"AAA": frame(c, o)}
        self.assertEqual(C.adjust_all(P)["n_events"], 0)

    def test_cluster_is_suspicious(self):
        c = [100.0] * 10 + [50.0] * 3 + [100.0] * 10                         # iki gün arayla ters sıçramalar
        P = {"AAA": frame(c, c)}                                             # açılış = kapanış (boşlukla açılış)
        out = C.adjust_all(P)
        self.assertEqual(out["n_events"], 0)
        self.assertEqual(len(out["suspicious"]["AAA"]), 2)

    def test_market_wide_day_ignored(self):
        P = {}
        for k in range(6):
            c = [100.0] * 10 + [130.0] * 10                                  # aynı gün 6 hissede boşluk
            P[f"S{k}"] = frame(c, c)
        out = C.adjust_all(P)
        self.assertEqual(out["n_events"], 0)
        self.assertEqual(len(out["wide"]), 1)


if __name__ == "__main__":
    unittest.main()
