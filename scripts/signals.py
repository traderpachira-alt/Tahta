"""Sinyal motoru: strateji modüllerini (scripts/strategies/) aynı kurallarla çalıştırır ve geriye dönük test eder.

Motor, her stratejiye ortak olanları yapar:
  - Likidite: 20 günlük ortalama işlem hacmi ≥ MIN_TURNOVER (4 saatlikte önceki günün değeri)
  - Risk aralığı: stop mesafesi fiyatın %0,5–%15'i
  - İşlem yürütme (simulate): takip eden stop ya da sabit R hedefi; temkinli sıra (bir mumun stopu önceki mumlara kadarki
    en yüksekle belirlenir; önce stop, sonra hedef; stopun altında açılan mumda açılıştan çıkış), en fazla `hold` mum,
    gidiş-dönüş COST; aynı hissede önceki işlem kapanmadan yeni işlem açılmaz
  - Kıyas: aynı hisselerde rastgele mumlarda, stratejinin stop yapısıyla (baseline_stop) ve aynı çıkışla giriş
  - Hesap simülasyonu (account), endeks al-tut kıyası (bench), endeks gruplarına göre istatistik
Strateji arayüzü: strategies/__init__.py.
"""
from __future__ import annotations

import zlib

import numpy as np
import pandas as pd

from indicators import rma, true_range
from strategies import GROUPS, PORTFOLIOS, REGISTRY  # noqa: F401 (PORTFOLIOS fetch_data için)

HOLD_MAX = 60
COST = 0.002
MIN_TURNOVER = 20e6
RISK_MIN, RISK_MAX = 0.005, 0.15      # stop mesafesi fiyatın %0,5–%15'i
RANDOM_PER_STOCK = 60
ACCOUNT = {"capital": 100_000, "risk": 0.01}   # risk: varsayılan; strateji ACCOUNT_RISK ile kendi oranını verebilir
TIER_SETS = {"BIST 30": ("30",), "BIST 50": ("30", "50"), "BIST 100": ("30", "50", "100"),
             "BIST TÜM": ("30", "50", "100", "TÜM")}
DEFAULT_SET = "BIST TÜM"


def frame(df: pd.DataFrame) -> dict | None:
    if len(df) < 60:
        return None
    o, h, lo, c, v = (df[k].to_numpy(dtype=float) for k in ("Open", "High", "Low", "Close", "Volume"))
    return {"idx": df.index, "o": o, "h": h, "l": lo, "c": c, "v": v, "atr": rma(true_range(h, lo, c), 14),
            # 4 saatlik mumlarda likidite günlük veriden gelir ('turn' sütunu); günlükte 20 günlük ortalama işlem hacmi
            "turn": df["turn"].to_numpy(dtype=float) if "turn" in df.columns else pd.Series(c * v).rolling(20).mean().to_numpy()}


BARS_BEFORE, BARS_MAX = 6, 70   # kurulum çizimi için kayıtlara eklenen mum penceresi


def bars(F, i0: int, i1: int, fmt_: str, sig: int) -> dict:
    """Sayfadaki kurulum çizimi için mumlar: i0..i1 (dahil), en fazla BARS_MAX; sig = sinyal mumunun penceredeki yeri."""
    i0 = max(0, i0)
    i1 = min(len(F["c"]) - 1, i1, i0 + BARS_MAX - 1)
    r = lambda a: [round(float(x), 4) for x in a[i0:i1 + 1]]
    return {"d": [F["idx"][i].strftime(fmt_) for i in range(i0, i1 + 1)], "o": r(F["o"]), "h": r(F["h"]), "l": r(F["l"]),
            "c": r(F["c"]), "i": sig - i0}


def signal_at(strat, F, t) -> dict | None:
    """Stratejinin t mumundaki sinyali + motorun ortak filtreleri (likidite, risk aralığı). {"entry", "stop", "volx", ...}"""
    if not (F["turn"][t] >= MIN_TURNOVER):
        return None
    sig = strat.signal(F, t)
    if not sig:
        return None
    rp = (sig["entry"] - sig["stop"]) / sig["entry"]
    if not (RISK_MIN <= rp <= RISK_MAX):
        return None
    vavg = np.mean(F["v"][max(0, t - 20):t]) if t > 0 else 0
    return {**sig, "volx": F["v"][t] / vavg if vavg > 0 else None}


def candidate_at(strat, F, b) -> dict | None:
    """Stratejinin "hazırlanan" kurulumu (varsa) + likidite ve risk üst sınırı."""
    if not hasattr(strat, "candidate") or not (F["turn"][b] >= MIN_TURNOVER):
        return None
    cd = strat.candidate(F, b)
    if not cd or cd["risk"] > RISK_MAX:
        return None
    return cd


def simulate(F, t, entry, stop, mode="trail", hold=None, trail=(1.0, 1.0)) -> dict:
    """Girişi t kapanışında yapılmış işlemi yürütür. mode: 'trail' (takip eden stop) ya da hedef R'si (3, 5, '3', '5').
    status: 'stop' (başlangıç stopu) | 'trail' (takip stopu) | 'tp' | 'time' | 'open'.
    Açık işlemde 'stop_now' (güncel stop) ve 'armed' (takip başladı mı) da döner."""
    n = len(F["c"])
    hold = hold or HOLD_MAX
    risk = entry - stop
    tp = None if mode == "trail" else entry + float(mode) * risk
    cost_r = COST * entry / risk
    cur, hi, armed = stop, entry, False

    def res(status, px, i):
        return {"status": status, "r": (px - entry) / risk - cost_r, "pct": px / entry - 1 - COST, "exit_t": i, "exit": px}

    for i in range(t + 1, min(n, t + 1 + hold)):
        if F["l"][i] <= cur:
            px = min(cur, F["o"][i]) if i > t + 1 else cur
            return res("trail" if armed and cur > stop else "stop", px, i)
        if tp is not None and F["h"][i] >= tp:
            return res("tp", tp, i)
        hi = max(hi, F["h"][i])
        if mode == "trail":
            if hi >= entry + trail[0] * risk:
                armed = True
            if armed:
                cur = max(cur, hi - trail[1] * risk)
    if n - 1 < t + hold:
        return {"status": "open", "r": (F["c"][-1] - entry) / risk, "pct": F["c"][-1] / entry - 1, "stop_now": cur, "armed": armed}
    last = t + hold
    return res("time", F["c"][last], last)


def account(trades: list[dict], capital: float = ACCOUNT["capital"], risk: float = ACCOUNT["risk"], max_pos: int | None = None) -> dict | None:
    """Hesap simülasyonu, iki biçimde (ikisinde de 1R = güncel bakiyenin `risk` oranı, pozisyon = 1R / stop mesafesi; bakiye
    kazandıkça büyür, kaybettikçe küçülür; bakiye = başlangıç + kapanan işlemlerin sonucu, açık pozisyonlar maliyetle):
      üst düzey alanlar (nakitle sınırlı): pozisyon boştaki nakdi aşıyorsa işlem açılamaz, sinyal kaçar ("missed");
      "u" (sınırsız): nakitten bağımsız bütün sinyallere girilir (kaldıraç sınırsız); "maxExp" en yüksek toplam pozisyon / bakiye.
    Aynı gün birden fazla sinyalde hisse koduna göre sıra (geleceğe bakmadan). Boşta kalan nakde faiz eklenmez."""
    if not trades:
        return None
    T = sorted(trades, key=lambda x: (x["d0"], x.get("sym", "")))
    days = sorted({x["d0"] for x in T} | {x["d1"] for x in T})
    by_day = {}
    for x in T:
        by_day.setdefault(x["d0"], []).append(x)
    yrs = max((days[-1] - days[0]).days / 365.25, 0.1)

    def sim(limited: bool) -> dict:
        bal, open_, taken, missed, peak, mdd, exp = capital, [], 0, 0, capital, 0.0, 0.0
        for d in days:
            for p in [p for p in open_ if p["d1"] <= d]:
                bal += p["pos"] * p["pct"]
                open_.remove(p)
            peak = max(peak, bal)
            mdd = max(mdd, 1 - bal / peak) if peak > 0 else 1.0
            for x in by_day.get(d, []):
                pos = max(bal, 0) * risk / max(x["rp"], 1e-6)
                used = sum(p["pos"] for p in open_)
                if limited and (pos > bal - used or (max_pos and len(open_) >= max_pos)):
                    missed += 1
                    continue
                if pos <= 0:
                    missed += 1
                    continue
                open_.append({"pos": pos, "pct": x["pct"], "d1": x["d1"]})
                taken += 1
                if bal > 0:
                    exp = max(exp, (used + pos) / bal)
        final = bal + sum(p["pos"] * p["pct"] for p in open_)
        out = {"taken": taken, "missed": missed, "final": round(final),
               "cagr": round((final / capital) ** (1 / yrs) - 1, 4) if final > 0 else -1.0, "mdd": round(min(mdd, 1.0), 4)}
        if not limited:
            out["maxExp"] = round(exp, 2)
        return out

    res = sim(True)
    res["years"] = round(yrs, 1)
    res["u"] = sim(False)
    return res


def bench(idx: pd.DataFrame | None, years: int = 4) -> dict | None:
    """Aynı dönemde endeksi alıp tutmanın yıllık getirisi ve en büyük düşüşü."""
    if idx is None or len(idx) < 300:
        return None
    c = idx["Close"].dropna()
    c = c[c.index >= c.index[-1] - pd.DateOffset(years=years)]
    yrs = (c.index[-1] - c.index[0]).days / 365.25
    return {"cagr": round(float((c.iloc[-1] / c.iloc[0]) ** (1 / yrs) - 1), 4), "mdd": round(float((1 - c / c.cummax()).max()), 4)}


def _stats(lst: list[dict], rnd: list[float]) -> dict:
    if not lst:
        return {"n": 0}
    rs = np.array([x["r"] for x in lst])
    pos, neg = rs[rs > 0].sum(), -rs[rs < 0].sum()
    by_year = {}
    for y in sorted({x["y"] for x in lst}):
        ry = np.array([x["r"] for x in lst if x["y"] == y])
        by_year[str(y)] = {"n": int(len(ry)), "avgR": round(float(ry.mean()), 3), "win": round(float((ry > 0).mean()), 3),
                           "sumR": round(float(ry.sum()), 2)}
    streak = worst = 0
    for x in sorted(lst, key=lambda x: x["d0"]):
        streak = streak + 1 if x["r"] < 0 else 0
        worst = max(worst, streak)
    return {
        "n": int(len(rs)), "tp": round(sum(x["st"] == "tp" for x in lst) / len(lst), 3),
        "win": round(float((rs > 0).mean()), 3), "avgR": round(float(rs.mean()), 3), "sumR": round(float(rs.sum()), 2),
        "pf": round(float(pos / neg), 2) if neg > 0 else None, "bars": round(float(np.mean([x["bars"] for x in lst])), 1),
        "streak": worst, "randR": round(float(np.mean(rnd)), 3) if rnd else None, "byYear": by_year,
    }


TIMEFRAMES = {"1D": {"name": "Günlük", "hold": 60, "bars_per_day": 1, "fmt": "%Y-%m-%d"},
              "4H": {"name": "4 saat", "hold": 120, "bars_per_day": 2, "fmt": "%Y-%m-%d %H:%M"}}


def run(prices: dict[str, pd.DataFrame], tiers: dict[str, str | None], strat=None, recent_days: int = 60, years: int = 4,
        tf: str = "1D") -> dict:
    """Bir stratejiyi tüm hisselerde çalıştır ve test et. tiers: {KOD: '30' | '50' | '100' | 'TÜM' | None}.
    Döner: {"stats": {grup: {varyant: istatistik}}, "accounts": {grup: {varyant: hesap}}, "active", "recent", "candidates"}.
    Kayıtlar "k" (strateji kimliği) ve "tf" taşır."""
    strat = strat or REGISTRY["morningstar"]
    V, DV, trail = strat.VARIANTS, strat.DEFAULT_V, strat.TRAIL
    # Stratejiye özel çıkışlar (ör. kanal çıkışı): strateji CUSTOM_EXITS'te listeler ve kendi simulate'ini sağlar.
    # Diğer varyantlar ve bu kancayı kullanmayan stratejiler motorun simulate'iyle yürür.
    custom = set(getattr(strat, "CUSTOM_EXITS", ()))
    base_ok = getattr(strat, "baseline_ok", None)

    def sim(F, t, entry, stop, R):
        if R in custom:
            return strat.simulate(F, t, entry, stop, R, hold)
        return simulate(F, t, entry, stop, R, hold, trail)
    trades = {v: [] for v in V}
    rnd = {v: [] for v in V}
    active, recent, candidates = [], [], []
    bpd, fmt_, hold = TIMEFRAMES[tf]["bars_per_day"], TIMEFRAMES[tf]["fmt"], TIMEFRAMES[tf]["hold"]
    for sym, df in prices.items():
        tier = tiers.get(sym)
        F = frame(df)
        if F is None or tier not in ("30", "50", "100", "TÜM"):
            continue
        F["sym"] = sym          # fiyat dışı veri kullanan stratejiler için (ör. temettü takvimi)
        n = len(F["c"])
        start = max(strat.WARMUP, n - years * 252 * bpd)
        busy = {v: -1 for v in V}
        for t in range(start, n):
            sig = signal_at(strat, F, t)
            if not sig:
                continue
            date = F["idx"][t].strftime(fmt_)
            for R in V:
                if t <= busy[R]:
                    continue
                r = sim(F, t, sig["entry"], sig["stop"], R)
                rp = (sig["entry"] - sig["stop"]) / sig["entry"]
                if r["status"] == "open":
                    busy[R] = n
                else:
                    busy[R] = r["exit_t"]
                    trades[R].append({"r": r["r"], "pct": r["pct"], "bars": r["exit_t"] - t, "y": F["idx"][t].year, "st": r["status"],
                                      "d0": F["idx"][t], "d1": F["idx"][r["exit_t"]], "rp": rp, "sym": sym, "tier": tier})
                if R != DV:
                    continue
                risk = sig["entry"] - sig["stop"]
                rec = {"k": strat.ID, "t": sym, "tf": tf, "idx": tier, "d": date, "e": round(sig["entry"], 4), "s0": round(sig["stop"], 4),
                       "a": round(sig["entry"] + trail[0] * risk, 4) if DV == "trail" else None if DV in custom else round(sig["entry"] + float(DV) * risk, 4),
                       "volx": round(sig["volx"], 2) if sig["volx"] else None, "st": r["status"], "r": round(r["r"], 3)}
                if sig.get("info"):
                    rec["info"] = sig["info"]
                if r["status"] == "open":
                    rec.update(c=round(float(F["c"][-1]), 4), s=round(r["stop_now"], 4), armed=r["armed"])
                    if r.get("exit_level") is not None:
                        rec["xl"] = round(r["exit_level"], 4)
                    rec["bars"] = bars(F, t - BARS_BEFORE, n - 1, fmt_, t)
                    active.append(rec)
                elif t >= n - recent_days * bpd:
                    rec.update(xd=F["idx"][r["exit_t"]].strftime(fmt_), x=round(r["exit"], 4),
                               bars=bars(F, t - BARS_BEFORE, r["exit_t"] + 2, fmt_, t))
                    recent.append(rec)
        # Hazırlanan kurulumlar: son mum itibarıyla bir sonraki mumda tamamlanabilecekler
        cd = candidate_at(strat, F, n - 1)
        if cd:
            candidates.append({"k": strat.ID, "t": sym, "tf": tf, "idx": tier, "d1": F["idx"][cd["d1"]].strftime(fmt_),
                               "d2": F["idx"][cd["d2"]].strftime(fmt_), "c": round(float(F["c"][-1]), 4),
                               "trig": round(cd["trig"], 4), "eff": round(cd["eff"], 4), "dist": round(cd["dist"], 4),
                               "s": round(cd["stop"], 4), "risk": round(cd["risk"], 4),
                               "fvg": [round(cd["fvg"][0], 4), round(cd["fvg"][1], 4)] if cd.get("fvg") else None,
                               **({"info": cd["info"]} if cd.get("info") else {}),
                               "bars": bars(F, cd["d1"] - BARS_BEFORE, n - 1, fmt_, cd["d1"])})
        # Kıyas: rastgele mumlar, stratejinin stop yapısı, aynı çıkış (tekrarlanabilir örneklem)
        cand = [t for t in range(max(start, strat.WARMUP), n - 1) if F["turn"][t] >= MIN_TURNOVER and (base_ok is None or base_ok(F, t))]
        if cand:
            rng = np.random.default_rng(zlib.crc32(sym.encode()))
            for t in rng.choice(cand, size=min(RANDOM_PER_STOCK, len(cand)), replace=False):
                entry = F["c"][t]
                stop = strat.baseline_stop(F, t)
                if not (RISK_MIN <= (entry - stop) / entry <= RISK_MAX):
                    continue
                for R in V:
                    r = sim(F, t, entry, stop, R)
                    if r["status"] != "open":
                        rnd[R].append((tier, r["r"]))
    stats, accounts = {}, {}
    for name, ts in TIER_SETS.items():
        stats[name] = {}
        for R in V:
            lst = [x for x in trades[R] if x["tier"] in ts]
            stats[name][R] = _stats(lst, [r for tier, r in rnd[R] if tier in ts])
        accounts[name] = {v: account([x for x in trades[v] if x["tier"] in ts], ACCOUNT["capital"], acct_risk(strat)) for v in V}
    active.sort(key=lambda a: (a["d"], a["t"]), reverse=True)
    recent.sort(key=lambda a: (a["d"], a["t"]), reverse=True)
    candidates.sort(key=lambda x: (x["dist"], x["t"]))
    return {"stats": stats, "accounts": accounts, "active": active, "recent": recent, "candidates": candidates}


def acct_risk(strat) -> float:
    """Hesap simülasyonunda işlem başına risk (bakiyenin oranı): stratejinin ACCOUNT_RISK'i, yoksa ACCOUNT["risk"]."""
    return getattr(strat, "ACCOUNT_RISK", ACCOUNT["risk"])


def meta(strat) -> dict:
    """Sinyal sayfası için strateji tanımı."""
    return {"id": strat.ID, **strat.META, "groupName": GROUPS.get(strat.META.get("group"), strat.META.get("group")),
            "variants": strat.VARIANTS, "defaultV": strat.DEFAULT_V, "candidates": hasattr(strat, "candidate"),
            "candMaxDist": getattr(strat, "CAND_MAX_DIST", None), "risk": acct_risk(strat)}
