#!/usr/bin/env python3
"""BIST verisini çekip statik site için JSON dosyaları üretir.

Fiyatlar Yahoo Finance'ten, mali tablolar İş Yatırım'dan, endeks listesi Borsa İstanbul'dan gelir.

Çıktı:
  <out>/data/summary.json      her hisse için özet (getiriler, teknik göstergeler, temel oranlar)
  <out>/data/signals.json      morning star kurulumu: kurallar, geriye dönük test, açık ve son sinyaller
  <out>/data/hist/<KOD>.json   2 yıllık günlük OHLCV (grafik için)

Kullanım:
  python scripts/fetch_data.py --out site             # gerçek veri
  python scripts/fetch_data.py --out site --sample    # internetsiz deneme için ÖRNEK veri
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

from indicators import ema, sma, wilder_rsi, rma, true_range, rolling_mid, stoch_rsi, fisher, supertrend, ichimoku, vwma  # noqa: F401
import isyatirim
import dcf
import breadth
import intraday
import scores
import signals
import temettu

HERE = Path(__file__).resolve().parent
INDEX = "XU100"

# Borsa İstanbul'un resmi endeks bileşen dosyası (her çalışmada güncel hali çekilir).
BIST_CSV_URL = "https://www.borsaistanbul.com/datum/hisse_endeks_ds.csv"
BIST_CSV_FALLBACK = HERE / "endeks_bilesenleri.csv"  # indirme olmazsa kullanılan yedek
# En dar endeksten genişe: bir hisse hangi endekste ilk görünüyorsa o etiketi alır.
TIERS = [("XU030", "30"), ("XU050", "50"), ("XU100", "100"), ("XUTUM", "TÜM")]

SAMPLE_SECTORS = ["Bankacılık", "Elektrik Üretim", "Holding", "Perakende - Ticaret", "Demir, Çelik", "Savunma",
                  "Gıda", "Otomotiv", "Gayrimenkul Y.O.", "Havayolları ve Hizm."]


# ----------------------------------------------------------------------------
# Göstergeler (web/ind.js ile aynı formüller)
# ----------------------------------------------------------------------------
def avg_price_yields(df: pd.DataFrame) -> pd.Series:
    """Her temettü için 'dönem ortalama fiyatı verimi': ödenen tutar / önceki temettünün hak kullanım gününden bu
    temettünün hak kullanım gününe kadarki (o gün hariç) günlük kapanışların ortalaması. Öncesinde temettü yoksa
    son 365 günün ortalaması; yeterli fiyat geçmişi yoksa (60 işlem gününden az) boş."""
    if "Dividends" not in df.columns:
        return pd.Series(dtype=float)
    d = df["Dividends"]
    d = d[d > 0]
    close, out, prev = df["Close"], {}, None
    for day, amt in d.items():
        start = prev if prev is not None else day - pd.DateOffset(days=365)
        win = close[(close.index >= start) & (close.index < day)]
        if prev is None and close.index[0] > start + pd.DateOffset(days=30):
            win = win.iloc[:0]  # geçmiş bir yılı kapsamıyor
        out[day] = float(amt) / float(win.mean()) if len(win) >= (1 if prev is not None else 60) and win.mean() > 0 else None
        prev = day
    return pd.Series(out, dtype=float)


def div_metrics(df: pd.DataFrame) -> dict:
    """Temettü ölçütleri, TAKVİM YILI bazında (Yahoo temettü geçmişi, bölünmelere göre düzeltilmiş, hisse başı brüt TL).
    divCur: bu yıl şimdiye kadar ödenen toplam; divPrev: geçen yılın toplamı; verimler güncel fiyata göre."""
    keys = ("divCur", "divPrev", "divYield", "divYieldPrev", "lastDivDate", "lastDivAmt", "divFreq",
            "divYears5", "divStreak", "divGrowth", "divAvg5", "divRecent", "divYieldAvg", "divYieldAvgPrev", "lastDivYieldAvg")
    out = dict.fromkeys(keys)
    if "Dividends" not in df.columns:
        return out
    last_px, end = float(df["Close"].iloc[-1]), df.index[-1]
    d = df["Dividends"]
    d = d[d > 0]
    out["divYears5"], out["divStreak"] = 0, 0
    if d.empty:
        out.update(divCur=0.0, divPrev=0.0, divYield=0.0, divYieldPrev=0.0, divFreq=0, divYieldAvg=0.0, divYieldAvgPrev=0.0)
        return out
    this = end.year
    by_year = d.groupby(d.index.year).sum()
    cur, prev = float(by_year.get(this, 0.0)), float(by_year.get(this - 1, 0.0))
    out["divCur"], out["divPrev"] = cur, prev
    out["divYield"] = cur / last_px if last_px else None
    out["divYieldPrev"] = prev / last_px if last_px else None
    out["divFreq"] = int((d.index.year == this).sum())
    # Bu yıl (şimdiye kadar) / geçen yıl; bu yıl henüz ödeme yoksa yıl bitmediği için hesaplanmaz (−%100 yanıltıcı olur)
    out["divGrowth"] = (cur / prev - 1) if prev > 0 and cur > 0 else None
    out["lastDivDate"] = d.index[-1].strftime("%Y-%m-%d")
    out["lastDivAmt"] = float(d.iloc[-1])
    # Son ~400 günün temettüleri (portföyde hak sahipliği tespiti için): [[hak kullanım tarihi, hisse başı brüt TL]]
    recent = d[d.index > end - pd.DateOffset(days=400)]
    out["divRecent"] = [[i.strftime("%Y-%m-%d"), round(float(x), 4)] for i, x in recent.items()]
    years = set(d.index.year)
    out["divYears5"] = sum(y in years for y in range(this - 4, this + 1))  # bu yıl dahil son 5 takvim yılı
    # Kesintisiz yıl: bu yıl henüz ödemediyse geçen yıldan saymaya başla
    y = this if this in years else this - 1
    streak = 0
    while y in years:
        streak, y = streak + 1, y - 1
    out["divStreak"] = streak
    full = [by_year.get(yy, 0.0) for yy in range(this - 5, this)]  # tamamlanmış son 5 yıl
    out["divAvg5"] = (sum(full) / 5) / last_px if last_px else None
    # Dönem ortalama fiyatı verimi: yıl içindeki her ödemenin kendi dönem ortalamasına göre verimi toplanır.
    # O yılın bir ödemesi hesaplanamıyorsa (fiyat geçmişi yetersiz) yıl toplamı boş bırakılır.
    ay = avg_price_yields(df)
    for key, yr in (("divYieldAvg", this), ("divYieldAvgPrev", this - 1)):
        v = ay[ay.index.year == yr]
        out[key] = None if v.isna().any() else float(v.sum())
    out["lastDivYieldAvg"] = None if ay.empty or pd.isna(ay.iloc[-1]) else float(ay.iloc[-1])
    return out


# ----------------------------------------------------------------------------
# Destek / direnç: confluence (kesişim) bölgeleri
# ----------------------------------------------------------------------------
SR_W = {  # kaynak kodu -> ağırlık (uzun dönem = daha güçlü)
    "Yh": 4, "Yl": 4, "Ye": 3, "Qh": 3, "Ql": 3, "Qe": 2.25, "Mh": 2, "Ml": 2, "Me": 1.5, "Wh": 1, "Wl": 1, "We": 0.75,
    "Yo": 2.5, "Mo": 1.25, "Wo": 0.75, "SWH": 1.5, "SWL": 1.5, "POC": 3, "VAH": 2, "VAL": 2, "52H": 2.5, "52L": 2.5,
    "S200": 2, "S50": 1.5, "WS50": 2, "PP": 1.25, "PS1": 1, "PR1": 1, "GAP": 1, "RND": 0.5,
}


def _period_levels(df: pd.DataFrame, rule: str, key: str, completed: bool) -> list[tuple[float, str]]:
    """Önceki tamamlanmış dönemin yüksek/düşük/orta seviyeleri + içinde bulunulan dönemin açılışı."""
    g = df.resample(rule).agg({"Open": "first", "High": "max", "Low": "min", "Close": "last"}).dropna()
    if len(g) < 2:
        return []
    prev = g.iloc[-1] if completed else g.iloc[-2]
    out = [(prev.High, f"{key}h"), (prev.Low, f"{key}l"), ((prev.High + prev.Low) / 2, f"{key}e")]
    if not completed and key in ("W", "M", "Y"):
        out.append((g.iloc[-1].Open, f"{key}o"))
    return out


def _volume_profile(h, lo, v, bins=50):
    top, bot = float(np.nanmax(h)), float(np.nanmin(lo))
    if not (top > bot):
        return []
    edges = np.linspace(bot, top, bins + 1)
    prof = np.zeros(bins)
    for hi_, lo_, vol in zip(h, lo, v):
        if not (vol > 0) or not np.isfinite(hi_) or not np.isfinite(lo_):
            continue
        i0 = min(bins - 1, max(0, int((lo_ - bot) / (top - bot) * bins)))
        i1 = min(bins - 1, max(0, int((hi_ - bot) / (top - bot) * bins)))
        prof[i0:i1 + 1] += vol / (i1 - i0 + 1)
    if prof.sum() <= 0:
        return []
    mid = (edges[:-1] + edges[1:]) / 2
    poc = int(prof.argmax())
    lo_i = hi_i = poc
    acc, total = prof[poc], prof.sum()
    while acc < 0.7 * total and (lo_i > 0 or hi_i < bins - 1):  # değer alanı: POC'tan büyük komşuya doğru genişle
        up = prof[hi_i + 1] if hi_i < bins - 1 else -1
        dn = prof[lo_i - 1] if lo_i > 0 else -1
        if up >= dn:
            hi_i += 1; acc += up
        else:
            lo_i -= 1; acc += dn
    return [(mid[poc], "POC"), (edges[hi_i + 1], "VAH"), (edges[lo_i], "VAL")]


def sr_metrics(df: pd.DataFrame) -> dict:
    """Aday seviyeleri toplar, ATR toleransıyla bölgelere birleştirir, ağırlık ve kesişim sayısıyla puanlar.
    Döner: sup/res (en güçlü 3 bölge, yakından uzağa) + en yakın destek/dirence uzaklık."""
    out = {"srSup": [], "srRes": [], "supDist": None, "resDist": None, "supN": None, "resN": None, "supS": None, "resS": None, "supLvl": None}
    if len(df) < 120:
        return out
    c, h, lo, v = (df[k].to_numpy(float) for k in ("Close", "High", "Low", "Volume"))
    p, last_day = c[-1], df.index[-1]
    atr = rma(true_range(h, lo, c), 14)[-1]
    tol = max(0.5 * atr if np.isfinite(atr) else 0, 0.005 * p)
    nb = last_day + pd.offsets.BDay(1)
    cands: list[tuple[float, str]] = []
    cands += _period_levels(df, "W-FRI", "W", last_day.weekday() == 4)
    cands += _period_levels(df, "ME", "M", nb.month != last_day.month)
    cands += _period_levels(df, "QE", "Q", nb.quarter != last_day.quarter)
    cands += _period_levels(df, "YE", "Y", nb.year != last_day.year)
    # Haftalık dönüş noktaları (2 yıl, iki yanda 2 bar)
    w = df.resample("W-FRI").agg({"High": "max", "Low": "min", "Close": "last"}).dropna().iloc[-104:]
    wh, wl = w["High"].to_numpy(), w["Low"].to_numpy()
    for i in range(2, len(w) - 2):
        if wh[i] == max(wh[i - 2:i + 3]):
            cands.append((wh[i], "SWH"))
        if wl[i] == min(wl[i - 2:i + 3]):
            cands.append((wl[i], "SWL"))
    # Hacim profili (1 yıl), 52 hafta, ortalamalar
    y1 = slice(-252, None)
    cands += _volume_profile(h[y1], lo[y1], v[y1])
    cands += [(np.nanmax(h[y1]), "52H"), (np.nanmin(lo[y1]), "52L")]
    for n, key in ((200, "S200"), (50, "S50"), (250, "WS50")):
        if len(c) >= n:
            cands.append((c[-n:].mean(), key))
    # Aylık klasik pivot (önceki ay)
    mo = df.resample("ME").agg({"High": "max", "Low": "min", "Close": "last"}).dropna()
    if len(mo) >= 2:
        pm = mo.iloc[-1] if nb.month != last_day.month else mo.iloc[-2]
        pp = (pm.High + pm.Low + pm.Close) / 3
        cands += [(pp, "PP"), (2 * pp - pm.High, "PS1"), (2 * pp - pm.Low, "PR1")]
    # Kapanmamış boşluklar (1 yıl)
    hh, ll = h[y1], lo[y1]
    for i in range(1, len(hh)):
        if ll[i] > hh[i - 1] * 1.005 and np.nanmin(ll[i:]) > hh[i - 1]:
            cands.append(((ll[i] + hh[i - 1]) / 2, "GAP"))
        elif hh[i] < ll[i - 1] * 0.995 and np.nanmax(hh[i:]) < ll[i - 1]:
            cands.append(((hh[i] + ll[i - 1]) / 2, "GAP"))
    # Yuvarlak sayılar
    m = 10 ** math.floor(math.log10(p))
    step = m / 2 if p / m < 3 else m
    k = math.ceil(p * 0.7 / step)
    while k * step <= p * 1.3:
        cands.append((k * step, "RND")); k += 1
    cands = sorted((float(x), s) for x, s in cands if np.isfinite(x) and p * 0.7 <= x <= p * 1.3)
    # Bölgelere birleştir: bir öncekine tol'dan yakın ve bölge genişliği 2·tol'u aşmıyorsa aynı bölge
    zones, cur = [], []
    for x, src in cands:
        if cur and (x - cur[-1][0] > tol or x - cur[0][0] > 2 * tol):
            zones.append(cur); cur = []
        cur.append((x, src))
    if cur:
        zones.append(cur)
    res_z = []
    for z in zones:
        xs = [x for x, _ in z]
        wts = [SR_W[s] for _, s in z]
        srcs = sorted({s for _, s in z}, key=lambda s: -SR_W[s])
        # Kesişim sayısı = farklı YÖNTEM sayısı (haftalık tepe ve dip aynı yöntem: rol değişimi ağırlığa eklenir, sayıya değil)
        n = len({"SW" if s in ("SWH", "SWL") else s for s in srcs if s != "RND"})
        if n < 2:
            continue  # tek yöntemli seviye "major" sayılmaz
        mid = float(np.average(xs, weights=wts))
        res_z.append({"lo": min(xs), "hi": max(xs), "m": mid, "s": round(sum(wts), 2), "n": n, "src": srcs})
    sup = sorted([z for z in res_z if z["m"] < p], key=lambda z: -z["s"])[:3]
    res = sorted([z for z in res_z if z["m"] >= p], key=lambda z: -z["s"])[:3]
    sup.sort(key=lambda z: -z["m"]); res.sort(key=lambda z: z["m"])  # yakından uzağa
    rnd = lambda x: round(x, 2 if x >= 1 else 4)  # noqa: E731
    for z in sup + res:
        z["lo"], z["hi"], z["m"] = rnd(z["lo"]), rnd(z["hi"]), rnd(z["m"])
    out["srSup"], out["srRes"] = sup, res
    if sup:
        out["supDist"] = max(0.0, (p - sup[0]["hi"]) / p); out["supN"] = sup[0]["n"]; out["supS"] = sup[0]["s"]; out["supLvl"] = sup[0]["m"]
    if res:
        out["resDist"] = max(0.0, (res[0]["lo"] - p) / p); out["resN"] = res[0]["n"]; out["resS"] = res[0]["s"]
    return out


def pct(a, b):
    try:
        a, b = float(a), float(b)
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(a) and math.isfinite(b)) or b == 0:
        return None
    return a / b - 1


def last_cross(a: np.ndarray, b: np.ndarray, lookback: int):
    """a, b'yi son `lookback` barda yukarı ('up') ya da aşağı ('down') kestiyse döner."""
    diff = a - b
    for i in range(len(diff) - 1, max(len(diff) - lookback, 1) - 1, -1):
        p, q = diff[i - 1], diff[i]
        if not (np.isfinite(p) and np.isfinite(q)):
            break
        if p <= 0 < q:
            return "up"
        if p >= 0 > q:
            return "down"
    return None


def metrics(df: pd.DataFrame, idx: pd.DataFrame | None) -> dict:
    c = df["Close"].to_numpy(float)
    h = df["High"].to_numpy(float)
    lo = df["Low"].to_numpy(float)
    v = df["Volume"].fillna(0).to_numpy(float)
    n, last = len(c), c[-1]

    def ago(k):
        return c[-1 - k] if n > k else None

    m = {
        "date": df.index[-1].strftime("%Y-%m-%d"),
        "last": last,
        "chg1d": pct(last, ago(1)),
        "chg1w": pct(last, ago(5)),
        "chg1m": pct(last, ago(21)),
        "chg3m": pct(last, ago(63)),
        "chg6m": pct(last, ago(126)),
        "chg1y": pct(last, ago(252)),
    }
    prev_year = df["Close"][df.index.year < df.index[-1].year]
    m["ytd"] = pct(last, prev_year.iloc[-1]) if len(prev_year) else None

    s20, s50, s200 = sma(c, 20), sma(c, 50), sma(c, 200)
    m["vsSma20"] = pct(last, s20[-1])
    m["vsSma50"] = pct(last, s50[-1])
    m["vsSma200"] = pct(last, s200[-1])
    if np.isfinite(s50[-1]) and np.isfinite(s200[-1]):
        m["trend"] = "up" if last > s50[-1] > s200[-1] else "down" if last < s50[-1] < s200[-1] else "flat"
    else:
        m["trend"] = None
    cross = last_cross(s50, s200, 10)
    m["cross"] = {"up": "golden", "down": "death"}.get(cross)

    m["rsi"] = wilder_rsi(c)[-1]
    macd = ema(c, 12) - ema(c, 26)
    hist = macd - ema(macd, 9)
    m["macdPct"] = hist[-1] / last if last else None
    m["macdCross"] = last_cross(hist, np.zeros_like(hist), 3)

    k, d = stoch_rsi(c)
    m["stochK"], m["stochD"] = k[-1], d[-1]
    m["stochCross"] = last_cross(k, d, 3)
    atr14 = rma(true_range(h, lo, c), 14)
    m["atrPct"] = atr14[-1] / last if np.isfinite(atr14[-1]) else None
    fi, tr = fisher(h, lo)
    m["fisher"] = fi[-1]
    m["fisherCross"] = last_cross(fi, tr, 2)
    st_line, st_tr = supertrend(h, lo, c)
    if np.isfinite(st_tr[-1]):
        m["stTrend"] = "up" if st_tr[-1] > 0 else "down"
        m["stDist"] = pct(last, st_line[-1])
        flip = last_cross(st_tr, np.zeros_like(st_tr), 3)
        m["stFlip"] = flip
    else:
        m["stTrend"] = m["stDist"] = m["stFlip"] = None
    tenkan, kijun, sa, sb = ichimoku(h, lo)
    if np.isfinite(sa[-1]) and np.isfinite(sb[-1]):
        top, bot = max(sa[-1], sb[-1]), min(sa[-1], sb[-1])
        m["ichi"] = "above" if last > top else "below" if last < bot else "in"
    else:
        m["ichi"] = None
    m["tkCross"] = last_cross(tenkan, kijun, 3)
    vw = vwma(c, v, 20)
    m["vsVwma20"] = pct(last, vw[-1])

    hi52, lo52 = np.nanmax(h[-252:]), np.nanmin(lo[-252:])
    m["hi52"], m["lo52"] = hi52, lo52
    m["distHi52"] = pct(last, hi52)
    m["distLo52"] = pct(last, lo52)

    avg20 = v[-21:-1].mean() if n > 21 else np.nan
    m["volRatio"] = v[-1] / avg20 if avg20 and np.isfinite(avg20) and avg20 > 0 else None
    m["turnover"] = float((c[-20:] * v[-20:]).mean())

    lr = np.diff(np.log(c))
    m["volat"] = float(lr[-63:].std(ddof=1) * math.sqrt(252)) if len(lr) >= 63 else None

    m["beta"] = m["rs3m"] = None
    if idx is not None and len(idx):
        j = pd.concat([df["Close"], idx["Close"]], axis=1, join="inner").iloc[-253:]
        r = j.pct_change().dropna()
        if len(r) > 60 and r.iloc[:, 1].var() > 0:
            m["beta"] = float(r.iloc[:, 0].cov(r.iloc[:, 1]) / r.iloc[:, 1].var())
        ic = idx["Close"].to_numpy(float)
        if m["chg3m"] is not None and len(ic) > 63:
            m["rs3m"] = m["chg3m"] - pct(ic[-1], ic[-64])
    m["points"] = n
    return m


# ----------------------------------------------------------------------------
# Veri kaynakları
# ----------------------------------------------------------------------------
def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1254", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def load_universe(cache_dir: Path):
    """BIST TÜM hisselerini ve her birinin en dar endeksini (30/50/100/TÜM) döner."""
    import urllib.request

    cached = cache_dir / "endeks.csv"
    text, source = None, None
    try:
        req = urllib.request.Request(BIST_CSV_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            t = _decode(r.read())
        if ";XUTUM;" in t:
            text, source = t, "borsaistanbul.com"
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_text(text, encoding="utf-8")
    except Exception as e:
        print(f"  Endeks listesi indirilemedi ({e}); yedek kullanılacak.", flush=True)
    if text is None:
        for p in (cached, BIST_CSV_FALLBACK):
            if p.exists():
                text, source = p.read_text(encoding="utf-8"), f"yedek: {p.name}"
                break
    if text is None:
        sys.exit("HATA: endeks bileşen listesi bulunamadı.")

    members: dict[str, set[str]] = {code: set() for code, _ in TIERS}
    names: dict[str, str] = {}
    date = None
    for line in text.splitlines():
        r = line.split(";")
        if len(r) < 6 or r[2] not in members:
            continue
        code = r[0].split(".")[0].strip().upper()
        members[r[2]].add(code)
        names.setdefault(code, r[1].strip())
        date = r[5].strip()
    tier = {}
    for code, label in TIERS:
        for t in members[code]:
            tier.setdefault(t, label)
    universe = sorted(tier)
    print(f"Endeks listesi ({source}, {date}): " +
          ", ".join(f"{c} {len(members[c])}" for c, _ in TIERS), flush=True)
    return universe, tier, names, date


# KAP "Pazarlar" sayfası tüm pay piyasası pazarlarını ve şirket kodlarını içerir (sayfa herkese açık).
KAP_MARKETS_URL = "https://www.kap.org.tr/tr/Pazarlar?market=WUlMRElaIFBBWkFS"
MARKET_SHORT = {  # KAP pazar adı -> kısa etiket (sıra = öncelik, birden fazla pazarda görünen kod için)
    "YILDIZ PAZAR": "Yıldız", "ANA PAZAR": "Ana", "ALT PAZAR": "Alt", "YAKIN İZLEME PAZARI": "YİP",
    "GİRİŞİM SERMAYESİ PAZARI": "GSP", "PİYASA ÖNCESİ İŞLEM PLATFORMU": "PÖİP",
}


def load_markets(cache_dir: Path, max_age_h: float = 20) -> dict[str, str]:
    """{KOD: 'Yıldız' | 'Ana' | 'Alt' | 'YİP' | ...}; KAP'a ulaşılamazsa önbellek."""
    import re
    import urllib.request

    cache = cache_dir / "pazar.json"
    try:
        old = json.loads(cache.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    if old.get("data") and time.time() - old.get("_ts", 0) < max_age_h * 3600:
        return old["data"]
    try:
        req = urllib.request.Request(KAP_MARKETS_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read().decode("utf-8", "replace").replace('\\"', '"')
        rank = {k: i for i, k in enumerate(MARKET_SHORT)}
        out, fin, cur = {}, None, None
        for m in re.finditer(r'"financialMarketName":"([^"]+)"|"marketName":"([^"]+)"|"stockCode":"([^"]*)"', t):
            if m.group(1):
                fin = m.group(1)
            elif m.group(2):
                cur = m.group(2) if fin == "PAY PİYASASI" and m.group(2) in MARKET_SHORT else None
            elif cur:
                for code in m.group(3).split(","):
                    code = code.strip()
                    if code and (code not in out or rank[cur] < rank[out[code]]):
                        out[code] = cur
        data = {c: MARKET_SHORT[m] for c, m in out.items()}
        if sum(v == "Yıldız" for v in data.values()) < 50:
            raise RuntimeError(f"beklenenden az hisse ({len(data)})")
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps({"_ts": time.time(), "data": data}, ensure_ascii=False), encoding="utf-8")
        print("Pazarlar (KAP): " + ", ".join(f"{v} {sum(x == v for x in data.values())}" for v in MARKET_SHORT.values()), flush=True)
        return data
    except Exception as e:
        print(f"  Pazar listesi alınamadı ({e}); önbellek kullanılacak.", flush=True)
        return old.get("data") or {}


MEASURES_FILE = HERE / "tedbirler.csv"
# GCM Yatırım'ın herkese açık "Tedbir Kapsamındaki Pay Senetleri" tablosu (sayfanın kendi HTML'inde gelir).
GCM_MEASURES_URL = "https://www.gcmyatirim.com.tr/borsa/tedbir-kapsamindaki-pay-senetleri"
MEASURE_COLS = {  # tablo başlığı -> arayüzde gösterilecek ad
    "AÇIĞA SATIŞ YASAĞI": "Açığa satış yasağı", "BRÜT TAKAS": "Brüt takas", "EMİR İPTALİ": "Emir iptali yasağı",
    "KREDİLİ İŞLEM YASAĞI": "Kredili işlem yasağı", "PİYASA EMRİ YASAĞI": "Piyasa emri yasağı",
    "TEK FİYAT UYGULANMASI": "Tek fiyat", "EMİR KISITLAMASI": "Emir kısıtlaması",
}


def _tr_date(x: str):
    try:
        return dt.datetime.strptime(x.strip(), "%d.%m.%Y").date()
    except ValueError:
        return None


def fetch_gcm_measures(cache_dir: Path) -> tuple[dict[str, list[dict]], str | None]:
    """GCM tablosundan tedbirler; alınamazsa son başarılı sonuç (önbellek). Döner: (tedbirler, güncelleme zamanı)."""
    import html as html_lib
    import re
    import urllib.request

    cache = cache_dir / "tedbir_gcm.json"
    try:
        req = urllib.request.Request(GCM_MEASURES_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=40) as r:
            page = r.read().decode("utf-8", "replace")
        tables = [t for t in re.findall(r"<table.*?</table>", page, re.S) if "HİSSE KODU" in t]
        if not tables:
            raise RuntimeError("tedbir tablosu bulunamadı (sayfa yapısı değişmiş olabilir)")
        rows = [[html_lib.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S)]
                for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tables[0], re.S)]
        head, body = rows[0], rows[1:]
        if head[:3] != ["HİSSE KODU", "BAŞLANGIÇ TARİHİ", "BİTİŞ TARİHİ"]:
            raise RuntimeError(f"beklenmeyen tablo başlığı: {head[:3]}")
        out: dict[str, list[dict]] = {}
        for r in body:
            if len(r) < len(head) or not re.fullmatch(r"[A-Z0-9]{3,6}", r[0]):
                continue
            start, end = _tr_date(r[1]), _tr_date(r[2])
            for col, val in zip(head[3:], r[3:]):
                if val and col in MEASURE_COLS:
                    out.setdefault(r[0], []).append({
                        "type": MEASURE_COLS[col], "from": start.isoformat() if start else None,
                        "to": end.isoformat() if end else None, "note": None})
        stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps({"at": stamp, "data": out}, ensure_ascii=False), encoding="utf-8")
        return out, stamp
    except Exception as e:
        print(f"  GCM tedbir listesi alınamadı ({e}); önbellek kullanılacak.", flush=True)
        try:
            old = json.loads(cache.read_text(encoding="utf-8"))
            return old.get("data") or {}, old.get("at")
        except (OSError, ValueError):
            return {}, None


def load_measures(cache_dir: Path, path: Path = MEASURES_FILE) -> tuple[dict[str, list[dict]], str | None]:
    """Süresi dolmamış tedbirler: GCM tablosu + elle tutulan tedbirler.csv.
    Döner: ({KOD: [{"type", "from", "to", "note"}]}, GCM güncelleme zamanı)."""
    today = dt.date.today()
    gcm, stamp = fetch_gcm_measures(cache_dir)
    out: dict[str, list[dict]] = {}
    for code, items in gcm.items():
        for m in items:
            if m["to"] and dt.date.fromisoformat(m["to"]) < today:
                continue
            out.setdefault(code, []).append(m)
    d = _tr_date
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        r = [x.strip() for x in line.split(";")] + [""] * 5
        code, kind, start, end, note = r[:5]
        if code.lower() == "kod" or not code:
            continue
        e = d(end) if end else None
        if e and e < today:
            continue
        item = {"type": kind, "from": d(start).isoformat() if d(start) else None, "to": e.isoformat() if e else None, "note": note or None}
        lst = out.setdefault(code.upper(), [])
        same = next((m for m in lst if m["type"].lower() == kind.lower()), None)
        if same:  # GCM'de de varsa elle yazılan açıklama/tarih öncelikli
            same.update({k: v for k, v in item.items() if v})
        else:
            lst.append(item)
    print(f"Tedbirler: {sum(len(v) for v in out.values())} aktif tedbir, {len(out)} hisse "
          f"(GCM: {stamp or 'alınamadı'}).", flush=True)
    return out, stamp


# temettuhisseleri.com "Temettü Tarihleri" sayfası: açıklanmış ama henüz ödenmemiş temettüler.
# Yalnızca olgusal bilgiler alınır (kod, tarih, net pay başı tutar); sitenin tahminleri kullanılmaz.
UPCOMING_DIV_URL = "https://temettuhisseleri.com/temettutarihleri/"
TR_MONTHS = {m: i for i, m in enumerate(
    ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"], 1)}


def fetch_upcoming_dividends(cache_dir: Path, max_age_h: float = 6) -> tuple[dict[str, list[dict]], str | None]:
    """{KOD: [{"date": ISO | None, "net": TL}]}: tarihi belli yaklaşan ve tarihi açıklanmamış temettüler."""
    import html as html_lib
    import re
    import urllib.request

    cache = cache_dir / "temettu_yaklasan.json"
    try:
        old = json.loads(cache.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    if old.get("data") is not None and time.time() - old.get("_ts", 0) < max_age_h * 3600:
        return old["data"], old.get("at")

    def rows_of(table):
        return [[html_lib.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S)]
                for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S)]

    def money(x):
        try:
            return float(x.replace("₺", "").replace(",", ".").strip())
        except ValueError:
            return None

    try:
        req = urllib.request.Request(UPCOMING_DIV_URL, headers={"User-Agent": "Mozilla/5.0 (Tahta; personal BIST dashboard)"})
        with urllib.request.urlopen(req, timeout=40) as r:
            page = r.read().decode("utf-8", "replace")
        tables = re.findall(r"<table.*?</table>", page, re.S)
        today = dt.date.today()
        out: dict[str, list[dict]] = {}
        # 1) Takvim: ay başlığı satırı ("Kasım 2026 | Yüzde | Pay Başı") ardından "KOD | 17 Kasım | %… | 0.36₺"
        cal = next((t for t in tables if re.search(r"(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) 20\d\d", t)), None)
        if cal is None:
            raise RuntimeError("temettü takvimi tablosu bulunamadı")
        year = None
        for r in rows_of(cal):
            m = re.fullmatch(r"(\w+) (20\d\d)", r[0]) if r else None
            if m and m.group(1) in TR_MONTHS:
                year = int(m.group(2))
                continue
            if len(r) >= 4 and year and re.fullmatch(r"[A-Z0-9]{3,6}", r[0]):
                dm = re.fullmatch(r"(\d{1,2}) (\w+)", r[1])
                if not dm or dm.group(2) not in TR_MONTHS:
                    continue
                d = dt.date(year, TR_MONTHS[dm.group(2)], int(dm.group(1)))
                if d >= today:
                    out.setdefault(r[0], []).append({"date": d.isoformat(), "net": money(r[3])})
        # 2) "Temettü kararı alınmış ama ödeme tarihi henüz açıklanmamış hisseler" (tarihsiz tablo)
        marker = page.find("ödeme tarihi henüz açıklanmamış")
        if marker > 0:
            t2 = re.search(r"<table.*?</table>", page[marker:], re.S)
            for r in rows_of(t2.group(0)) if t2 else []:
                if len(r) >= 3 and re.fullmatch(r"[A-Z0-9]{3,6}", r[0]):
                    out.setdefault(r[0], []).append({"date": None, "net": money(r[2])})
        for v in out.values():
            v.sort(key=lambda x: x["date"] or "9999")
        stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps({"_ts": time.time(), "at": stamp, "data": out}, ensure_ascii=False), encoding="utf-8")
        print(f"Yaklaşan temettüler: {sum(len(v) for v in out.values())} kayıt, {len(out)} hisse.", flush=True)
        return out, stamp
    except Exception as e:
        print(f"  Yaklaşan temettüler alınamadı ({e}); önbellek kullanılacak.", flush=True)
        return old.get("data") or {}, old.get("at")


OZ_TO_GRAM = 31.1034768
CRYPTO = ("BTC", "ETH", "SOL", "BNB", "USDT", "USDC")


def fetch_assets() -> dict[str, dict]:
    """Portföy için döviz ve emtia (TL karşılığı): USD, EUR, gram altın (XAU), gram gümüş (XAG).
    Altın/gümüş: uluslararası ons fiyatı (vadeli) × USD/TRY / 31,1035 — Kapalıçarşı fiyatından biraz farklıdır."""
    import yfinance as yf

    syms = {"USD": "USDTRY=X", "EUR": "EURTRY=X", "GC": "GC=F", "SI": "SI=F", **{c: f"{c}-USD" for c in CRYPTO}}
    try:
        d = yf.download(list(syms.values()), period="1mo", interval="1d", auto_adjust=False,
                        group_by="ticker", progress=False, threads=True)
        close = {k: d[v]["Close"].dropna() for k, v in syms.items()}
        if any(len(close[k]) < 2 for k in ("USD", "EUR", "GC", "SI")):
            raise RuntimeError("eksik seri")
        usd = close["USD"]
        out = {"TRY": {"last": 1.0, "chg1d": 0.0}}
        for k in ("USD", "EUR"):
            c = close[k]
            out[k] = {"last": float(c.iloc[-1]), "chg1d": pct(c.iloc[-1], c.iloc[-2]), "date": c.index[-1].strftime("%Y-%m-%d")}
        for k, src in (("XAU", "GC"), ("XAG", "SI")):
            g = (close[src] * usd.reindex(close[src].index).ffill() / OZ_TO_GRAM).dropna()
            out[k] = {"last": float(g.iloc[-1]), "chg1d": pct(g.iloc[-1], g.iloc[-2]), "date": g.index[-1].strftime("%Y-%m-%d")}
        # Kripto: USD fiyatı × USD/TRY (kripto hafta sonu da işlem görür; kur son iş gününden taşınır)
        for k in CRYPTO:
            c = close.get(k)
            if c is None or len(c) < 2:
                continue
            t = (c * usd.reindex(c.index).ffill()).dropna()
            if len(t) >= 2:
                out[k] = {"last": float(t.iloc[-1]), "chg1d": pct(c.iloc[-1], c.iloc[-2]), "usd": float(c.iloc[-1]),
                          "date": t.index[-1].strftime("%Y-%m-%d")}
        print("Döviz/emtia/kripto: " + ", ".join(f"{k} {v['last']:.2f}" for k, v in out.items()), flush=True)
        return out
    except Exception as e:
        print(f"  Döviz/emtia alınamadı ({e}).", flush=True)
        return {"TRY": {"last": 1.0, "chg1d": 0.0}}


def write_stable_history(out_dir: Path):
    """Portföyde USDT/USDC ile yapılan kripto işlemlerinin TL karşılığı için son 2 yılın günlük kuru (TL / 1 USDT, USDC)."""
    import yfinance as yf

    try:
        d = yf.download(["USDT-USD", "USDC-USD", "USDTRY=X"], period="2y", interval="1d", auto_adjust=False,
                        group_by="ticker", progress=False, threads=True)
        usd = d["USDTRY=X"]["Close"].dropna()
        out = {}
        for k in ("USDT", "USDC"):
            c = d[f"{k}-USD"]["Close"].dropna()
            t = (c * usd.reindex(c.index).ffill()).dropna()
            out[k] = {"d": [i.strftime("%Y-%m-%d") for i in t.index], "c": [round(float(x), 4) for x in t]}
        (out_dir / "data" / "fx.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
        print(f"Stablecoin TL kur geçmişi: {len(out['USDT']['d'])} gün.", flush=True)
    except Exception as e:
        print(f"  Stablecoin kur geçmişi alınamadı ({e}).", flush=True)


def quality_scores(t: str, df: pd.DataFrame, m: dict, f: dict, fin: dict | None, fin_dir: Path, mkt_yield=None, mk=None) -> dict:
    """F-skoru, temettü güvenlik skoru ve verim bandı; mali tablo özeti ve skor dökümü data/fin/KOD.json'a yazılır."""
    out = {"fScore": None, "dsScore": None}
    fq = scores.piotroski(fin)
    out["fScore"] = fq["fScore"]
    d = df["Dividends"] if "Dividends" in df.columns else pd.Series(dtype=float)
    d = d[d > 0]
    end = df.index[-1]
    per_share12 = float(d[d.index > end - pd.DateOffset(days=365)].sum())
    # Dağıtma oranı: şirketin kendi temettüsü (hisse başı brüt × pay sayısı) / son 12 ay ana ortaklık net kârı.
    # Nakit akışındaki temettü kalemi holdinglerde azınlık paylarına ödenenleri de içerdiği için yalnızca yedektir.
    payout, paid12 = f.get("payout"), None
    F = scores.Fin(fin)
    if f.get("mcap") and m.get("last"):
        paid12 = per_share12 * f["mcap"] / m["last"]
        net = F.ttm(*F.latest, "net") if F.latest else None
        if net and net > 0:
            payout = paid12 / net
        elif net is not None:
            payout = None  # zarar: oran anlamsız
    out["payout"] = payout
    ds = {"dsScore": None, "dsParts": None}
    if (m.get("divCur") or 0) > 0 or (m.get("divPrev") or 0) > 0:  # son iki takvim yılında temettü ödeyenler
        by_year = {int(k): float(v) for k, v in d.groupby(d.index.year).sum().items()}
        ds = scores.dividend_safety(fin, {
            "payout": payout, "roe": f.get("roe"), "fScore": fq["fScore"], "divYears5": m.get("divYears5"),
            "divStreak": m.get("divStreak"), "divByYear": by_year, "curYear": end.year, "divPaid12": per_share12, "paid12": paid12})
    out["dsScore"] = ds["dsScore"]
    out.update(scores.yield_band(df, mkt_yield))
    st = scores.statements(fin)
    # DCF (dolar bazında) ve ters DCF; hisse sayfasındaki hesaplayıcı girdileri kullanır
    dc = dcf.inputs(t, {**f, **m}, fin, mk) if fin else {"ok": False, "why": "Mali tablo verisi yok."}
    out.update(dcf.summary_fields(dc))
    if st or ds["dsParts"] or fq["fItems"]:
        payload = {"st": st, "f": fq, "ds": ds["dsParts"], "payout": payout, "dcf": dc}
        (fin_dir / f"{t}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


def write_signals(out: Path, prices: dict[str, pd.DataFrame], stocks: list[dict], idx: pd.DataFrame | None = None, intraday_on: bool = True,
                  div_events: dict | None = None):
    """Tüm stratejiler (scripts/strategies/), desteklediği periyotlarda (günlük, 4 saatlik): açık sinyaller, hazırlanan
    kurulumlar, son sonuçlar ve geriye dönük test (data/signals.json)."""
    t0 = time.time()
    by = {s["t"]: s for s in stocks}
    tiers = {t: s.get("idx") for t, s in by.items()}
    strats = list(signals.REGISTRY.values())
    # Temettü takvimi (temettü öncesi koşu stratejisi): geçmiş hak kullanımları + açıklanmış yaklaşan temettüler (net → brüt)
    from strategies import divrun
    ev = {t: list(v) for t, v in (div_events or {}).items()}
    for s in stocks:
        for u in s.get("divUpcoming") or []:
            if u.get("date") and u.get("net"):
                ev.setdefault(s["t"], []).append((pd.Timestamp(u["date"]), u["net"] / (1 - (s.get("divTax") or 0.0))))
    divrun.EVENTS = ev
    data = {"1D": prices}
    if intraday_on and any("4H" in st.TIMEFRAMES for st in strats):
        # 4 saatlik: yalnızca evrendeki ve son gün likidite filtresini geçen hisseler (diğerlerinde sinyal oluşmaz)
        liquid = [t for t, df in prices.items() if tiers.get(t) in ("30", "50", "100", "TÜM")
                  and float((df["Close"] * df["Volume"]).tail(20).mean()) >= signals.MIN_TURNOVER]
        try:
            h4 = intraday.load_h4(liquid, prices, log=lambda m: print(m, flush=True))
            if h4:
                data["4H"] = h4
        except Exception as e:  # noqa: BLE001 — 4 saatlik hata günlük sinyalleri engellemesin
            print(f"  4 saatlik veri alınamadı ({e}).", flush=True)
    metas, active, recent, cands = [], [], [], []
    for st in strats:
        runs = {}
        for tf in st.TIMEFRAMES:
            if tf not in data:
                continue
            try:
                runs[tf] = signals.run(data[tf], tiers, st, tf=tf)
            except Exception as e:  # noqa: BLE001 — bir stratejinin hatası diğerlerini engellemesin
                print(f"  {st.ID} ({tf}) çalıştırılamadı: {e}", flush=True)
        if not runs:
            continue
        m = signals.meta(st)
        m.update(tfs=list(runs), stats={k: R["stats"] for k, R in runs.items()}, accounts={k: R["accounts"] for k, R in runs.items()})
        metas.append(m)
        for R in runs.values():
            active += R["active"]; recent += R["recent"]; cands += R["candidates"]
    # Portföy stratejileri (ör. göreli güç rotasyonu): kendi aylık simülasyonları
    for pid, ps in signals.PORTFOLIOS.items():
        try:
            pr = ps.run(prices, tiers, idx)
        except Exception as e:  # noqa: BLE001
            print(f"  {pid} çalıştırılamadı: {e}", flush=True)
            continue
        metas.append({"id": pid, "kind": "portfolio", **ps.META, "groupName": signals.GROUPS.get(ps.META["group"], ps.META["group"]),
                      "tfs": list(ps.TIMEFRAMES), "pf": pr})
        for h in pr["holdings"]:
            if h["t"] in by:
                by[h["t"]]["rot"] = {"k": pid, "n": ps.META["name"], "rank": h["rank"], "since": h["since"]}
    names = {m["id"]: m["name"] for m in metas}
    active.sort(key=lambda a: (a["d"], a["t"]), reverse=True)
    recent.sort(key=lambda a: (a.get("xd") or a["d"], a["t"]), reverse=True)
    cands.sort(key=lambda a: (a["dist"], a["t"]))
    for a in active:
        s = by.get(a["t"])
        if s is None:
            continue
        a.update(tedbir=bool(s.get("tedbir")), fScore=s.get("fScore"), dsScore=s.get("dsScore"))
        s.setdefault("sig", []).append({"k": a["k"], "n": names.get(a["k"], a["k"]), "tf": a["tf"], "d": a["d"], "e": a["e"], "s": a["s"],
                                        "s0": a["s0"], "a": a["a"], "xl": a.get("xl"), "info": a.get("info"), "armed": a["armed"], "st": a["st"]})
    payload = {
        "version": 2,
        "updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "groups": signals.GROUPS, "strategies": metas,
        "timeframes": {k: {"name": v["name"], "hold": v["hold"]} for k, v in signals.TIMEFRAMES.items() if k in data},
        "tierSets": list(signals.TIER_SETS), "defaultSet": signals.DEFAULT_SET,
        "account": signals.ACCOUNT, "bench": signals.bench(idx),
        "params": {"hold": signals.HOLD_MAX, "cost": signals.COST, "minTurnover": signals.MIN_TURNOVER},
        "active": active, "recent": recent, "candidates": cands,
    }
    (out / "data" / "signals.json").write_text(json.dumps(clean(payload), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    desc = ", ".join(m["name"] + " " + "/".join(m["tfs"]) for m in metas)
    print(f"Sinyaller ({desc}): {len(active)} açık, {len(cands)} hazırlanan, "
          f"son 60 günde {len(recent)} sonuçlanmış ({time.time() - t0:.0f} sn).", flush=True)


def download_prices(symbols: list[str]) -> dict[str, pd.DataFrame]:
    import yfinance as yf

    out: dict[str, pd.DataFrame] = {}
    todo = list(symbols)
    for attempt in range(3):
        if not todo:
            break
        data = yf.download(
            [s + ".IS" for s in todo], period="5y", interval="1d", auto_adjust=False, actions=True,  # fiyatlar yalnızca bölünmelere göre düzeltilmiş (TradingView gibi)
            group_by="ticker", progress=False, threads=True,
        )
        have = set(data.columns.get_level_values(0)) if isinstance(data.columns, pd.MultiIndex) else set()
        for s in todo:
            if s + ".IS" not in have:
                continue
            sub = data[s + ".IS"]
            cols = [c for c in ["Open", "High", "Low", "Close", "Volume", "Dividends", "Stock Splits"] if c in sub.columns]
            df = sub[cols].dropna(subset=["Close"])
            if "Dividends" not in df.columns:
                df = df.assign(Dividends=0.0)
            df = df[~df.index.duplicated(keep="last")].sort_index()
            if len(df) >= 30:
                out[s] = df
        todo = [s for s in todo if s not in out]
        if todo and attempt < 2:
            print(f"  {len(todo)} sembol alınamadı, {20 * (attempt + 1)} sn sonra tekrar denenecek…", flush=True)
            time.sleep(20 * (attempt + 1))
    return out


def make_sample(symbols: list[str]):
    """İnternet olmadan arayüzü denemek için rastgele ÖRNEK veri (gerçek değildir)."""
    rng = np.random.default_rng(7)
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=1260)
    prices, funds = {}, {}
    for s in symbols:
        drift, vol = rng.normal(0.0008, 0.0008), rng.uniform(0.015, 0.035)
        c = rng.uniform(5, 400) * np.exp(np.cumsum(rng.normal(drift, vol, len(dates))))
        o = np.r_[c[0], c[:-1]] * (1 + rng.normal(0, vol / 3, len(dates)))
        h = np.maximum(o, c) * (1 + np.abs(rng.normal(0, vol / 2, len(dates))))
        lo = np.minimum(o, c) * (1 - np.abs(rng.normal(0, vol / 2, len(dates))))
        v = rng.lognormal(16, 0.5, len(dates)) * (1 + 3 * (rng.random(len(dates)) > 0.97))
        dv = np.zeros(len(dates))
        if rng.random() < 0.6:  # örnek: yılda bir temettü
            for j in range(len(dates) - 1, 0, -252):
                dv[j] = c[j] * rng.uniform(0.01, 0.08)
        prices[s] = pd.DataFrame({"Open": o, "High": h, "Low": lo, "Close": c, "Volume": v, "Dividends": dv}, index=dates)
        maybe = lambda x: None if rng.random() < 0.1 else x  # noqa: E731
        funds[s] = {
            "name": f"{s} (örnek)", "sector": SAMPLE_SECTORS[rng.integers(len(SAMPLE_SECTORS))],
            "freeFloat": float(rng.uniform(0.1, 0.8)), "mcap": float(rng.lognormal(23.5, 1.2)),
            "pe": maybe(float(rng.uniform(2, 40))), "pb": maybe(float(rng.uniform(0.4, 8))),
            "evEbitda": maybe(float(rng.uniform(2, 25))), "netMargin": maybe(float(rng.uniform(-0.1, 0.35))),
            "opMargin": maybe(float(rng.uniform(-0.05, 0.4))), "roe": maybe(float(rng.uniform(-0.1, 0.6))),
            "de": maybe(float(rng.uniform(0, 2.5))), "revGrowth": maybe(float(rng.uniform(-0.3, 1.2))),
            "epsGrowth": maybe(float(rng.uniform(-0.8, 2))), "payout": maybe(float(rng.uniform(0, 0.9))),
            "netDebt": None, "period": "2026/9", "finGroup": "XI_29",
        }
    return prices, funds


# ----------------------------------------------------------------------------
# Çıktı
# ----------------------------------------------------------------------------
def clean(x):
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items() if not k.startswith("_")}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        x = float(x)
        if not math.isfinite(x):
            return None
        if abs(x) >= 1e6:
            return round(x)
        return round(x, 6 if abs(x) < 1 else 4)
    return x



def write_hist(path: Path, df: pd.DataFrame):
    def r(a):
        return [round(float(x), 2 if abs(x) >= 1 else 4) for x in a]

    div = df["Dividends"] if "Dividends" in df.columns else pd.Series(dtype=float)
    div = div[div > 0]
    # O günkü verim: temettü düşülmeden önceki fiyata (bir önceki işlem gününün kapanışına) göre
    full_close = df["Close"].shift(1)
    avg_y = avg_price_yields(df)
    df = df[df.index >= df.index[-1] - pd.DateOffset(years=2)]  # grafik için son 2 yıl yeterli
    payload = {
        # [tarih, hisse başı TL, o günkü kapanışa göre verim, dönem ortalama fiyatına göre verim]
        "div": [[d.strftime("%Y-%m-%d"), round(float(x), 4), round(float(x) / float(full_close[d]), 5) if pd.notna(full_close.get(d)) else None,
                 round(float(avg_y[d]), 5) if pd.notna(avg_y.get(d)) else None]
                for d, x in div.items()],
        "d": [d.strftime("%Y-%m-%d") for d in df.index],
        "o": r(df["Open"]), "h": r(df["High"]), "l": r(df["Low"]), "c": r(df["Close"]),
        "v": [int(x) for x in df["Volume"].fillna(0)],
    }
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="site", help="çıktı klasörü (varsayılan: site)")
    ap.add_argument("--cache-dir", default=".cache", help="önbellek klasörü (mali tablolar, endeks listesi)")
    ap.add_argument("--fund-max-age-days", type=float, default=3, help="mali tablolar kaç günde bir yenilensin")
    ap.add_argument("--fund-max-per-run", type=int, default=200, help="bir çalışmada mali tablolar için en fazla istek (tam çekim 3, yeni bilanço kontrolü 1 istek)")
    ap.add_argument("--no-fundamentals", action="store_true")
    ap.add_argument("--no-intraday", action="store_true", help="4 saatlik sinyalleri atla (saatlik veri indirilmez)")
    ap.add_argument("--div-max-per-run", type=int, default=120, help="bir çalışmada en fazla kaç hissenin temettü geçmişi (temettuhisseleri) çekilsin")
    ap.add_argument("--sample", action="store_true", help="internetsiz deneme için ÖRNEK veri üret")
    ap.add_argument("--limit", type=int, default=0, help="yalnızca ilk N hisse (deneme için)")
    args = ap.parse_args()

    cache_dir = Path(args.cache_dir)
    tickers, tier, bist_names, index_date = load_universe(cache_dir)
    markets = load_markets(cache_dir)
    measures, measures_at = load_measures(cache_dir)
    upcoming, upcoming_at = ({}, None) if args.sample else fetch_upcoming_dividends(cache_dir)
    # Yakın İzleme Pazarı hisseleri endekslerde yer almaz; riskleri görünsün diye taramaya eklenir.
    yip = sorted(c for c, m in markets.items() if m == "YİP" and c not in tier)
    tickers = tickers + yip
    if args.limit:
        tickers = tickers[: args.limit]
    out = Path(args.out)
    hist_dir = out / "data" / "hist"
    hist_dir.mkdir(parents=True, exist_ok=True)
    fin_dir = out / "data" / "fin"
    fin_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    is_summ, is_fin, sample_funds = {}, {}, {}
    if args.sample:
        prices, sample_funds = make_sample(tickers + [INDEX])
    else:
        print(f"{len(tickers)} hisse + {INDEX} fiyatları indiriliyor…", flush=True)
        prices = download_prices(tickers + [INDEX])

    ok = [t for t in tickers if t in prices]
    failed = [t for t in tickers if t not in prices]
    print(f"Fiyat: {len(ok)}/{len(tickers)} hisse alındı.", flush=True)
    if len(ok) < max(1, len(tickers) // 2):
        print("HATA: hisselerin yarısından azı alınabildi; eski yayın korunması için durduruluyor.", file=sys.stderr)
        sys.exit(1)

    if not args.sample and not args.no_fundamentals:
        rank = {label: i for i, (_, label) in enumerate(TIERS)}
        by_priority = sorted(ok, key=lambda t: rank.get(tier.get(t), 9))  # BIST 30 → 50 → 100 → TÜM
        is_summ, is_fin = isyatirim.load(by_priority, cache_dir / "isyatirim.json", args.fund_max_age_days,
                                         args.fund_max_per_run, log=lambda s: print(s, flush=True))

    # Temettü geçmişi: temettuhisseleri.com hisse sayfaları (ana kaynak) ile Yahoo karşılaştırılıp düzeltilir
    site_div = {}
    if not args.sample:
        try:
            recent = {k: [x["date"] for x in v if x["date"]] for k, v in upcoming.items()}
            site_div = temettu.load(ok, cache_dir / "temettuhisseleri.json", recent, max_per_run=args.div_max_per_run,
                                    log=lambda s: print(s, flush=True))
        except Exception as e:  # noqa: BLE001 — kaynak çökerse Yahoo ile devam
            print(f"  temettuhisseleri alınamadı ({e}); temettüler yalnızca Yahoo'dan.", flush=True)
    div_notes, div_fix = [], {"fixed": 0, "added": 0, "site": 0}

    idx = prices.get(INDEX)
    # Piyasa temettü verimi (günlük, ödeyenlerin medyanı): verim bandını piyasa genelindeki seviye değişiminden arındırmak için
    mkt_yield = scores.market_yield({t: prices[t] for t in ok})
    mk = None
    if not args.sample:
        try:
            mk = dcf.market_inputs()
            print(f"DCF: ABD 10Y %{mk['rf'] * 100:.2f}, USD/TRY {float(mk['fx'].iloc[-1]):.2f}." if mk else "DCF: piyasa verisi alınamadı.", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"  DCF piyasa verisi alınamadı ({e}).", flush=True)
    stocks, div_events = [], {}
    for t in ok:
        df = prices[t]
        name = (is_summ.get(t) or {}).get("name") or bist_names.get(t) or ""
        gyo = t.endswith(("GY", "GYO")) or "GAYRİMENKUL YATIRIM" in name.upper() or "YATIRIM ORTAKLI" in name.upper()
        if site_div.get(t):
            new, st = temettu.merge(df, site_div[t], exempt_hint=gyo)
            df = df.assign(Dividends=new)
            div_fix["site"] += 1
            div_fix["fixed"] += st["fixed"]
            div_fix["added"] += st["added"]
            div_notes += [f"{t} {n}" for n in st["notes"]]
        write_hist(hist_dir / f"{t}.json", df)
        dv = df["Dividends"] if "Dividends" in df.columns else pd.Series(dtype=float)
        div_events[t] = [(d.tz_localize(None) if d.tzinfo else d, float(x)) for d, x in dv[dv > 0].items()]
        m = metrics(df, idx)
        m.update(div_metrics(df))
        m["divTax"] = 0.0 if gyo else 0.15  # portföyde net temettü tahmini için stopaj (GYO/YO muaf)
        m.update(sr_metrics(df))
        up = upcoming.get(t)
        if up:
            first = up[0]
            m.update({"divUpcoming": up, "nextDivDate": first["date"], "nextDivNet": first["net"],
                      "nextDivYield": first["net"] / m["last"] if first["net"] and m["last"] else None})
        if args.sample:
            f = sample_funds[t]
        else:
            s = is_summ.get(t) or {}
            f = {"name": s.get("name") or bist_names.get(t), "sector": s.get("sector"),
                 "freeFloat": s.get("freeFloat"), **isyatirim.ratios(m["last"], s, is_fin.get(t))}
        m.update(quality_scores(t, df, m, f, None if args.sample else is_fin.get(t), fin_dir, mkt_yield, mk))
        stocks.append({"t": t, "idx": tier.get(t), "mkt": markets.get(t), "tedbir": measures.get(t), **f, **m})
    print(f"Temettü: {div_fix['site']} hissede temettuhisseleri ile karşılaştırıldı; {div_fix['fixed']} kayıt düzeltildi, "
          f"{div_fix['added']} eksik kayıt eklendi.", flush=True)
    for n in div_notes[:40]:
        print("  " + n, flush=True)
    index_summary = None
    if idx is not None:
        write_hist(hist_dir / f"{INDEX}.json", idx)
        index_summary = {"t": INDEX, "name": "BIST 100", **metrics(idx, None)}

    # Sinyaller: kurulumlar, geriye dönük test ve aktif sinyaller (data/signals.json); aktif sinyal hisse özetine de eklenir
    try:
        write_signals(out, {t: prices[t] for t in ok}, stocks, prices.get(INDEX), intraday_on=not args.sample and not args.no_intraday,
                      div_events=div_events)
    except Exception as e:  # noqa: BLE001 — sinyal hatası yayını durdurmasın
        print(f"  Sinyaller üretilemedi ({e}).", flush=True)

    try:
        brd = breadth.compute({t: prices[t] for t in ok}, tier, idx)
        if brd:
            print(f"Piyasa genişliği: SMA50 üstü %{brd['a50'] * 100:.0f}, SMA200 üstü %{brd['a200'] * 100:.0f} · {brd['head']}", flush=True)
    except Exception as e:  # noqa: BLE001
        brd = None
        print(f"  Piyasa genişliği hesaplanamadı ({e}).", flush=True)
    summary = {
        "updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "lastDate": max(s["date"] for s in stocks),
        "indexDate": index_date,
        "divYear": int(max(s["date"] for s in stocks)[:4]),
        "tedbirAt": measures_at,
        "divUpAt": upcoming_at,
        # Piyasa son 12 ay temettü verimi (medyan) ve son 4 yıldaki yüzdelik dilimi
        "mktYield": round(float(mkt_yield.iloc[-1]), 5) if mkt_yield is not None else None,
        "mktYieldPct": round(float((mkt_yield < mkt_yield.iloc[-1]).mean()), 4) if mkt_yield is not None else None,
        "assets": {"TRY": {"last": 1.0, "chg1d": 0.0}} if args.sample else fetch_assets(),
        "sample": bool(args.sample),
        "source": "ÖRNEK VERİ" if args.sample else "Fiyat: Yahoo Finance (gecikmeli) · Mali tablolar: İş Yatırım",
        "index": index_summary,
        "breadth": brd,
        "failed": failed,
        "stocks": stocks,
    }
    if not args.sample:
        write_stable_history(out)
    (out / "data" / "summary.json").write_text(
        json.dumps(clean(summary), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Tamam: {out / 'data'} ({time.time() - t0:.0f} sn)", flush=True)


if __name__ == "__main__":
    main()
