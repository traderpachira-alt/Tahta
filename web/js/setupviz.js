import { F1, F2, esc, fmt, ok } from './util.js';

/* ============================================================
   Kurulum çizimi: sinyal satırında hisse koduna gelince (telefonda basılı tutunca) açılan sade mini grafik.
   Sinyalden önceki 6 mum + sonrası; giriş, stop, hedef/+1R/kanal çıkışı ve stratejiye özgü yapı (FVG bölgesi,
   kanal tepesi, morning star mumları) çizilir. Veri: kayıtlardaki "bars" (signals.json).
   ============================================================ */
const W = 440, H = 230, PL = 6, PT = 10, PB = 22, CH = 5.8; // CH: 9,5 px mono yazıda karakter genişliği
const pct = (x, e) => ok(x) && ok(e) && e ? (x > e ? '+' : '') + F1.format((x / e - 1) * 100) + '%' : '';
const dshort = d => { const [day, time] = String(d).split(' '); return time ? `${fmt.date(day).slice(0, 5)} ${time}` : fmt.date(day).slice(0, 5); };

function levels(a, u) {
  const L = [];
  const isCand = ok(a.trig), isRec = ok(a.x);
  if (isCand) {
    L.push({ y: a.eff, cls: 'lv-entry dash', lab: 'Tetik' });
    if (ok(a.s) && !a.info?.ns) L.push({ y: a.s, cls: 'lv-stop dash', lab: 'Tahmini stop' });
  } else {
    L.push({ y: a.e, cls: 'lv-entry', lab: 'Giriş' });
    if (!a.info?.ns) L.push({ y: a.s0, cls: 'lv-stop', lab: 'Stop' });
    if (!isRec && a.armed && ok(a.s) && a.s !== a.s0) L.push({ y: a.s, cls: 'lv-stop dash', lab: 'Takip stopu' });
    if (!isRec && ok(a.xl) && a.xl > a.s) L.push({ y: a.xl, cls: 'lv-warn dash', lab: 'Kanal çıkışı' });
    if (ok(a.a)) L.push({ y: a.a, cls: 'lv-tp dash', lab: u?.defaultV === 'trail' ? '+1R (takip)' : 'Hedef' });
    if (isRec) L.push({ y: a.x, cls: 'lv-exit dot', lab: 'Çıkış' });
  }
  if (ok(a.info?.top)) L.push({ y: a.info.top, cls: 'lv-muted dot', lab: '20 gün tepe' });
  if (ok(a.info?.avwap)) L.push({ y: a.info.avwap, cls: 'lv-muted dot', lab: 'Tepe VWAP' });
  if (ok(a.info?.sma200)) L.push({ y: a.info.sma200, cls: 'lv-muted dot', lab: 'SMA200' });
  return L.filter(l => ok(l.y));
}

export function setupSvg(a, u) {
  const B = a.bars;
  if (!B || !B.c?.length) return '<p class="muted">Bu kayıt için mum verisi yok.</p>';
  const n = B.c.length, L = levels(a, u).map(l => ({ ...l, txt: `${l.lab} ${fmt.price(l.y)}` }));
  const PR = Math.max(60, Math.ceil(Math.max(0, ...L.map(l => l.txt.length)) * CH) + 8);
  const zone = a.info?.fvg || a.info?.zone;
  let lo = Math.min(...B.l, ...L.map(l => l.y), ...(zone || [])), hi = Math.max(...B.h, ...L.map(l => l.y), ...(zone || []));
  const pad = (hi - lo) * 0.06 || hi * 0.02; lo -= pad; hi += pad;
  const pw = W - PL - PR, ph = H - PT - PB, step = pw / n, cw = Math.max(1.5, Math.min(9, step * 0.62));
  const X = i => PL + step * (i + 0.5), Y = v => PT + (hi - v) / (hi - lo) * ph;
  const parts = [];
  // Stratejiye özgü yapı
  if (zone) parts.push(`<rect x="${PL}" width="${pw}" y="${Y(zone[1]).toFixed(1)}" height="${Math.max(1, Y(zone[0]) - Y(zone[1])).toFixed(1)}" class="sv-zone"/>`
    + `<text x="${PL + 4}" y="${(Y(zone[1]) + 10).toFixed(1)}" class="sv-ztxt">FVG</text>`);
  if (a.k === 'morningstar' && B.i >= 0) {
    const first = ok(a.trig) ? B.i : B.i - 2, last = ok(a.trig) ? B.i + 1 : B.i;
    parts.push(`<rect x="${(X(first) - step / 2).toFixed(1)}" width="${(step * (last - first + 1)).toFixed(1)}" y="${PT}" height="${ph}" class="sv-band"/>`);
  }
  if (a.k === 'fvgpb' && ok(a.trig)) parts.push(`<rect x="${(X(B.i) - step / 2).toFixed(1)}" width="${(step * (n - B.i)).toFixed(1)}" y="${PT}" height="${ph}" class="sv-band"/>`);
  // Mumlar
  for (let i = 0; i < n; i++) {
    const up = B.c[i] >= B.o[i], x = X(i).toFixed(1);
    const y1 = Y(Math.max(B.o[i], B.c[i])), y2 = Y(Math.min(B.o[i], B.c[i]));
    parts.push(`<line x1="${x}" x2="${x}" y1="${Y(B.h[i]).toFixed(1)}" y2="${Y(B.l[i]).toFixed(1)}" class="${up ? 'sv-up' : 'sv-dn'}"/>`
      + `<rect x="${(X(i) - cw / 2).toFixed(1)}" width="${cw.toFixed(1)}" y="${y1.toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" class="${up ? 'sv-up' : 'sv-dn'} body"/>`);
  }
  // Sinyal mumu işareti
  if (B.i >= 0 && B.i < n) {
    const x = X(B.i), y = Y(B.l[B.i]) + 6;
    parts.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} l-4 7 h8 z" class="sv-mark"/>`);
  }
  // Seviyeler ve sağdaki etiketler (çakışmasın diye aralarında en az 12 px)
  const lab = L.map(l => ({ ...l, py: Y(l.y) })).sort((p, q) => p.py - q.py);
  for (let i = 1; i < lab.length; i++) if (lab[i].py - lab[i - 1].py < 12) lab[i].py = lab[i - 1].py + 12;
  for (const l of lab) {
    const y = Y(l.y).toFixed(1);
    parts.push(`<line x1="${PL}" x2="${PL + pw}" y1="${y}" y2="${y}" class="sv-lv ${l.cls}"/>`
      + `<text x="${PL + pw + 4}" y="${(l.py + 3.5).toFixed(1)}" class="sv-lab ${l.cls}">${esc(l.txt)}</text>`);
  }
  const axis = `<text x="${PL}" y="${H - 6}" class="sv-ax">${esc(dshort(B.d[0]))}</text>`
    + (B.i >= 0 && B.i < n ? `<text x="${X(B.i).toFixed(1)}" y="${H - 6}" class="sv-ax" text-anchor="middle">${esc(dshort(B.d[B.i]))}</text>` : '')
    + `<text x="${PL + pw}" y="${H - 6}" class="sv-ax" text-anchor="end">${esc(dshort(B.d[n - 1]))}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="setupsvg" role="img" aria-label="${esc(a.t)} kurulum çizimi">${parts.join('')}${axis}</svg>`;
}

export function setupFacts(a) {
  const f = [];
  if (ok(a.trig)) {
    f.push(['Tetik (kapanış >)', `${fmt.price(a.eff)} <small>${pct(a.eff, a.c)}</small>`]);
    if (ok(a.s) && !a.info?.ns) f.push(['Tahmini stop', `${fmt.price(a.s)} <small>%${F1.format(a.risk * 100)} risk</small>`]);
  } else {
    f.push(['Giriş', fmt.price(a.e)]);
    if (!a.info?.ns) f.push(['Stop', `${fmt.price(a.s0)} <small class="down">${pct(a.s0, a.e)}</small>`]);
    if (ok(a.a)) f.push([a.armed ? 'Takip' : 'Hedef / +1R', `${fmt.price(a.a)} <small class="up">${pct(a.a, a.e)}</small>`]);
    if (ok(a.xl) && a.xl > a.s) f.push(['Kanal çıkışı', `kapanış &lt; ${fmt.price(a.xl)}`]);
    if (ok(a.x)) f.push(['Çıkış', `${fmt.price(a.x)} · ${esc(dshort(a.xd))}`]);
    if (ok(a.r)) f.push([ok(a.x) ? 'Sonuç' : 'Güncel', `<b class="${a.r > 0 ? 'up' : a.r < 0 ? 'down' : ''}">${a.r > 0 ? '+' : ''}${F2.format(a.r)}R</b>`]);
  }
  return `<dl class="svfacts">${f.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}
