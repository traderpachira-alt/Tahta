"""Morning star sinyal modülü testleri. Çalıştırma: python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import signals as S  # noqa: E402
from strategies import GROUPS, REGISTRY  # noqa: E402
from strategies import morningstar as MS  # noqa: E402


def pattern_at(F, t):
    return S.signal_at(MS, F, t)


def candidate_at(F, b):
    return S.candidate_at(MS, F, b)


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
        sig = pattern_at(F, 60)
        self.assertIsNotNone(sig)
        self.assertAlmostEqual(sig["entry"], df["Close"].iloc[60])
        self.assertAlmostEqual(sig["stop"], df["Low"].iloc[58:61].min() * (1 - MS.STOP_BUF))
        self.assertIsNone(pattern_at(F, 59))

    def test_rules(self):
        df = with_star(base(), 60)
        # Ş5: teyit mumu 1. mumun tepesinin altında kapanırsa formasyon yok
        d = df.copy(); d.iloc[60, 3] = d["High"].iloc[58] - 0.05; d.iloc[60, 1] = d.iloc[60, 3] + 0.1
        self.assertIsNone(pattern_at(S.frame(d), 60))
        # Ş2: 2. mumun gövdesi büyükse (doji değil) formasyon yok
        d = df.copy(); d.iloc[59, 0] = d["Close"].iloc[59] + 2.0; d.iloc[59, 1] = d.iloc[59, 0] + 0.2
        self.assertIsNone(pattern_at(S.frame(d), 60))
        # Likidite: hacim çok düşükse yok
        self.assertIsNone(pattern_at(S.frame(with_star(base(vol=100), 60)), 60))

    def test_overhead_fvg_blocks(self):
        df = with_star(base(), 60)
        self.assertIsNotNone(pattern_at(S.frame(df), 60))
        d = df.copy()
        # 1. mumdan ~10 mum önce, girişin çok üstünde doldurulmamış bir düşüş boşluğu oluştur
        for i in range(45, 49):
            d.iloc[i, [0, 1, 2, 3]] = [130, 131, 129, 130]
        d.iloc[49, [0, 1, 2, 3]] = [130, 130.5, 120, 121]   # sert düşüş
        for i in range(50, 57):
            d.iloc[i, [0, 1, 2, 3]] = [110, 110.5, 109.5, 110]
        # i=50: en yüksek (110,5) < 48. mumun en düşüğü (129) → boşluk [110,5, 129]; girişin (~101) üstünde, doldurulmamış
        F = S.frame(d)
        self.assertIsNotNone(MS.overhead_fvg(F, 60))
        self.assertIsNone(pattern_at(F, 60))

    def test_no_lookahead(self):
        df = with_star(base(120), 60)
        full = S.frame(df)
        for t in range(59, 119):  # frame en az 60 gün ister
            a, b = pattern_at(full, t), pattern_at(S.frame(df.iloc[:t + 1]), t)
            self.assertEqual(a is None, b is None, t)
            if a:
                self.assertAlmostEqual(a["stop"], b["stop"])

    def test_volume_ratio(self):
        sig = pattern_at(S.frame(with_star(base(), 60, big_vol=True)), 60)
        self.assertGreater(sig["volx"], 2.5)


class CandidateTest(unittest.TestCase):
    def test_first_two_candles(self):
        df = with_star(base(), 60).iloc[:60]          # 1. mum (58) ve doji (59) var, 3. mum yok
        F = S.frame(df)
        cd = candidate_at(F, 59)
        self.assertIsNotNone(cd)
        self.assertAlmostEqual(cd["trig"], df["High"].iloc[58])
        self.assertAlmostEqual(cd["stop"], df["Low"].iloc[58:60].min() * (1 - MS.STOP_BUF))
        self.assertLessEqual(cd["dist"], MS.CAND_MAX_DIST)
        self.assertIsNone(cd["fvg"])
        self.assertIsNone(candidate_at(F, 58))     # tek mum: aday değil

    def test_fvg_raises_trigger(self):
        df = with_star(base(), 60).iloc[:60].copy()
        trig = df["High"].iloc[58]
        # Tetiğin biraz üstünde doldurulmamış bir düşüş FVG'si: etkin tetik boşluğun alt sınırına çıkar
        for i in range(45, 49):
            df.iloc[i, [0, 1, 2, 3]] = [trig + 8, trig + 8.5, trig + 7.5, trig + 8]
        df.iloc[49, [0, 1, 2, 3]] = [trig + 8, trig + 8, trig + 2, trig + 2.5]
        for i in range(50, 57):
            df.iloc[i, [0, 1, 2, 3]] = [trig + 0.5, trig + 1, trig, trig + 0.5]
        cd = candidate_at(S.frame(df), 59)
        self.assertIsNotNone(cd)                      # boşluk alt sınırı (tetik + 1) hâlâ %6 içinde
        self.assertAlmostEqual(cd["eff"], trig + 1)
        self.assertIsNotNone(cd["fvg"])


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

    def test_trailing_stop(self):
        c = S.COST * 100 / 5
        # +1R'ye ulaşmadan stop: başlangıç stopu
        self.assertEqual(self.r([(100, 104, 94, 95)], R="trail")["status"], "stop")
        # 106'yı gördü (+1,2R) → stop 106 − 5 = 101; ertesi gün 100,5'e indi → 101'den takip stopu
        x = self.r([(100, 106, 99, 105), (104, 104, 100.5, 101)], R="trail")
        self.assertEqual(x["status"], "trail")
        self.assertAlmostEqual(x["r"], (101 - 100) / 5 - c)
        # Gap: stopun altında açılırsa açılıştan çıkılır
        x = self.r([(100, 106, 99, 105), (98, 99, 97, 98)], R="trail")
        self.assertAlmostEqual(x["exit"], 98)
        # Sabit hedef yok: 3R'nin çok üstüne çıkabilir
        rows = [(100 + k, 101 + k, 99.5 + k, 100.5 + k) for k in range(0, 30, 2)] + [(129, 129, 120, 121)]
        x = self.r(rows, R="trail")
        self.assertEqual(x["status"], "trail")
        self.assertGreater(x["r"], 4)
        # Aynı gün içindeki zirve o günün stopunu yükseltmez (temkinli sıra)
        x = self.r([(100, 112, 100.5, 101)], R="trail")
        self.assertEqual(x["status"], "open")
        self.assertTrue(x["armed"])
        self.assertAlmostEqual(x["stop_now"], 107)

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

    def test_cash_limited_vs_unlimited(self):
        # Üç sinyal aynı gün, her biri bakiyenin %40'ı büyüklüğünde: nakitle sınırlıda üçüncüsü kaçar, sınırsızda alınır
        d = pd.bdate_range("2024-01-01", periods=30)
        T = [{"d0": d[0], "d1": d[5], "pct": 0.10, "rp": 0.025, "sym": s} for s in ("AAA", "BBB", "CCC")]
        a = S.account(T, capital=100_000, risk=0.01)
        self.assertEqual((a["taken"], a["missed"]), (2, 1))
        self.assertAlmostEqual(a["final"], 100_000 + 2 * 40_000 * 0.10, delta=2)
        self.assertEqual((a["u"]["taken"], a["u"]["missed"]), (3, 0))
        self.assertAlmostEqual(a["u"]["final"], 100_000 + 3 * 40_000 * 0.10, delta=2)
        self.assertAlmostEqual(a["u"]["maxExp"], 1.2, places=2)

    def test_balance_compounds(self):
        # Kapanan işlem bakiyeyi büyütür; sonraki işlemin 1R'si büyüyen bakiyeden hesaplanır
        d = pd.bdate_range("2024-01-01", periods=30)
        T = [{"d0": d[0], "d1": d[2], "pct": 0.10, "rp": 0.05}, {"d0": d[3], "d1": d[5], "pct": 0.10, "rp": 0.05}]
        a = S.account(T, capital=100_000, risk=0.01)
        self.assertAlmostEqual(a["final"], 100_000 * 1.02 * 1.02, delta=2)
        self.assertEqual(a["final"], a["u"]["final"])


class RunTest(unittest.TestCase):
    def test_run_structure(self):
        prices = {"AAA": with_star(base(300), 200), "BBB": with_star(base(300), 150), "CCC": base(300)}
        R = S.run(prices, {"AAA": "30", "BBB": "TÜM", "CCC": None}, MS)
        self.assertEqual(set(R["stats"]), set(S.TIER_SETS))
        self.assertEqual(R["stats"]["BIST 30"]["3"]["n"], 1)      # yalnızca AAA
        self.assertEqual(R["stats"]["BIST TÜM"]["3"]["n"], 2)     # AAA + BBB
        self.assertIn("BIST 100", R["accounts"])
        self.assertTrue(all(a["idx"] in ("30", "TÜM") for a in R["active"] + R["recent"]))
        self.assertTrue(all(a["k"] == "morningstar" for a in R["active"] + R["recent"]))


class RegistryTest(unittest.TestCase):
    """Her strateji modülü arayüzü eksiksiz uygular."""
    def test_interface(self):
        for sid, m in REGISTRY.items():
            self.assertEqual(m.ID, sid)
            for k in ("name", "group", "status", "summary", "rules", "notes"):
                self.assertIn(k, m.META, sid)
            self.assertIn(m.META["group"], GROUPS, sid)
            self.assertIn(m.META["status"], ("live", "test"), sid)
            self.assertIn(m.DEFAULT_V, m.VARIANTS, sid)
            self.assertTrue(set(m.TIMEFRAMES) <= set(S.TIMEFRAMES), sid)
            self.assertTrue(callable(m.signal) and callable(m.baseline_stop), sid)
            meta = S.meta(m)
            self.assertEqual(meta["id"], sid)

    def test_each_strategy_runs(self):
        prices = {"AAA": with_star(base(300), 200), "BBB": base(300)}
        for m in REGISTRY.values():
            R = S.run(prices, {"AAA": "30", "BBB": "100"}, m)
            self.assertEqual(set(R["stats"]), set(S.TIER_SETS))
            self.assertEqual(set(R["stats"]["BIST TÜM"]), set(m.VARIANTS))


if __name__ == "__main__":
    unittest.main()


class DonchianTest(unittest.TestCase):
    """Donchian Break: kırılım + trend + direnç/FVG filtreleri, kanal çıkışı."""
    from strategies import donchian as DC

    def trend_df(self, n=320, kick=None):
        # Düzenli yükselen, likit hisse; son bölümde yatay bant ve ardından (kick verilirse) kırılım
        rng = np.random.default_rng(3)
        c = 50 + np.arange(n) * 0.15 + rng.normal(0, 0.2, n)
        c[n - 40:n - 1] = c[n - 41] + rng.normal(0, 0.3, 39)
        if kick is not None:
            c[n - 1] = c[n - 41] + kick
        o = np.r_[c[0], c[:-1]]
        h = np.maximum(o, c) + 0.3
        lo = np.minimum(o, c) - 0.3
        return pd.DataFrame({"Open": o, "High": h, "Low": lo, "Close": c, "Volume": np.full(n, 2e6)},
                            index=pd.bdate_range("2022-01-01", periods=n))

    def test_breakout_signal(self):
        DC = self.DC
        df = self.trend_df(kick=3.0)
        F = S.frame(df)
        t = len(df) - 1
        sig = S.signal_at(DC, F, t)
        self.assertIsNotNone(sig)
        self.assertAlmostEqual(sig["entry"], df["Close"].iloc[t])
        self.assertAlmostEqual(sig["stop"], sig["entry"] - DC.ATR_STOP * F["atr"][t])
        self.assertIsNone(S.signal_at(DC, S.frame(self.trend_df(kick=0.0)), t))   # kırılım yok

    def test_trend_filter(self):
        DC = self.DC
        df = self.trend_df(kick=3.0)
        df.iloc[:-41, :4] = df.iloc[:-41, :4].to_numpy() + np.linspace(60, 0, len(df) - 41)[:, None]   # öncesi düşen trend
        self.assertIsNone(S.signal_at(DC, S.frame(df), len(df) - 1))

    def test_channel_exit(self):
        DC = self.DC
        a = np.array([(100, 101, 99, 100)] * 12 + [(100, 102, 99.5, 101), (101, 104, 100.5, 103), (103, 103.5, 97, 97.5)], dtype=float)
        F = {"o": a[:, 0], "h": a[:, 1], "l": a[:, 2], "c": a[:, 3], "idx": pd.bdate_range("2026-01-01", periods=len(a))}
        x = DC.simulate(F, 11, 100.0, 90.0, "chan", 60)
        self.assertEqual(x["status"], "chan")             # kapanış 97,5 < önceki 10 günün en düşüğü (99)
        self.assertAlmostEqual(x["exit"], 97.5)
        F = {"o": a[:, 0], "h": a[:, 1], "l": a[:, 2], "c": a[:, 3], "idx": F["idx"]}
        self.assertEqual(DC.simulate(F, 11, 100.0, 98.0, "chan", 60)["status"], "stop")   # önce başlangıç stopu
        b = a[:14]                                         # düşüş mumu henüz yok: işlem açık
        F2 = {"o": b[:, 0], "h": b[:, 1], "l": b[:, 2], "c": b[:, 3], "idx": F["idx"][:14]}
        x = DC.simulate(F2, 11, 100.0, 90.0, "chan", 60)
        self.assertEqual(x["status"], "open")
        self.assertAlmostEqual(x["exit_level"], 99.0)       # son 10 günün en düşüğü

    def test_engine_custom_exit(self):
        R = S.run({"AAA": self.trend_df(kick=3.0)}, {"AAA": "30"}, self.DC)
        self.assertEqual(set(R["stats"]["BIST TÜM"]), {"chan", "trail", "5"})
        self.assertTrue(R["active"])
        for a in R["active"]:
            self.assertEqual(a["k"], "donchian")
            self.assertIsNone(a["a"])
            self.assertIn("xl", a)


class AccountRiskTest(unittest.TestCase):
    """Hesap simülasyonu: 100.000 ₺ bakiye, strateji bazında risk oranı."""
    def test_strategy_risk(self):
        from strategies import donchian, morningstar
        self.assertEqual(S.ACCOUNT["capital"], 100_000)
        self.assertEqual(S.acct_risk(morningstar), 0.01)
        self.assertEqual(S.acct_risk(donchian), 0.005)
        self.assertEqual(S.meta(donchian)["risk"], 0.005)


class DivRunTest(unittest.TestCase):
    """Temettü Rallisi: hak kullanımdan 10 gün önce giriş, son gün çıkış, verim ≥ %5, hazırlanan 15–11 gün."""
    from strategies import divrun as DR

    def setUp(self):
        self.df = base(120)
        self.ex = self.df.index[100]                 # hak kullanım günü (çubuk 100) → son gün 99, giriş 89
        self.DR.EVENTS = {"AAA": [(self.ex, 6.0)]}   # fiyat ~100 → brüt verim ~%6

    def tearDown(self):
        self.DR.EVENTS = {}

    def F(self, df=None):
        F = S.frame(self.df if df is None else df)
        F["sym"] = "AAA"
        return F

    def test_signal_day_and_exit(self):
        F = self.F()
        self.assertIsNone(S.signal_at(self.DR, F, 88))
        sig = S.signal_at(self.DR, F, 89)
        self.assertIsNotNone(sig)
        self.assertAlmostEqual(sig["stop"], F["c"][89] - min(3 * F["atr"][89], 0.149 * F["c"][89]))
        self.assertEqual(sig["info"]["ns"], 1)
        self.assertEqual(sig["info"]["exd"], self.ex.strftime("%Y-%m-%d"))
        x = self.DR.simulate(F, 89, sig["entry"], sig["entry"] * 0.99, "cum", 60)   # stop yok: fiyat "stop"un altına inse de son gün çıkılır
        self.assertEqual((x["status"], x["exit_t"]), ("cum", 99))

    def test_low_yield_no_signal(self):
        self.DR.EVENTS = {"AAA": [(self.ex, 2.0)]}
        self.assertIsNone(S.signal_at(self.DR, self.F(), 89))

    def test_future_event_candidate_and_signal(self):
        df = self.df.iloc[:86]                       # son gün 85; hak kullanım iş günüyle 15 gün sonra
        ex = pd.Timestamp(np.busday_offset(df.index[-1].date(), 15))
        self.DR.EVENTS = {"AAA": [(ex, 6.0)]}
        cd = S.candidate_at(self.DR, self.F(df), 85)
        self.assertIsNotNone(cd)
        self.assertEqual(cd["info"]["in"], 4)         # girişe 4 iş günü
        ex = pd.Timestamp(np.busday_offset(df.index[-1].date(), 11))
        self.DR.EVENTS = {"AAA": [(ex, 6.0)]}
        self.assertIsNotNone(S.signal_at(self.DR, self.F(df), 85))   # bugün giriş günü
        self.assertIsNone(S.candidate_at(self.DR, self.F(df), 85))

    def test_engine_run(self):
        R = S.run({"AAA": self.df}, {"AAA": "30"}, self.DR)
        self.assertEqual(R["stats"]["BIST 30"]["cum"]["n"], 1)


class FvgPullbackTest(unittest.TestCase):
    """FVG Push: trendde itki boşluğu, ilk geri çekilme, teyitli dönüş; geleceğe bakmama."""
    from strategies import fvgpb as FP

    def df(self):
        n = 300
        c = list(50 + np.arange(n) * 0.2)                 # düzenli yükseliş (SMA50 > SMA200)
        o = [x - 0.1 for x in c]; h = [x + 0.3 for x in c]; lo = [x - 0.3 for x in c]
        p = c[-1]
        # itki: 1. mum (tepe p+0.3), 2. mum güçlü yeşil, 3. mum boşluk bırakır (en düşük > 1. mum tepesi)
        rows = [(p + 0.1, p + 0.3, p - 0.2, p + 0.2),
                (p + 0.2, p + 4.2, p + 0.1, p + 4.0),
                (p + 4.1, p + 5.0, p + 3.0, p + 4.8),
                (p + 4.8, p + 5.2, p + 4.0, p + 4.5),
                (p + 4.5, p + 4.6, p + 3.4, p + 3.6),
                (p + 3.6, p + 3.7, p + 2.0, p + 2.6),       # dokunuş: en düşük ≤ üst sınır (p+3.0), kapanış alt sınırın (p+0.3) üstünde
                (p + 2.6, p + 3.9, p + 2.5, p + 3.8)]       # teyit: kapanış önceki mumun tepesini (p+3.7) aşar
        for r in rows:
            o.append(r[0]); h.append(r[1]); lo.append(r[2]); c.append(r[3])
        return pd.DataFrame({"Open": o, "High": h, "Low": lo, "Close": c, "Volume": np.full(len(c), 2e6)},
                            index=pd.bdate_range("2023-01-02", periods=len(c)))

    def test_signal_on_confirmation(self):
        FP = self.FP
        df = self.df()
        F = S.frame(df)
        t = len(df) - 1
        sig = S.signal_at(FP, F, t)
        self.assertIsNotNone(sig)
        bot = df["High"].iloc[t - 6]                       # 1. mumun tepesi
        self.assertAlmostEqual(sig["stop"], bot - FP.STOP_ATR * F["atr"][t])
        self.assertIsNone(S.signal_at(FP, F, t - 1))       # dokunuş günü teyit yok
        # geleceğe bakmama: dokunuş gününe kadarki veriyle aday (teyit bekleniyor) görünür
        Fc = S.frame(df.iloc[:t])
        cd = S.candidate_at(FP, Fc, t - 1)
        self.assertIsNotNone(cd)
        self.assertAlmostEqual(cd["trig"], df["High"].iloc[t - 1])

    def test_no_signal_without_trend(self):
        FP = self.FP
        df = self.df()
        n = len(df)
        df.iloc[:n - 7, :4] = df.iloc[:n - 7, :4].to_numpy() + np.linspace(80, 0, n - 7)[:, None]   # öncesi düşen trend
        self.assertIsNone(S.signal_at(FP, S.frame(df), n - 1))


def ohlc(c, vol=2e6, start="2023-01-02"):
    c = np.asarray(c, dtype=float)
    o = np.r_[c[0], c[:-1]]
    h = np.maximum(o, c) + 0.3
    lo = np.minimum(o, c) - 0.3
    return pd.DataFrame({"Open": o, "High": h, "Low": lo, "Close": c, "Volume": np.full(len(c), vol)},
                        index=pd.bdate_range(start, periods=len(c)))


class VwapReclaimTest(unittest.TestCase):
    """VWAP Reclaim: tepeden ≥%30 düşüş, tepe ≥80 mum önce, tepe-VWAP'ının ilk geri alınışı; geleceğe bakmama."""
    from strategies import vwaprc as VR

    def series(self, peak_at=220):
        c = list(np.full(200, 100.0))
        c += list(np.linspace(100, 150, peak_at - 199)[1:])          # tepe
        c += list(np.linspace(150, 90, 101)[1:])                     # %40 düşüş
        c += [90.0] * 40
        c += list(np.linspace(90, 140, 60)[1:])                      # toparlanma: VWAP'ı geri alır
        return ohlc(c)

    def sigs(self, df):
        F = S.frame(df)
        return F, [t for t in range(len(F["c"])) if self.VR.signal(F, t)]

    def test_first_reclaim_only(self):
        F, ts = self.sigs(self.series())
        self.assertEqual(len(ts), 1)
        t = ts[0]
        x = self.VR.signal(F, t)
        av = x["info"]["avwap"]
        self.assertGreater(F["c"][t], av)
        self.assertLessEqual(F["c"][t - 1], self.VR._prep(F)["av"][t - 1])
        self.assertAlmostEqual(x["stop"], F["c"][t] - 2 * F["atr"][t])
        self.assertEqual(x["info"]["peak"], round(float(F["h"][219]), 4))

    def test_no_lookahead(self):
        df = self.series()
        F, ts = self.sigs(df)
        F2 = S.frame(df.iloc[:ts[0] + 1])
        self.assertIsNotNone(self.VR.signal(F2, ts[0]))
        self.assertEqual([t for t in range(ts[0]) if self.VR.signal(F2, t)], [])

    def test_shallow_drop_no_signal(self):
        c = list(np.full(200, 100.0)) + list(np.linspace(100, 150, 21)[1:]) + list(np.linspace(150, 125, 101)[1:]) \
            + [125.0] * 40 + list(np.linspace(125, 160, 60)[1:])
        _, ts = self.sigs(ohlc(c))
        self.assertEqual(ts, [])

    def test_candidate_below_vwap(self):
        df = self.series()
        F, ts = self.sigs(df)
        b = ts[0] - 1
        cd = self.VR.candidate(S.frame(df.iloc[:b + 1]), b)
        self.assertIsNotNone(cd)
        self.assertGreaterEqual(cd["trig"], float(df["Close"].iloc[b]))


class Sma200RetestTest(unittest.TestCase):
    """SMA200 Retest: yükselen trend, %15 uzama, SMA200'e yakın test ve dönüş günü."""
    from strategies import sma200rt as SR

    def series(self, touch=True):
        c = list(50 + np.arange(300) * 0.3)                          # düzenli yükseliş; fiyat SMA200'ün ~%30 üstünde
        s200 = np.mean(c[-200:])
        target = s200 * (1.01 if touch else 1.10)
        c += list(np.linspace(c[-1], target, 9)[1:])                 # hızlı geri çekilme
        df = ohlc(c + [target + 0.4])
        # dönüş günü: önceki tepenin üstünde, günün üst kısmında kapanış
        p = target
        df.iloc[-1, [0, 1, 2, 3]] = [p, p + 5.5, p - 0.2, p + 5.3]
        return df

    def test_signal_on_reversal(self):
        df = self.series()
        F = S.frame(df)
        t = len(F["c"]) - 1
        x = self.SR.signal(F, t)
        self.assertIsNotNone(x)
        s200 = self.SR._prep(F)["s200"][t]
        self.assertLess(x["stop"], min(float(np.min(F["l"][t - 3:t + 1])), s200))
        self.assertEqual(x["info"]["sma200"], round(float(s200), 4))

    def test_no_touch_no_signal(self):
        F = S.frame(self.series(touch=False))
        self.assertIsNone(self.SR.signal(F, len(F["c"]) - 1))

    def test_candidate_before_reversal(self):
        df = self.series().iloc[:-1]
        F = S.frame(df)
        b = len(F["c"]) - 1
        cd = self.SR.candidate(F, b)
        self.assertIsNotNone(cd)
        self.assertAlmostEqual(cd["trig"], float(df["High"].iloc[-1]))


class SqueezeBreakTest(unittest.TestCase):
    """Squeeze Break: dar kutu, kapanışlar tavana yakın, güçlü ve hacimli kırılım; 20 gün çıkışı; sahte fitil sayılmaz."""
    from strategies import sqzbrk as SQ

    def series(self, wick=False, low_closes=False):
        rng = np.random.default_rng(3)
        n = 120
        c = list(100 + np.cumsum(rng.normal(0, 0.8, 70)))           # önce serbest seyir
        for i in range(40):                                        # kutu: 100–110, kapanışlar üst kısımda
            c.append(101 + (i % 5) * 1.0 if low_closes else 107 + (i % 4) * 0.6)
        df = ohlc(c + [c[-1]] * (n - len(c)))
        k = 70
        df.iloc[k:k + 40, 1] = 110.0                                            # kutu tepesi 110
        df.iloc[k:k + 40, 2] = 100.0                                            # kutu dibi 100
        df.iloc[k:k + 40, 4] = np.where(np.arange(40) % 2 == 0, 3e6, 1e6)      # yükselen günler hacimli (OBV artı)
        t = k + 40
        o, h, lo, cl = (110.2, 113.5, 110.0, 113.4) if not wick else (109.0, 114.0, 108.8, 110.6)
        df.iloc[t, [0, 1, 2, 3, 4]] = [o, h, lo, cl, 6e6]
        return df, t

    def test_breakout_signal_and_stop(self):
        df, t = self.series()
        F = S.frame(df.iloc[:t + 1])
        x = self.SQ.signal(F, t)
        self.assertIsNotNone(x)
        self.assertEqual(x["info"]["box"], [100.0, 110.0])
        self.assertAlmostEqual(x["stop"], max(100.0, F["c"][t] - 3 * F["atr"][t]))

    def test_fake_wick_rejected(self):
        df, t = self.series(wick=True)
        self.assertIsNone(self.SQ.signal(S.frame(df.iloc[:t + 1]), t))

    def test_low_closes_rejected(self):
        df, t = self.series(low_closes=True)
        self.assertIsNone(self.SQ.signal(S.frame(df.iloc[:t + 1]), t))

    def test_time_exit_20(self):
        c = [100.0] * 60
        df = ohlc(c)
        F = S.frame(df)
        r = self.SQ.simulate(F, 10, 100.0, 95.0, "t20", 60)
        self.assertEqual((r["status"], r["exit_t"]), ("time", 30))
        self.assertEqual(self.SQ.simulate(F, 50, 100.0, 95.0, "t20", 60)["status"], "open")
        self.assertEqual(self.SQ.simulate(F, 10, 100.0, 99.9, "t20", 60)["status"], "stop")

    def test_candidate_before_breakout(self):
        df, t = self.series()
        F = S.frame(df.iloc[:t])
        cd = self.SQ.candidate(F, t - 1)
        self.assertIsNotNone(cd)
        self.assertAlmostEqual(cd["trig"], 110.0 + 0.1 * F["atr"][t - 1])


class StructureBreakTest(unittest.TestCase):
    """Structure Break: düşüş yapısı (LH + LL), daralma (LH + HL), bölge tepesinin kapanışla kırılması; geleceğe bakmama."""
    from strategies import msbrk as MB

    def series(self, contract=True):
        # tepe/dip noktaları (gün, fiyat): düşüş T0 > T1, D0 > D1; daralma T2 < T1, D2 > D1; sonra T1 kırılır
        pts = [(0, 100), (10, 130), (20, 105), (30, 122), (40, 95), (50, 115), (60, 100 if contract else 90), (70, 112), (80, 104 if contract else 85)]
        xs, ys = zip(*pts)
        c = list(np.interp(np.arange(81), xs, ys))
        c += list(np.linspace(104, 125, 11)[1:])                    # kırılım: 115'in (T1) üstü
        c += [125.0] * 20
        return ohlc(c, start="2024-01-01")

    def sigs(self, df):
        F = S.frame(df)
        return F, [t for t in range(len(F["c"])) if self.MB.signal(F, t)]

    def test_breakout_of_zone_top(self):
        F, ts = self.sigs(self.series())
        self.assertTrue(ts)
        t = ts[0]
        zb, zt = self.MB.signal(F, t)["info"]["zone2"]
        self.assertGreater(F["c"][t], zt)
        self.assertLessEqual(F["c"][t - 1], zt)
        self.assertLess(zb, zt)

    def test_no_contraction_no_signal(self):
        _, ts = self.sigs(self.series(contract=False))
        self.assertEqual(ts, [])

    def test_no_lookahead(self):
        df = self.series()
        F, ts = self.sigs(df)
        F2 = S.frame(df.iloc[:ts[0] + 1])
        self.assertIsNotNone(self.MB.signal(F2, ts[0]))
        self.assertEqual([t for t in range(ts[0]) if self.MB.signal(F2, t)], [])


class ReentryTest(unittest.TestCase):
    """Motorun isteğe bağlı yeniden giriş kuralı: stop sonrası pencere içinde kapanış ilk girişin üstüne dönerse bir kez daha giriş."""

    def strat(self, W):
        import types
        m = types.SimpleNamespace(ID="rt", TIMEFRAMES=("1D",), VARIANTS={"trail": "t"}, DEFAULT_V="trail", TRAIL=(1.0, 1.0), WARMUP=20,
                                  REENTRY=W, META={})
        m.signal = lambda F, t: {"entry": F["c"][t], "stop": F["c"][t] * 0.95} if t == 30 else None
        m.baseline_stop = lambda F, t: F["c"][t] * 0.95
        return m

    def df(self):
        c = [100.0] * 31 + [97.0, 93.0, 96.0, 101.0, 104.0, 108.0, 112.0, 116.0] + [116.0] * 30
        return ohlc(c)

    def test_reentry_after_stop(self):
        R = S.run({"AAA": self.df()}, {"AAA": "30"}, self.strat(10), recent_days=500)
        rows = sorted(R["recent"] + R["active"], key=lambda a: a["d"])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["st"], "stop")
        self.assertEqual(rows[1]["info"], {"re": 1})
        self.assertAlmostEqual(rows[1]["e"], 101.0)

    def test_off_by_default(self):
        R = S.run({"AAA": self.df()}, {"AAA": "30"}, self.strat(0), recent_days=500)
        self.assertEqual(len(R["recent"] + R["active"]), 1)


class RiseBabyTest(unittest.TestCase):
    """Rise Baby: SMA200 üstünde 10 günde ≥ %25 ilk gün; tavan günü beklenir, 3 gün tavan → iptal; geleceğe bakmama."""
    from strategies import risebaby as RB

    def series(self, locks=0):
        c = list(100 + np.arange(230) * 0.05)                       # yavaş yükseliş: SMA200 üstü
        base = c[-1]
        c += list(base * (1 + np.linspace(0.02, 0.18, 8)))          # 8 günde +%18 (koşul henüz yok)
        last = c[-1]
        jumps = [0.10] * locks + [0.08]                              # tavan günleri, ardından normal gün (+%8, tavan değil)
        for j in jumps:
            last *= 1 + j; c.append(last)
        c += [last] * 10
        df = ohlc(c)
        # tavan günleri en yüksekte kapanır; diğer günler en yüksek = kapanış + 0,3
        for i in range(238, 238 + locks):
            df.iloc[i, 1] = df.iloc[i, 3]
        return df

    def sigs(self, df):
        F = S.frame(df)
        return F, [t for t in range(len(F["c"])) if self.RB.signal(F, t)]

    def test_signal_without_limit(self):
        F, ts = self.sigs(self.series(0))
        self.assertEqual(len(ts), 1)
        t = ts[0]
        self.assertGreaterEqual(F["c"][t] / F["c"][t - 10] - 1, 0.25)
        self.assertLess(F["c"][t - 1] / F["c"][t - 11] - 1, 0.25)
        x = self.RB.signal(F, t)
        self.assertAlmostEqual(x["stop"], F["c"][t] - 2.5 * F["atr"][t])
        self.assertNotIn("info", x)

    def test_waits_one_limit_day(self):
        F, ts = self.sigs(self.series(1))
        self.assertEqual(len(ts), 1)
        self.assertEqual(self.RB.signal(F, ts[0])["info"], {"lock": 1})
        self.assertFalse(self.RB._locked(F, ts[0]))
        self.assertTrue(self.RB._locked(F, ts[0] - 1))

    def test_three_limit_days_cancel(self):
        _, ts = self.sigs(self.series(3))
        self.assertEqual(ts, [])

    def test_pending_candidate_while_locked(self):
        df = self.series(2).iloc[:240]                              # son mum 2. tavan günü
        F = S.frame(df)
        cd = self.RB.candidate(F, len(F["c"]) - 1)
        self.assertIsNotNone(cd)
        self.assertEqual(cd["info"], {"lock": 2})

    def test_no_lookahead(self):
        df = self.series(1)
        F, ts = self.sigs(df)
        F2 = S.frame(df.iloc[:ts[0] + 1])
        self.assertIsNotNone(self.RB.signal(F2, ts[0]))


class ArchiveTest(unittest.TestCase):
    """Trade arşivi: motorun history listesi ve fetch_data.archive_rows satırları (sütun sırası, açık işlemler)."""

    def test_rows(self):
        import fetch_data as FD
        prices = {"AAA": with_star(base(300), 200), "BBB": with_star(base(300), 295)}
        R = S.run(prices, {"AAA": "30", "BBB": "TÜM"}, MS)
        self.assertTrue(all("e" in x and "x" in x for x in R["history"]))
        rows = FD.archive_rows(0, "1D", R)
        self.assertEqual(len(rows), len(R["history"]) + len(R["active"]))
        self.assertTrue(all(len(r) == len(FD.ARCHIVE_COLS) for r in rows))
        closed = [r for r in rows if r[FD.ARCHIVE_COLS.index("st")] != "open"]
        self.assertTrue(all(r[FD.ARCHIVE_COLS.index("d1")] for r in closed))
