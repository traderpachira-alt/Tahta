"""Göreli güç rotasyonu (portföy stratejisi): her ay en güçlü 10 BIST 100 hissesini eşit ağırlıkla tut.

Kurallar (yalnızca karar anına kadarki veri):
  Evren: BIST 100 (30/50/100) · 20 günlük ortalama işlem hacmi ≥ 20 mn ₺
  Güç: son 6 ayın getirisi, son ay hariç (126 → 21 işlem günü önce) / son 6 ayın günlük getiri oynaklığı
  Aşırı yükselmiş hariç: 6 aylık getirisi +%200'ü aşanlar alınmaz (balon riski)
  Dengeleme: her ayın ilk işlem günü, bir önceki kapanışa göre sıralanır; en güçlü 10 hisse eşit ağırlıkla (%10) alınır
  Piyasa filtresi: BIST 100, 200 günlük ortalamasının altındaysa o ay nakitte kalınır
  Maliyet: değişen pozisyonlar için gidiş-dönüş %0,2
Veri temizliği: %22'den büyük günlük hareketler (BIST fiyat sınırı ~%10) düzeltilmemiş bölünme/veri hatası sayılır.
Motorun işlem bazlı (giriş/stop) yapısını kullanmaz; kendi aylık portföy simülasyonunu yürütür.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ID = "rsrot"
KIND = "portfolio"
TIMEFRAMES = ("1M",)
UNIVERSE = ("30", "50", "100")
TOP_N = 10
LOOK, SKIP = 126, 21
MAX_RUN = 2.0             # 6 aylık getiri +%200 üstü alınmaz
MIN_TURNOVER = 20e6
REGIME_N = 200
COST = 0.002
BAD_MOVE = 0.22
CAPITAL = 100_000
YEARS = 4

META = {
    "name": "Göreli güç rotasyonu",
    "short": "Her ay BIST 100'ün en güçlü 10 hissesi, oynaklığa göre ayarlı",
    "group": "portfoy",
    "status": "live",
    "summary": "Son 6 ayda oynaklığına göre en güçlü yükselen 10 BIST 100 hissesi her ay yenilenen eşit ağırlıklı bir portföyde tutulur",
    "rules": [
        "Evren: BIST 100 hisseleri; 20 günlük ortalama işlem hacmi en az 20 mn ₺",
        "Güç: son 6 ayın getirisi (son ay hariç) / aynı dönemin günlük oynaklığı — sakin ve istikrarlı yükselenler öne çıkar",
        "Aşırı yükselmiş hariç: son 6 ayda +%200'ün üstünde yükselenler alınmaz",
        "Dengeleme: her ayın ilk işlem günü, bir önceki kapanışa göre en güçlü 10 hisse eşit ağırlıkla (%10'ar) alınır; ay boyunca tutulur",
        "Piyasa filtresi: BIST 100 200 günlük ortalamasının altındaysa o ay nakitte kalınır",
        "Maliyet: değişen pozisyonlar için gidiş-dönüş %0,2",
    ],
    "notes": [
        "Kurallar birçok varyasyon arasından aynı 4 yıllık veride seçildi; sonuç bir hipotezdir, canlı sonuçları izleyin.",
        "Ham momentum (oynaklık ayarı ve +%200 sınırı olmadan) BIST 100'de endeksi belirgin geçmedi ve düşüşü büyüttü (−%44).",
        "BIST TÜM'de aynı yaklaşım 2025–26'nın balon hisselerini seçti; Eylül–Ekim 2026'da bunlar bir ayda %70–90 çöktü. Bu yüzden yalnızca BIST 100.",
        "Bu bir sinyal değil, portföy kuralıdır: sermayenin bir kısmını sürekli piyasada tutan çekirdek katman olarak düşünülmüştür. Stop yoktur; risk, 10 hisseye yayılma ve aylık yenileme ile sınırlanır.",
        "Test bugünkü BIST 100 üyeleriyle yapıldı; geçmişte endeksten çıkan zayıf hisseler testte yok, bu sonucu bir miktar iyi gösterebilir.",
    ],
}


def _clean(prices: dict[str, pd.DataFrame]):
    def nz(s):
        s = s.copy()
        s.index = s.index.tz_localize(None) if getattr(s.index, "tz", None) is not None else s.index
        return s
    C = pd.DataFrame({k: nz(v["Close"]) for k, v in prices.items()}).sort_index()
    V = pd.DataFrame({k: nz(v["Volume"]) for k, v in prices.items()}).reindex(C.index)
    turn = (C * V).rolling(20).mean()
    r = C.pct_change()
    r = r.mask(r.abs() > BAD_MOVE, 0.0)
    clean = (1 + r.fillna(0.0)).cumprod().where(C.notna())
    return C, clean, r, turn


def _scores(clean, r, turn, mem, t0):
    mom = (clean.iloc[t0 - SKIP] / clean.iloc[t0 - LOOK] - 1)[mem].dropna()
    mom = mom[turn.iloc[t0][mom.index] >= MIN_TURNOVER]
    mom = mom[mom <= MAX_RUN]
    vol = r.iloc[t0 - LOOK + 1:t0 + 1][mom.index].std()
    sc = (mom / vol).replace([np.inf, -np.inf], np.nan).dropna()
    return sc.sort_values(ascending=False), mom, vol


def run(prices: dict[str, pd.DataFrame], tiers: dict[str, str | None], idx: pd.DataFrame | None) -> dict:
    mem = [t for t, ti in tiers.items() if ti in UNIVERSE and t in prices]
    C, clean, r, turn = _clean({t: prices[t] for t in mem})
    xu = idx["Close"].copy()
    xu.index = xu.index.tz_localize(None) if getattr(xu.index, "tz", None) is not None else xu.index
    xu = xu.reindex(C.index).ffill()
    start = C.index[-1] - pd.DateOffset(years=YEARS)
    firsts = pd.Series(C.index, index=C.index).groupby(C.index.to_period("M")).first()
    reb = [d for d in firsts if d >= start and C.index.get_loc(d) > LOOK + 1]
    eq, curve, hold, since, rows = 1.0, [], [], {}, []
    for i, d in enumerate(reb):
        t0 = C.index.get_loc(d) - 1
        end = C.index.get_loc(reb[i + 1]) - 1 if i + 1 < len(reb) else len(C) - 1
        on = bool(xu.iloc[t0] > xu.iloc[max(0, t0 - REGIME_N):t0 + 1].mean())
        sc, _, _ = _scores(clean, r, turn, mem, t0)
        pick = list(sc.index[:TOP_N]) if on else []
        chg = len(set(pick) ^ set(hold)) / TOP_N / 2
        ins, outs = sorted(set(pick) - set(hold)), sorted(set(hold) - set(pick))
        for t in ins:
            since[t] = d
        for t in outs:
            since.pop(t, None)
        hold = pick
        if pick:
            seg = clean.iloc[t0:end + 1][pick].ffill()
            path = (seg / seg.iloc[0]).mean(axis=1).to_numpy()
        else:
            path = np.ones(end - t0 + 1)
        eqs = eq * path * (1 - chg * 2 * COST)
        curve += list(eqs[1:])
        rows.append({"d": d, "r": float(eqs[-1] / eq - 1), "xu": float(xu.iloc[end] / xu.iloc[t0] - 1), "on": on,
                     "in": ins, "out": outs, "complete": i + 1 < len(reb)})
        eq = float(eqs[-1])
    curve = np.array(curve)
    yrs = max((C.index[-1] - reb[0]).days / 365.25, 0.1)
    mdd = float((1 - curve / np.maximum.accumulate(curve)).max()) if len(curve) else 0.0
    done = [x for x in rows if x["complete"]]
    xs = xu[xu.index >= reb[0]]
    bench = {"cagr": round(float((xs.iloc[-1] / xs.iloc[0]) ** (1 / yrs) - 1), 4), "mdd": round(float((1 - xs / xs.cummax()).max()), 4),
             "final": round(CAPITAL * float(xs.iloc[-1] / xs.iloc[0]))}
    years = {}
    for x in rows:
        y = str(x["d"].year)
        a = years.setdefault(y, {"r": 1.0, "xu": 1.0, "n": 0})
        a["r"] *= 1 + x["r"]; a["xu"] *= 1 + x["xu"]; a["n"] += 1
    years = {y: {"r": round(v["r"] - 1, 4), "xu": round(v["xu"] - 1, 4), "n": v["n"]} for y, v in years.items()}
    # Güncel portföy (son dengeleme) ve bugün sıralansa
    last = len(C) - 1
    sc_now, mom_now, vol_now = _scores(clean, r, turn, mem, last)
    t_reb = C.index.get_loc(reb[-1]) - 1
    holdings = []
    for k, t in enumerate(hold, 1):
        base = clean.iloc[C.index.get_loc(since[t]) - 1][t]
        holdings.append({"t": t, "rank": k, "idx": tiers.get(t), "since": since[t].strftime("%Y-%m-%d"),
                         "ret": round(float(clean.iloc[last][t] / base - 1), 4),
                         "retM": round(float(clean.iloc[last][t] / clean.iloc[t_reb][t] - 1), 4),
                         "nowRank": int(list(sc_now.index).index(t) + 1) if t in sc_now.index else None, "c": round(float(C.iloc[last][t]), 4)})
    on_now = bool(xu.iloc[last] > xu.iloc[max(0, last - REGIME_N):last + 1].mean())
    preview = [{"t": t, "rank": k, "idx": tiers.get(t), "mom": round(float(mom_now[t]), 4), "vol": round(float(vol_now[t] * np.sqrt(252)), 4),
                "score": round(float(sc_now[t]), 3), "held": t in hold} for k, t in enumerate(sc_now.index[:15], 1)]
    nxt = (C.index[-1] + pd.offsets.MonthBegin(1))
    nxt = pd.Timestamp(np.busday_offset(nxt.date(), 0, roll="forward"))
    return {
        "stats": {"months": len(done), "beat": round(float(np.mean([x["r"] > x["xu"] for x in done])), 3) if done else None,
                  "avgM": round(float(np.mean([x["r"] for x in done])), 4) if done else None,
                  "avgXu": round(float(np.mean([x["xu"] for x in done])), 4) if done else None,
                  "cash": sum(1 for x in done if not x["on"])},
        "account": {"final": round(CAPITAL * eq), "cagr": round(eq ** (1 / yrs) - 1, 4), "mdd": round(mdd, 4), "years": round(yrs, 1),
                    "taken": len(rows)},
        "bench": bench, "years": years, "holdings": holdings, "preview": preview,
        "history": [{"d": x["d"].strftime("%Y-%m-%d"), "r": round(x["r"], 4), "xu": round(x["xu"], 4), "on": x["on"], "in": x["in"], "out": x["out"]}
                    for x in rows[-12:]][::-1],
        "regime": {"on": on_now, "heldOn": rows[-1]["on"] if rows else None},
        "rebalanced": reb[-1].strftime("%Y-%m-%d"), "next": nxt.strftime("%Y-%m-%d"),
    }
