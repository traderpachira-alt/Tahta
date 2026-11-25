"""Structure Break (yapı kırılımı): düşüş yapısından (LL + LH) sonra fiyatın daralan bir kararsız bölge (LH + HL)
oluşturması ve bölgenin tepesini yukarı kırması. Birden çok salınım ölçeğinde (k = 4…7) aranır; herhangi birinde kırılım
sinyaldir.

Kurallar (yalnızca o güne kadarki veri):
  Salınım noktası: k mumun her iki yanında en yüksek (tepe) / en düşük (dip); sağında k mum oluşunca kesinleşir.
       Ardışık aynı türden noktalarda daha uçta olan tutulur (tepe–dip sırası dönüşümlü).
  Yapı (son üç tepe T0, T1, T2 ve son üç dip D0, D1, D2):
       Düşüş: T1 < T0 ve D1 < D0 (alçalan tepe ve alçalan dip)
       Daralma: T2 < T1 ve D2 > D1 (daha alçak tepe, daha yüksek dip) → kararsız bölge [D2, T1]
  Kırılım: bölge oluştuktan sonra en fazla 30 mum içinde kapanış bölgenin tepesinin (T1) ilk kez üstünde;
       arada bölgenin dibinin (D2) altında kapanış olursa bölge geçersiz
  Ölçekler: k = 4, 5, 6, 7; herhangi birinde kırılım sinyaldir (aynı mumda birden çoksa en dar stoplu olan)
  Tekrar yok: bir önceki sinyalden sonraki 5 mum içinde yeni sinyal yok
  Stop: STOP_MODE (varsayılan: giriş − 2 ATR; seçenekler: bölge dibi − 0,2 ATR, giriş − 3 ATR, bölge ortası, kırılım mumunun dibi)
Kırılım günü için hacim / kapanış / gövde şartı yok: çok ölçekli yapıda bu şartlar iyi sinyalleri de eledi.
Varsayılan çıkış kanal çıkışı (Donchian ile aynı kural); karşılaştırma için 20 gün tut, takip eden stop, sabit 2R ve 3R.
"""
from __future__ import annotations

import numpy as np

from . import donchian as _dc

ID = "msbrk"
TIMEFRAMES = ("1D",)
VARIANTS = {"chan": "Kanal çıkışı (10 günlük dip)", "t20": "20 gün tut (20. gün kapanışı)", "trail": "Takip eden stop (+1R sonrası 1R)",
            "2": "Sabit hedef 2R", "3": "Sabit hedef 3R"}
DEFAULT_V = "chan"
CUSTOM_EXITS = ("t20", "chan")
REENTRY = 10         # stop olduktan sonra 10 gün içinde kapanış ilk girişin üstüne dönerse bir kez daha giriş (motor)
TRAIL = (1.0, 1.0)
WARMUP = 60
SCALES = (4, 5, 6, 7)
MAX_WAIT = 30
GAP = 5
HOLD = 20
COST = 0.002
STOP_MODE = "atr2"      # zone: bölge dibi − 0,2 ATR (en fazla 3 ATR) · atr2 / atr3: giriş − 2/3 ATR · mid: bölge ortası · bar: kırılım mumunun dibi
CAND_MAX_DIST = 0.05

META = {
    "name": "Structure Break",
    "short": "Düşüş yapısından sonra daralan bölgenin (LH + HL) yukarı kırılımı",
    "group": "dip",
    "status": "live",
    "summary": "Alçalan tepe ve diplerle düşen hisse daha alçak tepe ve daha yüksek dip yapıp daralınca, bu kararsız bölgenin tepesini kapanışla aştığında girilir",
    "candNote": "Düşüş yapısından sonra daralan bir bölge oluştu ve hâlâ geçerli: kapanış bölgenin tepesini (tetik) aşarsa sinyal oluşur. Bölge, oluştuktan sonraki 30 mum boyunca ya da dibinin altında kapanış olana kadar geçerlidir.",
    "rules": [
        "Salınım noktaları: tepe/dip, her iki yanında k mum boyunca en yüksek/en düşük; k = 4, 5, 6, 7 ölçeklerinin hepsinde aranır",
        "Düşüş yapısı: alçalan tepe (LH) ve alçalan dip (LL)",
        "Kararsız bölge: ardından daha alçak bir tepe (LH) ve daha yüksek bir dip (HL) — fiyat daralıyor; bölge = son dip ile önceki tepe arası",
        "Kırılım: bölge oluştuktan sonra en fazla 30 gün içinde kapanış bölgenin tepesinin ilk kez üstünde → o kapanışta giriş; arada bölgenin dibinin altında kapanış bölgeyi geçersiz kılar",
        "Stop: giriş − 2 ATR (1R = giriş − stop); bölgenin dibinin altında kapanış da çoğu zaman bu seviyeye yakındır · Likidite: 20 günlük ortalama işlem hacmi en az 20 mn ₺",
        "Çıkış: kapanış önceki 10 günün en düşüğünün altına inince o kapanıştan; başlangıç stopu her zaman geçerli · En fazla 60 işlem günü",
        "Yeniden giriş: başlangıç stopu tetiklendikten sonra 10 gün içinde kapanış ilk girişin üstüne dönerse bir kez daha girilir; yeni stop çıkıştan bu yana en düşük fiyatın 0,2 ATR altı (en fazla 3 ATR)",
    ],
    "notes": [
        "Kurallar, kaçırılan rallilerin çoğunun başladığı düşüş trendinden dönüş bölgesi için birçok kurgu arasından seçildi. Tek ölçekte (yalnızca k = 5) sonuç ayara hassastı; 4–7 ölçeklerinin birleşimi hem daha çok sinyal verdi hem de komşu ayarların (3–7, 3–6) hepsinde rastgele girişin üstünde kaldı.",
        "Kırılım günü için hacim ve güçlü kapanış şartı bu yapıda sonucu kötüleştirdi (özellikle 2025–26); yapının kendisi yeterli.",
        "Yükselişteki daralmanın (HH-HL sonrası LH-HL) kırılımı rastgele girişten iyi değildi; çoğu zaten Donchian'ın açık olduğu zamanlara denk geliyordu.",
        "Önceki düşüş yapısı şartı gerekli: yalnızca 'SMA200 altında ve daralıyor' şartıyla avantaj belirgin şekilde azaldı.",
        "Avantaj 2022–24'te daha büyüktü; 2025–26'da küçüldü ama rastgele girişin üstünde kaldı.",
        "Çıkış seçimi (Kasım 2026 testi, BIST TÜM, 100.000 ₺, %1 risk, nakitle sınırlı): kanal çıkışı ve sabit 3R ~215 bin ₺ ile önde, takip stopu ~212 bin, sabit 2R ~200 bin, 20 gün tut ~190 bin ₺. En düşük düşüş sabit 3R'de (−%15; kanal çıkışında −%25). Kanal çıkışı varsayılan: rastgele girişe göre farkı en büyük ve her yıl artıda. Güncel değerler yukarıdaki tabloda.",
        "Stop seçimi (Kasım 2026 testi, aynı koşullar, kanal çıkışı): giriş − 2 ATR ~269 bin, giriş − 3 ATR ~253 bin, bölge dibi ~216 bin, bölge ortası ~192 bin, kırılım mumunun dibi ~183 bin ₺. Varsayılan giriş − 2 ATR: en yüksek bakiye, düşüş bölge dibi stopuyla aynı (−%25). Kırılım mumunun dibi gibi dar stoplar daha çok erken stop oldu.",
        "Hesapta sinyallerin yaklaşık yarısı nakit yetmediği için kaçıyor (sinyaller düşüş sonrası toparlanmalarda yığılıyor); sınırsız hesapta bütün sinyallere girilse sonuç çok daha yüksek ama aynı anda bakiyenin ~7 katı pozisyon gerekir.",
        "Yeniden giriş: zarar eden işlemlerin çoğu rallinin ilk günlerindeki sert bir silkelemede stop oluyor ve fiyat sonra girişin üstüne dönüyordu. Kasım 2026 testinde (BIST TÜM) 82 yeniden giriş ortalama +1,28R getirdi; nakitle sınırlı hesap ~269 binden ~544 bin ₺'ye çıktı. BIST 100'de etkisi hafif olumsuzdu (~167 → ~134 bin ₺).",
        "Rastgele giriş kıyası, SMA200 altındaki günlerden aynı stop mesafesiyle (2 ATR) yapılır.",
    ],
}


def _pivots(h, l, k):
    import pandas as pd
    # i'nin her iki yanında k mum: ortalanmış kayan pencere (kenarlarda ve eksik veri içeren pencerelerde NaN → nokta yok)
    hmax = pd.Series(h).rolling(2 * k + 1, center=True).max().to_numpy()
    lmin = pd.Series(l).rolling(2 * k + 1, center=True).min().to_numpy()
    isH, isL = h == hmax, l == lmin
    raw = []
    for i in np.flatnonzero(isH | isL):
        if isH[i]:
            raw.append((int(i), "H", float(h[i])))
        if isL[i]:
            raw.append((int(i), "L", float(l[i])))
    seq = []
    for p in raw:
        if seq and seq[-1][1] == p[1]:
            if (p[1] == "H" and p[2] >= seq[-1][2]) or (p[1] == "L" and p[2] <= seq[-1][2]):
                seq[-1] = p
            continue
        seq.append(p)
    return seq


def _scan(F, k):
    """Bir ölçekte: kırılım mumları {t: (dip, tepe)} ve son mumda hâlâ geçerli bölge (dip, tepe, oluşma) ya da None.
    Hareketli bir göstergeye bağlı olmadığı için bütün geçmiş taranır; her mumda yalnızca o ana kadar kesinleşen noktalar kullanılır.
    Kesinleşme sırası, tepe-dip dizisinin oluşma sırasından farklı olabilir (tepe ve dip aynı mumda olabilir); bu yüzden
    t anında bilinen dizi, kesinleşme mumu t'ye kadar olan noktalardan yeniden kurulur."""
    c, h, l = F["c"], F["h"], F["l"]
    seq = _pivots(h, l, k)
    known, j, zone, sig = [], 0, None, {}
    for t in range(k + 1, len(c)):
        new = False
        while j < len(seq) and seq[j][0] + k <= t:
            known.append(seq[j]); j += 1; new = True
        if new and len(known) >= 6:
            hs = [p[2] for p in known[-6:] if p[1] == "H"]
            ls = [p[2] for p in known[-6:] if p[1] == "L"]
            zone = None
            if len(hs) >= 3 and len(ls) >= 3:
                h0, h1, h2 = hs[-3:]
                l0, l1, l2 = ls[-3:]
                if h1 < h0 and l1 < l0 and h2 < h1 and l2 > l1:
                    zone = (l2, h1, t)
        if zone is None:
            continue
        zb, zt, t0 = zone
        if c[t] < zb or t - t0 > MAX_WAIT:
            zone = None
            continue
        if c[t] > zt and c[t - 1] <= zt:
            sig[t] = (zb, zt)
            zone = None
    return sig, zone


def _stop(F, t, zb, zt):
    e, a = F["c"][t], F["atr"][t]
    if STOP_MODE == "atr2":
        return e - 2 * a
    if STOP_MODE == "atr3":
        return e - 3 * a
    if STOP_MODE == "mid":
        return max((zb + zt) / 2, e - 3 * a)
    if STOP_MODE == "bar":
        return min(F["l"][t], e - 0.5 * a) - 0.1 * a
    return max(zb - 0.2 * a, e - 3 * a)


def _stop_at(e, a, zb, zt=None):
    """Hazırlanan kurulum için tahmini stop: giriş tetik fiyatında yapılırsa (_stop ile aynı kural)."""
    if STOP_MODE == "atr2":
        return e - 2 * a
    if STOP_MODE == "atr3":
        return e - 3 * a
    if STOP_MODE == "mid" and zt is not None:
        return max((zb + zt) / 2, e - 3 * a)
    return max(zb - 0.2 * a, e - 3 * a)


def _prep(F) -> dict:
    P = F.get("_msb")
    if P is not None:
        return P
    per, zones = {}, []
    for k in SCALES:
        sig, zone = _scan(F, k)
        for t, z in sig.items():
            per.setdefault(t, []).append(z)
        if zone is not None:
            zones.append(zone)
    out, last = {}, -10**9
    for t in sorted(per):
        if t <= last + GAP or not np.isfinite(F["atr"][t]):
            continue
        out[t] = max(per[t], key=lambda z: _stop(F, t, *z))      # en dar stoplu (en yüksek stop) bölge
        last = t
    P = F["_msb"] = {"sig": out, "zones": zones}
    return P


def signal(F, t) -> dict | None:
    if t < WARMUP:
        return None
    z = _prep(F)["sig"].get(t)
    if not z:
        return None
    return {"entry": F["c"][t], "stop": _stop(F, t, *z), "info": {"zone2": [round(z[0], 4), round(z[1], 4)]}}


def baseline_stop(F, t) -> float:
    return F["c"][t] - 2 * F["atr"][t]


def baseline_ok(F, t) -> bool:
    """Rastgele kıyas: SMA200 altındaki günler (düşüş bölgesi)."""
    P = F.get("_msb_s200")
    if P is None:
        import pandas as pd
        P = F["_msb_s200"] = pd.Series(F["c"]).rolling(200).mean().to_numpy()
    return t >= 200 and bool(F["c"][t] < P[t])


def simulate(F, t, entry, stop, mode, hold) -> dict:
    """t20: başlangıç stopu + 20. işlem günü kapanışında çıkış. chan: Donchian'ın kanal çıkışı."""
    if mode == "chan":
        return _dc.simulate(F, t, entry, stop, mode, hold)
    n = len(F["c"])
    risk = entry - stop
    cost_r = COST * entry / risk

    def res(status, px, i):
        return {"status": status, "r": (px - entry) / risk - cost_r, "pct": px / entry - 1 - COST, "exit_t": i, "exit": px}

    for i in range(t + 1, min(n, t + 1 + HOLD)):
        if F["l"][i] <= stop:
            return res("stop", min(stop, F["o"][i]) if i > t + 1 else stop, i)
    if n - 1 < t + HOLD:
        return {"status": "open", "r": (F["c"][-1] - entry) / risk, "pct": F["c"][-1] / entry - 1, "stop_now": stop, "armed": False}
    return res("time", F["c"][t + HOLD], t + HOLD)


def candidate(F, b) -> dict | None:
    """Son mumda hâlâ geçerli bir bölge var ve fiyat tepesine en fazla %5 uzakta: kapanış bölge tepesini aşarsa sinyal."""
    if b < WARMUP or not np.isfinite(F["atr"][b]):
        return None
    c = F["c"]
    best = None
    for zb, zt, t0 in _prep(F)["zones"]:
        if c[b] > zt or c[b] < zb or b - t0 >= MAX_WAIT:
            continue
        dist = zt / c[b] - 1
        if dist <= CAND_MAX_DIST and (best is None or dist < best[0]):
            best = (dist, zb, zt, t0)
    if not best:
        return None
    dist, zb, zt, t0 = best
    a = float(F["atr"][b])
    stop = _stop_at(zt, a, zb)
    return {"trig": zt, "eff": zt, "dist": dist, "stop": stop, "risk": (zt - stop) / zt, "fvg": None,
            "d1": max(0, t0 - 15), "d2": b, "info": {"zone2": [round(zb, 4), round(zt, 4)]}}
