"""Eksik son gün koruması: Yahoo hisselerin son mumunu (endeksinki gelmişken) vermezse tekrar dene, düzelmezse yayınlama."""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_data as fd  # noqa: E402


def frame(end: str, n: int = 40) -> pd.DataFrame:
    idx = pd.bdate_range(end=end, periods=n)
    c = np.linspace(10, 11, n)
    return pd.DataFrame({"Open": c, "High": c, "Low": c, "Close": c, "Volume": 1e6, "Dividends": 0.0}, index=idx)


class StaleTest(unittest.TestCase):
    def prices(self, n_old: int, n_new: int) -> dict:
        p = {fd.INDEX: frame("2026-11-25")}
        p.update({f"O{i}": frame("2026-11-24") for i in range(n_old)})
        p.update({f"N{i}": frame("2026-11-25") for i in range(n_new)})
        return p

    def test_few_lagging_is_fine(self):
        p = self.prices(2, 18)
        calls = []
        out = fd.refresh_lagging(p, lambda syms: calls.append(syms) or {}, sleep=lambda w: None)
        self.assertIs(out, p)
        self.assertEqual(calls, [])

    def test_retry_fixes_missing_day(self):
        p = self.prices(15, 5)
        out = fd.refresh_lagging(p, lambda syms: {s: frame("2026-11-25") for s in syms}, sleep=lambda w: None)
        self.assertEqual(fd.lagging(out), [])

    def test_still_missing_raises(self):
        p = self.prices(15, 5)
        calls = []
        with self.assertRaises(fd.StaleData):
            fd.refresh_lagging(p, lambda syms: calls.append(len(syms)) or {}, sleep=lambda w: None)
        self.assertEqual(calls, [15, 15])

    def test_reference_is_index(self):
        # birkaç hissede daha yeni (ör. seans içi) mum olması diğerlerini "geride" yapmaz; ölçü endeksin son günü
        p = {fd.INDEX: frame("2026-11-25"), "A": frame("2026-11-26"), **{f"B{i}": frame("2026-11-25") for i in range(9)}}
        self.assertEqual(fd.lagging(p), [])


if __name__ == "__main__":
    unittest.main()
