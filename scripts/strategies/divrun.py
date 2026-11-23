"""Temettü Rallisi (temettü öncesi koşu): yüksek verimli temettünün hak kullanım tarihine doğru fiyatın yükselmesi (takvim / olay).

Kurallar:
  Olay: hak kullanım tarihi belli bir temettü; brüt verim (hisse başı brüt temettü / giriş günü kapanışı) ≥ %5
  Giriş: hak kullanımdan önceki son günden (temettü hakkı olan son gün) 10 işlem günü önce, kapanışta
  Çıkış: hak kullanımdan önceki son günün kapanışında (temettü alınmaz; temettü öncesi yükseliş alınır)
  Stop yok: işlem yalnızca son günün kapanışında kapanır. Pozisyon büyüklüğü ve R hesabı için nominal 1R = 3 ATR 14, en fazla
  fiyatın %14,9'u (motorun risk aralığı içinde kalsın, oynak dönemlerdeki işlemler elenmesin). Zarar 1R'yi aşabilir.
  Hazırlanan: hak kullanıma 11–15 işlem günü kalan (girişe 1–5 gün kalan) yüksek verimli açıklanmış temettüler
Olay verisi: EVENTS = {KOD: [(hak kullanım tarihi, hisse başı brüt temettü), ...]}; geçmiş hak kullanımları (bedelsize göre
düzeltilmiş, sitede doğrulanmış temettü verisi) + açıklanmış yaklaşan temettüler. fetch_data çalıştırmadan önce doldurur.
Geçmiş testte temettünün giriş gününde açıklanmış olduğu varsayılır (duyuru tarihleri veride yok); canlı sinyaller yalnızca
açıklanmış temettülerden üretilir. Gelecekteki tarihlere uzaklık iş günü olarak sayılır (resmî tatiller hesaba katılmaz).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ID = "divrun"
TIMEFRAMES = ("1D",)
VARIANTS = {"cum": "Hak kullanımdan önceki gün kapanışta çık"}
DEFAULT_V = "cum"
CUSTOM_EXITS = ("cum",)
TRAIL = (1.0, 1.0)
WARMUP = 30
ACCOUNT_RISK = 0.01
N_BEFORE = 10            # giriş: temettü hakkı olan son günden 10 işlem günü önce
CAND_FROM = 15           # hazırlanan: girişe kadar (son güne 15 … 11 işlem günü kala)
MIN_YIELD = 0.05
ATR_STOP = 3.0           # nominal 1R = 3 ATR …
R_CAP = 0.149            # … en fazla fiyatın %14,9'u (yalnızca pozisyon büyüklüğü ve R hesabı; gerçek stop yok)
CAND_MAX_DIST = None
COST = 0.002             # motorla aynı (signals.COST)
EVENTS: dict[str, list[tuple[pd.Timestamp, float]]] = {}

META = {
    "name": "Temettü Rallisi",
    "short": "Verimi ≥ %5 temettünün hak kullanımından 10 gün önce gir, son gün çık",
    "group": "olay",
    "status": "live",
    "candNote": "Açıklanmış, brüt verimi en az %5 olan ve girişe 1–5 iş günü kalan temettüler. Giriş, temettü hakkı olan son günden 10 iş günü önce kapanışta; resmî tatil varsa bir gün kayabilir. Stop yoktur; pozisyon büyüklüğü için 1R = 3 ATR (en fazla fiyatın %15'i).",
    "summary": "Yüksek verimli temettüsü açıklanmış hisseler hak kullanım tarihine doğru yükselir; temettü öncesi koşu alınır, temettü alınmadan çıkılır",
    "rules": [
        "Olay: hak kullanım tarihi açıklanmış temettü; brüt verim (hisse başı brüt temettü / giriş kapanışı) en az %5",
        "Giriş: temettü hakkı olan son günden 10 işlem günü önce, kapanışta",
        "Çıkış: temettü hakkı olan son günün (hak kullanımdan önceki gün) kapanışında; temettü alınmaz",
        "Stop yok: işlem yalnızca son gün kapanışında kapanır · Pozisyon büyüklüğü için 1R = 3 ATR (en fazla fiyatın %15'i); zarar 1R'yi aşabilir",
        "Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺ · yalnızca günlük mumlar",
        "Hazırlanan kurulumlar: girişe 1–5 işlem günü kalan (son güne 15–11 gün kalan) yüksek verimli temettüler",
    ],
    "notes": [
        "Etki verimle birlikte büyüdü: %5 üstü temettülerde 10 günlük getiri BIST 100'ü ortalama ~%5,6 geçti ve her yıl pozitifti (2023–2026).",
        "Stop kullanılmaz: 10 günlük kısa tutuşta stop, güçlü işlemlerin bir kısmını gürültüyle kapatıyordu. Bunun bedeli: tek işlemde zarar 1R'yi aşabilir (temettü kesilirse ya da piyasa sert düşerse). Pozisyon büyüklüğü 1R = 3 ATR'ye göre ayarlandığı için oynak hisselerde pozisyon küçüktür.",
        "Hak kullanım günü alıp tutmak işe yaramadı: temettü düşüşünden sonra fiyat toparlanmadı; etki tamamen öncesinde.",
        "Yılda 13–30 işlem, çoğu Mart–Nisan temettü sezonunda: sermaye yılın büyük bölümünde boştadır. Değeri diğer stratejilerle birlikte: aylık sonuçları morning star ve Donchian ile neredeyse ilişkisiz.",
        "Geçmiş testte temettünün giriş gününde açıklanmış olduğu varsayıldı (duyuru tarihleri veride yok). Canlı sinyaller yalnızca açıklanmış temettülerden üretilir.",
        "Hak kullanım tarihine uzaklık iş günü olarak sayılır; arada resmî tatil varsa giriş günü bir gün kayabilir. Hak kullanım tarihini kontrol edin.",
        "Verim brüt temettüye göredir; açıklanan net tutar stopajla (%15, GYO/YO %0) brüte çevrilir.",
    ],
}


def _bdays(d0, d1) -> int:
    return int(np.busday_count(pd.Timestamp(d0).date(), pd.Timestamp(d1).date()))


def _events(F) -> dict:
    """Bu hissenin olayları: {temettü hakkı olan son gün (çubuk indeksi; gelecekse tahmini): (hak kullanım tarihi, brüt tutar)}."""
    E = F.get("_ev")
    if E is None:
        E = F["_ev"] = {}
        idx = pd.DatetimeIndex(F["idx"])
        idx = idx.tz_localize(None) if idx.tz is not None else idx
        n, last = len(idx), idx[-1]
        for d, amt in EVENTS.get(F.get("sym"), []):
            d = pd.Timestamp(d)
            if d <= last:
                e = int(idx.searchsorted(d))
                if e >= n or abs((idx[e] - d).days) > 4:
                    continue
            else:
                e = n - 1 + _bdays(last, d)          # gelecekteki hak kullanım: iş günüyle tahmini çubuk
            if e >= 1 and amt and amt > 0:
                E[e - 1] = (d, float(amt))
    return E


def signal(F, t) -> dict | None:
    if t < WARMUP:
        return None
    ev = _events(F).get(t + N_BEFORE)
    if not ev or not np.isfinite(F["atr"][t]):
        return None
    d, amt = ev
    entry = F["c"][t]
    y = amt / entry
    if y < MIN_YIELD:
        return None
    return {"entry": entry, "stop": entry - _unit(F, t),
            "info": {"exd": d.strftime("%Y-%m-%d"), "y": round(y, 4), "ns": 1}}


def _unit(F, t) -> float:
    """Nominal 1R: 3 ATR, en fazla fiyatın %14,9'u (gerçek stop değil)."""
    return min(ATR_STOP * F["atr"][t], R_CAP * F["c"][t])


def baseline_stop(F, t) -> float:
    return F["c"][t] - _unit(F, t)


def simulate(F, t, entry, stop, mode, hold) -> dict:
    """Temettü hakkı olan son günün kapanışında çık (rastgele kıyasta: 10 gün sonra). Stop yok; 'stop' yalnızca 1R birimi."""
    n = len(F["c"])
    x = t + N_BEFORE
    risk = entry - stop
    cost_r = COST * entry / risk

    def res(status, px, i):
        return {"status": status, "r": (px - entry) / risk - cost_r, "pct": px / entry - 1 - COST, "exit_t": i, "exit": px}

    if x > n - 1:
        return {"status": "open", "r": (F["c"][-1] - entry) / risk, "pct": F["c"][-1] / entry - 1, "stop_now": stop, "armed": False}
    return res("cum", F["c"][x], x)


def candidate(F, b) -> dict | None:
    """Son gün (b) itibarıyla girişe 1–5 işlem günü kalan yüksek verimli temettü."""
    if b < WARMUP or not np.isfinite(F["atr"][b]):
        return None
    E, c = _events(F), F["c"][b]
    for k in range(N_BEFORE + 1, CAND_FROM + 1):
        ev = E.get(b + k)
        if not ev:
            continue
        d, amt = ev
        y = amt / c
        if y < MIN_YIELD:
            return None
        stop = c - _unit(F, b)
        idx = pd.DatetimeIndex(F["idx"])
        entry_day = pd.Timestamp(np.busday_offset(idx[b].date(), k - N_BEFORE, roll="forward"))
        return {"trig": c, "eff": c, "dist": 0.0, "stop": stop, "risk": (c - stop) / c, "fvg": None, "d1": b, "d2": b,
                "info": {"exd": d.strftime("%Y-%m-%d"), "y": round(y, 4), "in": k - N_BEFORE, "entry": entry_day.strftime("%Y-%m-%d"), "ns": 1}}
    return None
