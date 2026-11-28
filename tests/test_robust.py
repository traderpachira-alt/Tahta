"""Sağlamlık ölçüleri ve piyasa kademesi."""
import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import robust as RB  # noqa: E402


class RobustTest(unittest.TestCase):
    def test_tail_dependent(self):
        # 95 işlem −1R, 5 işlem +40R: ortalama artıda ama uçlar atılınca eksi → "fragile"
        r = [-1.0] * 95 + [40.0] * 5
        x = RB.robustness(r, [2025] * 100)
        self.assertGreater(x["mean"], 0)
        self.assertLess(x["tm"], 0)
        self.assertEqual(x["profile"], "fragile")
        self.assertEqual(x["big"]["2025"], 5)
        self.assertEqual(x["ex3"], round(sum(r) - 120, 1))
        self.assertEqual(sum(x["hist"]), 100)

    def test_balanced_and_tail(self):
        self.assertEqual(RB.robustness([0.5] * 60 + [-1.0] * 40, [2024] * 100)["profile"], "balanced")
        r = [-1.0] * 60 + [1.5] * 30 + [6.0] * 10
        self.assertEqual(RB.robustness(r, [2024] * 100)["profile"], "tail")

    def test_too_few(self):
        self.assertIsNone(RB.robustness([1.0] * 5, [2024] * 5))

    def test_levels(self):
        self.assertEqual([RB.level(x) for x in (0.05, 0.25, 0.39, 0.5, 0.6, 0.9)], [1, 2, 2, 3, 4, 5])
        self.assertIsNone(RB.level(float("nan")))
        a200 = pd.Series([0.1, 0.5, 0.8], index=pd.to_datetime(["2026-01-02", "2026-01-05", "2026-01-06"]))
        f = RB.level_lookup(a200)
        self.assertEqual(f(pd.Timestamp("2026-01-05 13:30")), 3)   # 4 saatlik mum o günün kademesini alır
        self.assertEqual(f(pd.Timestamp("2026-01-03")), 1)         # tatil: önceki gün
        st = RB.by_level([{"d0": pd.Timestamp("2026-01-02"), "r": -1.0}, {"d0": pd.Timestamp("2026-01-06"), "r": 2.0}], f)
        self.assertEqual([(x["lvl"], x["n"]) for x in st], [(1, 1), (2, 0), (3, 0), (4, 0), (5, 1)])


if __name__ == "__main__":
    unittest.main()
