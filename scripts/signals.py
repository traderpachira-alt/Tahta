"""Morning star (sabah yıldızı) alım kurulumu: sinyal, giriş/stop/hedef ve geriye dönük test.

Kurallar (yalnızca o güne kadarki veri; canlı sinyal ve test aynı kodu kullanır):
  1. mum: kırmızı ve sert (gövde ≥ 0,5 × ATR 14)
  2. mum: küçük gövde / doji (gövde ≤ 1. mum gövdesinin %30'u)                       — Ş2
  3. mum: yeşil ve 1. mumun EN YÜKSEĞİNİN üstünde kapanış                             — Ş5
  FVG: 1. mumdan önceki 80 mumda oluşmuş, 1. mum anında doldurulmamış ve girişin ÜSTÜNDE kalan bir düşüş FVG'si
       (fiyat boşluğu: 3. mumun en yükseği < 1. mumun en düşüğü) varsa işlem yok — boşluk hedefe giden yolda direnç olur.
  Likidite: 20 günlük ortalama işlem hacmi ≥ MIN_TURNOVER.
İşlem:
  Giriş 3. mumun kapanışında. Başlangıç stopu = üç mumun en düşüğü × (1 − %0,1); 1R = giriş − başlangıç stopu.
  Varsayılan çıkış (takip eden stop): fiyat +1R'ye ulaştıktan sonra stop, görülen en yüksek fiyatın 1R altına çekilir
  (yalnızca yukarı); sabit hedef yok. Karşılaştırma için sabit 3R ve 5R hedefli varyantlar da test edilir.
  Temkinli sıra: bir günün stopu önceki günlere kadarki en yüksek fiyatla belirlenir; önce stop, sonra hedef kontrol edilir;
  stopun altında açılan günde açılıştan çıkılır. En fazla HOLD_MAX işlem günü, sonra kapanıştan çıkış.
  Gidiş-dönüş COST düşülür. Aynı hissede önceki işlem kapanmadan yeni işlem açılmaz.
Kıyas: aynı hisselerde rastgele günlerde, aynı stop yapısıyla (son üç mumun en düşüğü) ve aynı hedefle giriş.
"""
from __future__ import annotations

import zlib

import numpy as np
import pandas as pd

from indicators import rma, true_range

HOLD_MAX = 60
COST = 0.002
MIN_TURNOVER = 20e6
RISK_MIN, RISK_MAX = 0.005, 0.15      # stop mesafesi fiyatın %0,5–%15'i
BODY_ATR = 0.5                        # 1. mum gövdesi ≥ 0,5 ATR
DOJI_MAX = 0.30                       # 2. mum gövdesi ≤ 1. mum gövdesinin %30'u
STOP_BUF = 0.001                      # stop, üç mumun en düşüğünün %0,1 altı
FVG_LOOK = 80                         # üstteki düşüş FVG'si için geriye bakılan mum sayısı
VARIANTS = {"trail": "Takip eden stop (+1R sonrası 1R)", "3": "Sabit hedef 3R", "5": "Sabit hedef 5R"}
DEFAULT_V = "trail"
TRAIL_AFTER, TRAIL_DIST = 1.0, 1.0     # +1R'den sonra, en yüksek fiyatın 1R altından takip
RANDOM_PER_STOCK = 60
ACCOUNT = {"capital": 1_000_000, "risk": 0.005, "maxPos": 20}
TIER_SETS = {"BIST 30": ("30",), "BIST 50": ("30", "50"), "BIST 100": ("30", "50", "100"),
             "BIST TÜM": ("30", "50", "100", "TÜM")}
DEFAULT_SET = "BIST TÜM"

STRATEGY = {
    "name": "Morning star",
    "summary": "Sert düşüşten sonra kararsızlık (doji) ve ardından satıcıların başladığı yerin üstüne çıkan güçlü yeşil mum",
    "rules": [
        "1. mum kırmızı ve sert: gövdesi en az 0,5 ATR",
        "2. mum küçük (doji benzeri): gövdesi 1. mumun gövdesinin en fazla %30'u",
        "3. mum yeşil ve 1. mumun en yükseğinin üstünde kapanıyor",
        "Yol açık: 1. mumdan önceki 80 mumda oluşmuş, doldurulmamış ve girişin üstünde kalan bir düşüş FVG'si (fiyat boşluğu) yok",
        "Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺",
        "Giriş: 3. mumun kapanışı · Başlangıç stopu: üç mumun en düşüğünün %0,1 altı (1R = giriş − stop)",
        "Çıkış: fiyat +1R'ye ulaşınca stop, görülen en yüksek fiyatın 1R altından takip eder (yalnızca yukarı); sabit hedef yok · En fazla 60 işlem günü",
    ],
    "notes": [
        "Avantaj 2022–2024'te belirgindi, 2025–2026'da zayıfladı. Canlı sonuçları yıllık tablodan izleyin.",
        "Üstte doldurulmamış düşüş FVG'si olan formasyonlar test edilen her örneklemde (günlük BIST 100, BIST 100 dışı, 4 saatlik) belirgin şekilde zayıftı; bu yüzden elenir.",
        "Aynı kurallar ABD (S&P 100) ve Almanya (DAX 40) hisselerinde rastgele girişten iyi sonuç vermedi: etki BIST'e özgü görünüyor.",
        "En güçlü etki orta ölçekli hisselerde (BIST 100'ün 31–100. sıraları); BIST 30'da zayıf.",
        "Sermayenin çoğu zaman boşta kalır; tek başına strateji olarak değil, giriş zamanlaması aracı olarak kullanın.",
        "Takip eden stop, sabit 3R hedefe göre toplamda biraz daha az kazandırır; karşılığında işlemlerin yarısından fazlası kârla kapanır, kayıp serileri ve düşüşler kısalır. Karşılaştırma tabloda.",
        "İşlem başına önerilen risk sermayenin %0,5'i: yine de art arda 10+ kayıp yaşanabilir.",
    ],
}


def frame(df: pd.DataFrame) -> dict | None:
    if len(df) < 60:
        return None
    o, h, lo, c, v = (df[k].to_numpy(dtype=float) for k in ("Open", "High", "Low", "Close", "Volume"))
    return {"idx": df.index, "o": o, "h": h, "l": lo, "c": c, "v": v, "atr": rma(true_range(h, lo, c), 14),
            "turn": pd.Series(c * v).rolling(20).mean().to_numpy()}


def pattern_at(F, t) -> dict | None:
    """t günü kapanışında morning star tamamlandıysa {"entry", "stop", "volx"}; değilse None."""
    if t < 22:
        return None
    o, h, lo, c = F["o"], F["h"], F["l"], F["c"]
    a, b = t - 2, t - 1
    body1 = o[a] - c[a]
    atr = F["atr"][a]
    if not (np.isfinite(atr) and F["turn"][t] >= MIN_TURNOVER):
        return None
    if not (c[a] < o[a] and body1 >= BODY_ATR * atr):
        return None
    if not abs(c[b] - o[b]) <= DOJI_MAX * body1:
        return None
    if not (c[t] > o[t] and c[t] > h[a]):
        return None
    entry = c[t]
    stop = min(lo[a], lo[b], lo[t]) * (1 - STOP_BUF)
    if not (RISK_MIN <= (entry - stop) / entry <= RISK_MAX):
        return None
    if overhead_fvg(F, t) is not None:
        return None
    vavg = np.mean(F["v"][t - 20:t])
    return {"entry": entry, "stop": stop, "volx": F["v"][t] / vavg if vavg > 0 else None}


def overhead_fvg(F, t) -> tuple[float, float] | None:
    """t'de tamamlanan formasyonun 1. mumundan (t-2) önceki FVG_LOOK mumda oluşan, 1. mum anında doldurulmamış ve girişin
    üstünde kalan düşüş FVG'si: (alt, üst) ya da None. Düşüş FVG'si: i. mumun en yükseği < (i-2). mumun en düşüğü;
    boşluk [h[i], l[i-2]]. Doldurulma: sonraki mumlardan birinin en yükseği boşluğun üst sınırına ulaşırsa."""
    h, lo = F["h"], F["l"]
    a = t - 2
    entry = F["c"][t]
    for i in range(max(2, a - FVG_LOOK), a):
        if h[i] < lo[i - 2] and h[i] > entry:
            top = lo[i - 2]
            if h[i + 1:a + 1].max() < top:
                return (h[i], top)
    return None


def simulate(F, t, entry, stop, mode=DEFAULT_V) -> dict:
    """Girişi t kapanışında yapılmış işlemi yürütür. mode: 'trail' (takip eden stop) ya da hedef R'si (3, 5, '3', '5').
    status: 'stop' (başlangıç stopu) | 'trail' (takip stopu) | 'tp' | 'time' | 'open'.
    Açık işlemde 'stop_now' (güncel stop) ve 'armed' (takip başladı mı) da döner."""
    n = len(F["c"])
    risk = entry - stop
    tp = None if mode == "trail" else entry + float(mode) * risk
    cost_r = COST * entry / risk
    cur, hi, armed = stop, entry, False

    def res(status, px, i):
        return {"status": status, "r": (px - entry) / risk - cost_r, "pct": px / entry - 1 - COST, "exit_t": i, "exit": px}

    for i in range(t + 1, min(n, t + 1 + HOLD_MAX)):
        if F["l"][i] <= cur:
            px = min(cur, F["o"][i]) if i > t + 1 else cur
            return res("trail" if armed and cur > stop else "stop", px, i)
        if tp is not None and F["h"][i] >= tp:
            return res("tp", tp, i)
        hi = max(hi, F["h"][i])
        if mode == "trail":
            if hi >= entry + TRAIL_AFTER * risk:
                armed = True
            if armed:
                cur = max(cur, hi - TRAIL_DIST * risk)
    if n - 1 < t + HOLD_MAX:
        return {"status": "open", "r": (F["c"][-1] - entry) / risk, "pct": F["c"][-1] / entry - 1, "stop_now": cur, "armed": armed}
    last = t + HOLD_MAX
    return res("time", F["c"][last], last)


def account(trades: list[dict], capital: float = ACCOUNT["capital"], risk: float = ACCOUNT["risk"],
            max_pos: int = ACCOUNT["maxPos"]) -> dict | None:
    """Gerçekçi hesap: sinyaller tarih sırasıyla; 1R = özsermayenin `risk` oranı (pozisyon = risk / stop mesafesi);
    kaldıraç yok; en fazla `max_pos` açık pozisyon; aynı gün birden fazla sinyalde hisse koduna göre sıra (geleceğe
    bakmadan). Açık pozisyonlar maliyetle değerlenir; boşta kalan nakde faiz eklenmez."""
    if not trades:
        return None
    T = sorted(trades, key=lambda x: (x["d0"], x.get("sym", "")))
    days = sorted({x["d0"] for x in T} | {x["d1"] for x in T})
    by_day = {}
    for x in T:
        by_day.setdefault(x["d0"], []).append(x)
    cash, open_, taken, peak, mdd = capital, [], 0, capital, 0.0
    for d in days:
        for p in [p for p in open_ if p["d1"] <= d]:
            cash += p["pos"] * (1 + p["pct"])
            open_.remove(p)
        equity = cash + sum(p["pos"] for p in open_)
        peak = max(peak, equity)
        mdd = max(mdd, 1 - equity / peak)
        for x in by_day.get(d, []):
            if len(open_) >= max_pos:
                break
            pos = min(equity * risk / max(x["rp"], 1e-6), cash)
            if pos < equity * 0.005:
                continue
            cash -= pos
            open_.append({"pos": pos, "pct": x["pct"], "d1": x["d1"]})
            taken += 1
    final = cash + sum(p["pos"] * (1 + p["pct"]) for p in open_)
    yrs = max((days[-1] - days[0]).days / 365.25, 0.1)
    return {"taken": taken, "final": round(final), "cagr": round((final / capital) ** (1 / yrs) - 1, 4), "mdd": round(mdd, 4),
            "years": round(yrs, 1)}


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


def run(prices: dict[str, pd.DataFrame], tiers: dict[str, str | None], recent_days: int = 60, years: int = 4) -> dict:
    """Tüm hisselerde sinyal üret ve test et. tiers: {KOD: '30' | '50' | '100' | 'TÜM' | None}.
    Döner: {"stats": {grup: {varyant: istatistik}}, "accounts": {grup: {varyant: hesap}}, "active", "recent"}."""
    trades = {v: [] for v in VARIANTS}
    rnd = {v: [] for v in VARIANTS}
    active, recent = [], []
    for sym, df in prices.items():
        tier = tiers.get(sym)
        F = frame(df)
        if F is None or tier not in ("30", "50", "100", "TÜM"):
            continue
        n = len(F["c"])
        start = max(22, n - years * 252)
        busy = {v: -1 for v in VARIANTS}
        for t in range(start, n):
            sig = pattern_at(F, t)
            if not sig:
                continue
            date = F["idx"][t].strftime("%Y-%m-%d")
            for R in VARIANTS:
                if t <= busy[R]:
                    continue
                r = simulate(F, t, sig["entry"], sig["stop"], R)
                rp = (sig["entry"] - sig["stop"]) / sig["entry"]
                if r["status"] == "open":
                    busy[R] = n
                else:
                    busy[R] = r["exit_t"]
                    trades[R].append({"r": r["r"], "pct": r["pct"], "bars": r["exit_t"] - t, "y": F["idx"][t].year, "st": r["status"],
                                      "d0": F["idx"][t], "d1": F["idx"][r["exit_t"]], "rp": rp, "sym": sym, "tier": tier})
                if R != DEFAULT_V:
                    continue
                risk = sig["entry"] - sig["stop"]
                rec = {"t": sym, "idx": tier, "d": date, "e": round(sig["entry"], 4), "s0": round(sig["stop"], 4),
                       "a": round(sig["entry"] + TRAIL_AFTER * risk, 4),
                       "volx": round(sig["volx"], 2) if sig["volx"] else None, "st": r["status"], "r": round(r["r"], 3)}
                if r["status"] == "open":
                    rec.update(c=round(float(F["c"][-1]), 4), s=round(r["stop_now"], 4), armed=r["armed"])
                    active.append(rec)
                elif t >= n - recent_days:
                    rec.update(xd=F["idx"][r["exit_t"]].strftime("%Y-%m-%d"), x=round(r["exit"], 4))
                    recent.append(rec)
        # Kıyas: rastgele günler, aynı stop yapısı (son üç mumun en düşüğü), aynı hedef (tekrarlanabilir örneklem)
        cand = [t for t in range(max(start, 22), n - 1) if F["turn"][t] >= MIN_TURNOVER]
        if cand:
            rng = np.random.default_rng(zlib.crc32(sym.encode()))
            for t in rng.choice(cand, size=min(RANDOM_PER_STOCK, len(cand)), replace=False):
                entry = F["c"][t]
                stop = min(F["l"][t - 2], F["l"][t - 1], F["l"][t]) * (1 - STOP_BUF)
                if not (RISK_MIN <= (entry - stop) / entry <= RISK_MAX):
                    continue
                for R in VARIANTS:
                    r = simulate(F, t, entry, stop, R)
                    if r["status"] != "open":
                        rnd[R].append((tier, r["r"]))
    stats, accounts = {}, {}
    for name, ts in TIER_SETS.items():
        stats[name] = {}
        for R in VARIANTS:
            lst = [x for x in trades[R] if x["tier"] in ts]
            stats[name][R] = _stats(lst, [r for tier, r in rnd[R] if tier in ts])
        accounts[name] = {v: account([x for x in trades[v] if x["tier"] in ts]) for v in VARIANTS}
    active.sort(key=lambda a: (a["d"], a["t"]), reverse=True)
    recent.sort(key=lambda a: (a["d"], a["t"]), reverse=True)
    return {"stats": stats, "accounts": accounts, "active": active, "recent": recent}
