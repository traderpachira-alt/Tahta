"""Skor hesaplarının testleri. Çalıştırma: python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import scores  # noqa: E402


def fin_xi(**over):
    """12 çeyreklik örnek sanayi şirketi: her yıl büyüyen, kârlı, borcu azalan (kümülatif gelir kalemleri)."""
    periods = {}
    for y in (2024, 2025, 2026):
        g = {2024: 1.0, 2025: 1.3, 2026: 1.6}[y]
        for q, m in enumerate((3, 6, 9, 12), 1):
            if (y, m) > (2026, 9):
                continue
            k = q / 4
            periods[f"{y}/{m}"] = {
                "rev": 1000 * g * k, "gross": 300 * g * k * (1 + (y - 2024) * 0.05), "op": 200 * g * k, "dep": -50 * g * k,
                "net": 120 * g * k, "cfo": 180 * g * k, "capex": -60 * g * k, "div": -40 * g * k if m >= 6 else 0,
                "capInc": 0.0,
                "assets": 2000 * (1 + (y - 2024) * 0.1), "curA": 900 * g, "curL": 600 * (1 + (y - 2024) * 0.1),
                "eq": 1200 * g, "debtS": 100, "debtL": 300 - (y - 2024) * 80, "cash": 150 * g, "fininv": 0,
            }
    for k, v in over.items():
        for p in periods.values():
            p[k] = v
    return {"group": "XI_29", "periods": periods}


class FinTest(unittest.TestCase):
    def test_ttm_and_quarter(self):
        F = scores.Fin(fin_xi())
        self.assertEqual(F.latest, (2026, 9))
        # TTM(2026/9) = 2026/9 + 2025/12 − 2025/9
        self.assertAlmostEqual(F.ttm(2026, 9, "net"), 120 * 1.6 * 0.75 + 120 * 1.3 - 120 * 1.3 * 0.75)
        self.assertAlmostEqual(F.quarter(2026, 9, "rev"), 1000 * 1.6 * 0.25)
        self.assertAlmostEqual(F.quarter(2026, 3, "rev"), 1000 * 1.6 * 0.25)
        self.assertIsNone(F.ttm(2024, 9, "net"))  # 2023 verisi yok
        self.assertEqual(F.quarters(3), [(2026, 3), (2026, 6), (2026, 9)])


class PiotroskiTest(unittest.TestCase):
    def test_healthy_company_scores_high(self):
        r = scores.piotroski(fin_xi())
        self.assertEqual(len(r["fItems"]), 9)
        self.assertEqual(r["fItems"][0], 1)      # ROA > 0
        self.assertEqual(r["fItems"][1], 1)      # CFO > 0
        self.assertEqual(r["fItems"][3], 1)      # CFO > net
        self.assertEqual(r["fItems"][4], 1)      # uzun vadeli borç/varlık azaldı
        self.assertEqual(r["fItems"][6], 1)      # bedelli artırım yok
        self.assertEqual(r["fItems"][7], 1)      # brüt marj arttı
        self.assertGreaterEqual(r["fScore"], 7)

    def test_equity_issue_and_losses(self):
        f = fin_xi(capInc=500.0)
        for p in f["periods"].values():
            p["net"] = -abs(p["net"])
            p["cfo"] = -abs(p["cfo"])
        r = scores.piotroski(f)
        self.assertEqual(r["fItems"][0], 0)
        self.assertEqual(r["fItems"][1], 0)
        self.assertEqual(r["fItems"][6], 0)

    def test_banks_and_missing(self):
        self.assertIsNone(scores.piotroski({"group": "UFRS", "periods": {"2026/9": {"net": 1}}})["fScore"])
        self.assertIsNone(scores.piotroski(None)["fScore"])
        f = fin_xi()
        for p in f["periods"].values():
            for k in ("assets", "curA", "curL", "gross"):
                p.pop(k)
        self.assertIsNone(scores.piotroski(f)["fScore"])  # 2'den fazla kriter eksik


class SafetyTest(unittest.TestCase):
    base = {"payout": 0.35, "roe": 0.30, "fScore": 9, "divYears5": 5, "divStreak": 6,
            "divByYear": {2022: 1, 2023: 1.2, 2024: 1.5, 2025: 2.0, 2026: 2.2}, "curYear": 2026, "divPaid12": 2.2, "paid12": 100}

    def parts(self, r):
        return {k: (p, mx) for k, p, mx, _ in r["dsParts"]}

    def test_strong_payer(self):
        r = scores.dividend_safety(fin_xi(), self.base)
        p = self.parts(r)
        self.assertEqual(p["payout"][0], 20)
        self.assertEqual(p["continuity"][0], 15)
        self.assertEqual(p["cuts"][0], 10)
        self.assertEqual(p["roe"][0], 10)
        self.assertEqual(p["fscore"][0], 10)
        self.assertGreaterEqual(r["dsScore"], 85)

    def test_high_payout_cut_and_losses(self):
        d = dict(self.base, payout=1.4, roe=0.02, fScore=2, divYears5=2, divStreak=1,
                 divByYear={2023: 2.0, 2024: 1.0, 2025: 0.5, 2026: 0.5})
        r = scores.dividend_safety(fin_xi(), d)
        p = self.parts(r)
        self.assertEqual(p["payout"][0], 0)
        self.assertEqual(p["cuts"][0], 0)       # 2024 ve 2025'te kesinti
        self.assertEqual(p["continuity"][0], 4)
        self.assertLess(r["dsScore"], 50)

    def test_loss_while_paying_dividend(self):
        f = fin_xi()
        for p in f["periods"].values():
            p["net"] = -10.0
        r = scores.dividend_safety(f, dict(self.base, payout=None))
        self.assertEqual(self.parts(r)["payout"][0], 0)

    def test_bank_rescaled(self):
        bank = {"group": "UFRS", "periods": {"2026/9": {"net": 10, "eq": 50}}}
        r = scores.dividend_safety(bank, self.base)
        p = self.parts(r)
        self.assertIsNone(p["fcfCover"][0])
        self.assertIsNone(p["leverage"][0])
        self.assertIsNone(p["fscore"][0])
        self.assertEqual(r["dsScore"], 100)     # bankada uygulanabilir 55 puanın tamamı → 100'e ölçeklenir

    def test_too_little_data(self):
        r = scores.dividend_safety(None, {"divYears5": 3})
        self.assertIsNone(r["dsScore"])

    def test_fcf_coverage_steps(self):
        p = self.parts(scores.dividend_safety(fin_xi(), dict(self.base, paid12=10)))
        self.assertEqual(p["fcfCover"][0], 20)  # bol karşılama
        p = self.parts(scores.dividend_safety(fin_xi(), dict(self.base, paid12=1e6)))
        self.assertEqual(p["fcfCover"][0], 0)


class YieldBandTest(unittest.TestCase):
    def test_band(self):
        idx = pd.bdate_range("2021-01-01", "2025-12-31")
        close = pd.Series(100.0, index=idx)
        close[idx >= "2025-06-01"] = 50.0       # fiyat yarıya indi → verim tarihin en yükseğinde
        div = pd.Series(0.0, index=idx)
        for y in range(2021, 2026):
            div[idx[idx >= f"{y}-05-01"][0]] = 5.0
        r = scores.yield_band(pd.DataFrame({"Close": close, "Dividends": div}))
        self.assertAlmostEqual(r["ttmYield"], 0.10)
        self.assertGreater(r["yieldPct"], 0.85)
        self.assertAlmostEqual(r["yieldMed"], 0.05, places=3)

    def test_market_relative(self):
        idx = pd.bdate_range("2021-01-01", "2025-12-31")
        # Piyasanın tamamı ucuzladı: hisse verimi 2 katına çıktı ama piyasa verimi de 2 katı → göreli dilim yükselmez
        close = pd.Series(100.0, index=idx)
        close[idx >= "2025-06-01"] = 50.0
        div = pd.Series(0.0, index=idx)
        for y in range(2021, 2026):
            div[idx[idx >= f"{y}-05-01"][0]] = 5.0
        df = pd.DataFrame({"Close": close, "Dividends": div})
        mkt = scores.ttm_yield_series(df)
        r = scores.yield_band(df, mkt)
        self.assertGreater(r["yieldPctAbs"], 0.85)   # mutlak: tarihin zirvesi
        self.assertLess(r["yieldPct"], 0.2)          # piyasaya göre: olağan
        self.assertAlmostEqual(r["yieldRel"], 1.0)
        # Piyasa sabitken hisse ucuzladı → göreli dilim de yüksek
        r2 = scores.yield_band(df, mkt.where(mkt.index < "2025-06-01", mkt.shift(1).where(mkt.index < "2025-06-01")).ffill())
        self.assertGreater(r2["yieldPct"], 0.85)

    def test_market_yield_median(self):
        idx = pd.bdate_range("2021-01-01", "2025-12-31")
        dfs = {}
        for i in range(25):
            div = pd.Series(0.0, index=idx)
            for y in range(2021, 2026):
                div[idx[idx >= f"{y}-05-01"][0]] = 1.0 + i * 0.1
            dfs[f"S{i}"] = pd.DataFrame({"Close": 100.0, "Dividends": div}, index=idx)
        m = scores.market_yield(dfs)
        self.assertAlmostEqual(m.iloc[-1], 0.022)     # 25 hissenin ortancası: (1 + 12×0,1) / 100
        self.assertIsNone(scores.market_yield({k: dfs[k] for k in list(dfs)[:5]}))  # yeterli hisse yok

    def test_needs_history(self):
        idx = pd.bdate_range("2025-01-01", "2025-12-31")
        df = pd.DataFrame({"Close": np.full(len(idx), 10.0), "Dividends": 0.0}, index=idx)
        self.assertIsNone(scores.yield_band(df)["yieldPct"])


class StatementsTest(unittest.TestCase):
    def test_rows(self):
        st = scores.statements(fin_xi())
        self.assertEqual(st["q"][-1], "2026/9")
        self.assertEqual(len(st["q"]), 8)
        self.assertEqual(st["y"], [2024, 2025])
        rows = {r[0]: r for r in st["rows"]}
        self.assertAlmostEqual(rows["rev"][3][-1], 400)            # 2026/3. çeyrek tek başına
        self.assertAlmostEqual(rows["fcf"][4][-1], (180 - 60) * 1.3)  # 2025 yıllık
        self.assertAlmostEqual(rows["nm"][3][-1], 0.12, places=4)
        self.assertIsNone(scores.statements(None))


if __name__ == "__main__":
    unittest.main()


class FinPlanTest(unittest.TestCase):
    """Mali tablo yenileme planı: son çeyreği olan atlanır, eksik olana tek istekle bakılır."""
    def test_plan(self):
        import datetime as dt
        import isyatirim as IY
        today = dt.date(2026, 11, 22)
        periods = IY.recent_periods(today)            # en yeni: 2026/9
        now = 1_000_000_000.0
        day = 86400
        fin = {
            "HAVE": {"v": IY.SCHEMA, "_ts": now - 2 * day, "periods": {"2026/9": {"net": 1}}},           # güncel → atla
            "MISS": {"v": IY.SCHEMA, "_ts": now - 2 * day, "group": "XI_29", "periods": {"2026/6": {"net": 1}}},  # yeni çeyrek yok → kontrol
            "NODATA": {"v": IY.SCHEMA, "_ts": now - 2 * day, "group": None, "periods": {}},              # hiç veri yok, 2 gün önce bakıldı → atla
            "JUST": {"v": IY.SCHEMA, "_ts": now - 2 * day, "_chk": now - 3600, "periods": {"2026/6": {}}},  # bugün kontrol edildi → atla
            "OLDV": {"v": IY.SCHEMA - 1, "_ts": now - day, "periods": {}},                              # eski şema → tam
            "STALE": {"v": IY.SCHEMA, "_ts": now - 200 * day, "periods": {"2026/9": {"net": 1}}},       # 120 günü geçti → tam
        }
        P = IY.plan(fin, ["HAVE", "MISS", "JUST", "OLDV", "NEW", "STALE", "NODATA"], periods, now, today)
        self.assertEqual(P, [("OLDV", "full"), ("NEW", "full"), ("MISS", "probe"), ("STALE", "full")])
