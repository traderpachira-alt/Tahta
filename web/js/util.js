/* ============================================================
   Biçimlendirme
   ============================================================ */
export const nf = (min, max) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: min, maximumFractionDigits: max });
export const F0 = nf(0, 0), F1 = nf(1, 1), F2 = nf(2, 2), F4 = nf(2, 4);
export const ok = x => x != null && Number.isFinite(x);
export const fmt = {
  price: x => !ok(x) ? '—' : Math.abs(x) < 1 ? F4.format(x) : F2.format(x),
  pct: x => !ok(x) ? '—' : (x > 0 ? '+' : '') + F1.format(x * 100) + '%',
  pctPlain: x => !ok(x) ? '—' : F1.format(x * 100) + '%',
  num: x => !ok(x) ? '—' : F1.format(x),
  num2: x => !ok(x) ? '—' : F2.format(x),
  x: x => !ok(x) ? '—' : F2.format(x) + 'x',
  big: x => !ok(x) ? '—' : Math.abs(x) >= 1e9 ? F1.format(x / 1e9) + ' mlr' : Math.abs(x) >= 1e6 ? F1.format(x / 1e6) + ' mn' : F0.format(x),
  vol: x => !ok(x) ? '—' : Math.abs(x) >= 1e9 ? F2.format(x / 1e9) + ' Mr' : Math.abs(x) >= 1e6 ? F1.format(x / 1e6) + ' Mn' : Math.abs(x) >= 1e3 ? F1.format(x / 1e3) + ' B' : F0.format(x),
  date: s => s ? s.split('-').reverse().join('.') : '—',
};
export const cls = x => !ok(x) || x === 0 ? '' : x > 0 ? 'up' : 'down';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const TREND = { up: ['Yükseliş', 'up'], down: ['Düşüş', 'down'], flat: ['Yatay', ''] };
// Uzun açıklamalar: varsayılan kapalı, "ⓘ Nasıl hesaplanır?" satırına dokununca açılır
export const info = (html, label = 'Nasıl hesaplanır?') => `<details class="info"><summary>ⓘ ${label}</summary><div>${html}</div></details>`;
