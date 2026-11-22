"""Piyasa genişliği: oranlar ve yorum kuralları. Çalıştırma: python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import breadth as B  # noqa: E402


def frame(a50, a200):
    idx = pd.bdate_range("2023-01-02", periods=len(a50))
    return pd.DataFrame({"a50": a50, "a200": a200, "n": 300}, index=idx)


class BreadthTest(unittest.TestCase):
    def test_series(self):
        idx = pd.bdate_range("2022-01-03", periods=260)
        up = pd.DataFrame({"Close": np.linspace(10, 20, 260)}, index=idx)
        down = pd.DataFrame({"Close": np.linspace(20, 10, 260)}, index=idx)
        prices = {f"U{i}": up for i in range(60)} | {f"D{i}": down for i in range(40)}
        b = B.series(prices, {k: "TÜM" for k in prices})
        self.assertAlmostEqual(b["a50"].iloc[-1], 0.6)
        self.assertAlmostEqual(b["a200"].iloc[-1], 0.6)

    def test_negative_reading(self):
        n = 400
        a50 = np.r_[np.full(n - 10, 0.5), np.linspace(0.45, 0.08, 10)]
        a200 = np.r_[np.full(n - 20, 0.5), np.linspace(0.45, 0.15, 20)]
        r = B.interpret(frame(a50, a200))
        self.assertEqual(r["tone"], "neg")
        self.assertEqual(r["lvl50"], "çok zayıf")
        self.assertTrue(any("Panik" in x for x in r["neg"]))
        self.assertTrue(any("tabana yayılıyor" in x for x in r["neg"]))

    def test_positive_reading_after_bottom(self):
        n = 400
        a50 = np.r_[np.full(n - 20, 0.45), np.linspace(0.12, 0.10, 10), np.linspace(0.12, 0.55, 10)]
        a200 = np.r_[np.full(n - 20, 0.4), np.linspace(0.30, 0.42, 20)]
        r = B.interpret(frame(a50, a200))
        self.assertEqual(r["tone"], "pos")
        self.assertTrue(any("Dipten dönüş" in x for x in r["pos"]))
        self.assertTrue(any("yarıdan fazlası yeniden" in x for x in r["pos"]))
        self.assertTrue(any("hızla artıyor" in x for x in r["pos"]))
        self.assertIn("toparlanıyor", r["head"])

    def test_overheat_is_flagged(self):
        r = B.interpret(frame(np.full(300, 0.9), np.full(300, 0.8)))
        self.assertTrue(any("Aşırı ısınma" in x for x in r["neg"]))
        self.assertTrue(any("sağlıklı" in x for x in r["pos"]))


if __name__ == "__main__":
    unittest.main()
