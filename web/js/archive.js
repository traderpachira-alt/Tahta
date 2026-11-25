import { view } from './dom.js';
import { persist, state } from './store.js';
import { F1, F2, cls, esc, fmt } from './util.js';

/* ============================================================
   Trade arşivi: stratejilerin geriye dönük testteki bütün işlemleri (varsayılan çıkış) ve açık işlemler, filtrelenebilir.
   Veri: data/trades.json (scripts/fetch_data.py → archive_rows); yalnızca bu sayfa açılınca yüklenir.
   ============================================================ */
let ARC = null, shown = 100;
const PAGE = 200;
const TIER_OF = { 'BIST 30': ['30'], 'BIST 50': ['30', '50'], 'BIST 100': ['30', '50', '100'], 'BIST TÜM': ['30', '50', '100', 'TÜM'] };
const EXIT = {
  open: ['Açık', ''], stop: ['Stop', 'down'], chan: ['Kanal çıkışı', ''], trail: ['Takip stopu', ''], tp: ['Hedef', 'up'],
  time: ['Süre doldu', 'warn'], cum: ['Son gün çıkışı', ''],
};
const R_TL = 1000;   // toplam sonucu TL'ye çevirmek için 1R = 1.000 ₺ (100.000 ₺ bakiyenin %1'i)
const rFmt = x => (x > 0 ? '+' : '') + F2.format(x) + 'R';
const pctFmt = x => (x > 0 ? '+' : '') + F1.format(x * 100) + '%';
const dshort = d => { if (!d) return '—'; const [day, time] = d.split(' '); return time ? `${fmt.date(day)} ${time}` : fmt.date(day); };
const days = (a, b) => Math.round((new Date((b || '').slice(0, 10)) - new Date(a.slice(0, 10))) / 864e5);

async function load() {
  if (ARC) return ARC;
  const r = await fetch('data/trades.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  const j = await r.json();
  const c = Object.fromEntries(j.cols.map((k, i) => [k, i]));
  const list = j.rows.map(x => ({
    k: j.strategies[x[c.k]].id, kn: j.strategies[x[c.k]].name, tf: x[c.tf], t: x[c.t], idx: x[c.idx], d0: x[c.d0], d1: x[c.d1],
    e: x[c.e], x: x[c.x], pct: x[c.pct], r: x[c.r], st: x[c.st], re: !!x[c.re],
  }));
  ARC = { updated: j.updated, strategies: j.strategies, list, years: [...new Set(list.map(a => a.d0.slice(0, 4)))].sort().reverse() };
  return ARC;
}

const F = () => (state.arc ??= { k: '', tf: '', tier: 'BIST TÜM', y: '', res: '', st: '', q: '', sort: 'd' });

function filtered() {
  const f = F(), tiers = TIER_OF[f.tier] || TIER_OF['BIST TÜM'], q = f.q.trim().toLocaleUpperCase('tr');
  let L = ARC.list.filter(a => (!f.k || a.k === f.k) && (!f.tf || a.tf === f.tf) && tiers.includes(a.idx) && (!f.y || a.d0.startsWith(f.y))
    && (!f.res || (f.res === 'open' ? a.st === 'open' : a.st !== 'open' && (f.res === 'win' ? a.r > 0 : a.r <= 0)))
    && (!f.st || a.st === f.st) && (!q || a.t.startsWith(q)));
  const by = { d: (a, b) => (b.d0 > a.d0) - (b.d0 < a.d0) || (a.t > b.t) - (a.t < b.t), 'r-': (a, b) => b.r - a.r, 'r+': (a, b) => a.r - b.r, p: (a, b) => b.pct - a.pct };
  return L.sort(by[f.sort] || by.d);
}

function summary(L) {
  const C = L.filter(a => a.st !== 'open'), open = L.length - C.length;
  if (!C.length) return `<p class="muted">${L.length ? `Seçimde ${open} açık işlem var; sonuçlanan işlem yok.` : 'Bu filtrelerle işlem yok.'}</p>`;
  const rs = C.map(a => a.r), sum = rs.reduce((s, x) => s + x, 0), win = rs.filter(x => x > 0).length;
  const best = C.reduce((m, a) => a.r > m.r ? a : m), worst = C.reduce((m, a) => a.r < m.r ? a : m);
  const avgDays = C.reduce((s, a) => s + days(a.d0, a.d1), 0) / C.length;
  const tile = (lab, val, sub = '') => `<div class="arcstat"><span class="muted">${lab}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<div class="arcstats">
    ${tile('Sonuçlanan işlem', fmt.big(C.length), open ? `+ ${open} açık` : '')}
    ${tile('Kârlı', `%${Math.round(win / C.length * 100)}`, `${win} / ${C.length}`)}
    ${tile('İşlem başına', `<span class="${cls(sum)}">${rFmt(sum / C.length)}</span>`)}
    ${tile('Toplam', `<span class="${cls(sum)}">${rFmt(sum)}</span>`, `1R = 1.000 ₺ ile ${(sum > 0 ? '+' : '−') + fmt.big(Math.abs(sum * R_TL))} ₺`)}
    ${tile('En iyi', `<span class="up">${rFmt(best.r)}</span>`, `${esc(best.t)} · ${fmt.date(best.d0.slice(0, 10))}`)}
    ${tile('En kötü', `<span class="down">${rFmt(worst.r)}</span>`, `${esc(worst.t)} · ${fmt.date(worst.d0.slice(0, 10))}`)}
    ${tile('Ortalama süre', `${Math.round(avgDays)} gün`)}
  </div>`;
}

function byStrategy(L) {
  const f = F();
  if (f.k) return '';
  const g = new Map();
  for (const a of L) {
    if (a.st === 'open') continue;
    const key = `${a.kn}${a.tf === '4H' ? ' · 4S' : ''}`;
    const s = g.get(key) || { n: 0, w: 0, sum: 0 };
    s.n++; s.w += a.r > 0; s.sum += a.r; g.set(key, s);
  }
  if (g.size < 2) return '';
  const rows = [...g.entries()].sort((a, b) => b[1].sum - a[1].sum);
  return `<div class="tablewrap flat arcbywrap"><table class="grid arcby"><thead><tr><th class="tk">Strateji</th><th>İşlem</th><th>Kârlı</th><th>İşlem başına</th><th>Toplam</th></tr></thead><tbody>
    ${rows.map(([k, s]) => `<tr><td class="tk">${esc(k)}</td><td>${s.n}</td><td>%${Math.round(s.w / s.n * 100)}</td><td class="${cls(s.sum)}">${rFmt(s.sum / s.n)}</td><td class="${cls(s.sum)}">${rFmt(s.sum)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function table(L) {
  const many = !F().k;
  const rows = L.slice(0, shown).map(a => {
    const [lab, c] = EXIT[a.st] || [a.st, ''];
    return `<tr><td class="tk"><a class="code" href="#/h/${esc(a.t)}">${esc(a.t)}</a> ${a.tf === '4H' ? '<span class="chip tf4">4S</span>' : '<span class="chip">1G</span>'}</td>
      ${many ? `<td class="txt">${esc(a.kn)}</td>` : ''}
      <td>${dshort(a.d0)}</td><td>${fmt.price(a.e)}</td>
      <td>${a.st === 'open' ? '<span class="muted">sürüyor</span>' : dshort(a.d1)}</td><td>${fmt.price(a.x)}${a.st === 'open' ? ' <small class="muted">son</small>' : ''}</td>
      <td class="${cls(a.pct)}">${pctFmt(a.pct)}</td><td class="${cls(a.r)}"><b>${rFmt(a.r)}</b></td>
      <td class="txt"><span class="chip ${c}">${lab}</span>${a.re ? ' <span class="chip warn" title="Stop sonrası yeniden giriş">yeniden giriş</span>' : ''}</td>
      <td>${a.st === 'open' ? '—' : days(a.d0, a.d1) + ' gün'}</td></tr>`;
  }).join('');
  return `<div class="tablewrap flat"><table class="grid arctable"><thead><tr><th class="tk">Hisse</th>${many ? '<th class="txt">Strateji</th>' : ''}
      <th>Giriş tarihi</th><th>Giriş</th><th>Çıkış tarihi</th><th>Çıkış</th><th>Getiri</th><th title="Sonuç, risk birimi cinsinden (1R = giriş − stop); maliyet dahil">Sonuç</th>
      <th class="txt">Çıkış nedeni</th><th>Süre</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${L.length > shown ? `<p class="arcmore"><button type="button" class="btn" data-arcmore="1">Daha fazla göster (${fmt.big(Math.min(PAGE, L.length - shown))} / kalan ${fmt.big(L.length - shown)})</button></p>` : ''}`;
}

function csv(L) {
  const head = ['Hisse', 'Strateji', 'Periyot', 'Endeks', 'Giriş tarihi', 'Giriş', 'Çıkış tarihi', 'Çıkış', 'Getiri %', 'Sonuç R', 'Çıkış nedeni', 'Yeniden giriş'];
  const lines = L.map(a => [a.t, a.kn, a.tf, a.idx, a.d0, a.e, a.d1 || '', a.x, (a.pct * 100).toFixed(2), a.r, (EXIT[a.st] || [a.st])[0], a.re ? 'evet' : '']
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
  const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), aEl = document.createElement('a');
  aEl.href = url; aEl.download = `tahta-trade-arsivi-${new Date().toISOString().slice(0, 10)}.csv`; aEl.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawResults() {
  const L = filtered();
  const box = document.getElementById('arcRes');
  if (!box) return;
  box.innerHTML = `<section class="panel"><h2>Özet <span class="muted" style="font-weight:400">· ${fmt.big(L.length)} işlem</span></h2>${summary(L)}${byStrategy(L)}</section>
    <section class="panel"><div class="archead"><h2>İşlemler <span class="muted" style="font-weight:400">· ${shown < L.length ? `ilk ${fmt.big(shown)} / ` : ''}${fmt.big(L.length)}</span></h2>
      <button type="button" class="btn arccsv" data-arccsv="1" ${L.length ? '' : 'disabled'}>CSV indir</button></div>
      ${L.length ? table(L) : '<p class="muted">Bu filtrelerle işlem yok.</p>'}</section>`;
}

export async function renderArchive() {
  document.title = 'Trade arşivi · Tahta';
  view.innerHTML = '<p class="empty">Arşiv yükleniyor…</p>';
  try { await load(); } catch { view.innerHTML = '<p class="empty">Trade arşivi henüz yok; bir sonraki veri güncellemesinde oluşacak. <a href="#/sinyal">← Sinyaller</a></p>'; return; }
  if (!location.hash.startsWith('#/sinyal/arsiv')) return;
  const f = F();
  shown = 100;
  const sel = (id, lab, val, opts) => `<label class="arcf"><span>${lab}</span><select id="${id}">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  view.innerHTML = `
  <section class="dhead"><div><h1>Trade arşivi</h1>
    <p class="sub">Stratejilerin son 4 yıldaki bütün işlemleri (her stratejinin varsayılan çıkışıyla, aynı test motoru) ve şu an açık olanlar · güncellendi ${fmt.date(ARC.updated.slice(0, 10))}</p></div>
    <a class="btn dhead-act" href="#/sinyal">← Sinyaller</a></section>
  <section class="panel arcfilters">
    ${sel('arcK', 'Strateji', f.k, [['', 'Tüm stratejiler'], ...ARC.strategies.map(s => [s.id, s.name])])}
    ${sel('arcTf', 'Periyot', f.tf, [['', 'Tümü'], ['1D', 'Günlük'], ['4H', '4 saat']])}
    ${sel('arcTier', 'Endeks', f.tier, Object.keys(TIER_OF).map(k => [k, k]))}
    ${sel('arcY', 'Yıl', f.y, [['', 'Tüm yıllar'], ...ARC.years.map(y => [y, y])])}
    ${sel('arcResult', 'Sonuç', f.res, [['', 'Tümü'], ['win', 'Kârlı'], ['loss', 'Zararlı'], ['open', 'Açık']])}
    ${sel('arcSt', 'Çıkış nedeni', f.st, [['', 'Tümü'], ...Object.entries(EXIT).filter(([k]) => k !== 'open').map(([k, v]) => [k, v[0]])])}
    ${sel('arcSort', 'Sıralama', f.sort, [['d', 'Giriş tarihi (yeni → eski)'], ['r-', 'Sonuç R (yüksek → düşük)'], ['r+', 'Sonuç R (düşük → yüksek)'], ['p', 'Getiri % (yüksek → düşük)']])}
    <label class="arcf"><span>Hisse</span><input id="arcQ" value="${esc(f.q)}" placeholder="THYAO" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
    <button type="button" class="btn" data-arcreset="1">Filtreleri sıfırla</button>
  </section>
  <div id="arcRes"></div>
  <p class="muted" style="font-size:12px">Geriye dönük testtir: giriş sinyal mumunun kapanışında, gidiş-dönüş %0,2 maliyet dahil; sonuç R cinsinden (1R = giriş − stop). Test bugünkü endeks bileşenleriyle yapıldı. Yatırım tavsiyesi değildir.</p>`;
  drawResults();
  const map = { arcK: 'k', arcTf: 'tf', arcTier: 'tier', arcY: 'y', arcResult: 'res', arcSt: 'st', arcSort: 'sort' };
  for (const [id, key] of Object.entries(map)) {
    document.getElementById(id).addEventListener('change', e => { F()[key] = e.target.value; shown = 100; persist(); drawResults(); });
  }
  let tmr;
  document.getElementById('arcQ').addEventListener('input', e => { clearTimeout(tmr); tmr = setTimeout(() => { F().q = e.target.value; shown = 100; persist(); drawResults(); }, 200); });
  view.querySelector('[data-arcreset]').addEventListener('click', () => { state.arc = null; persist(); renderArchive(); });
  document.getElementById('arcRes').addEventListener('click', e => {
    if (e.target.closest('[data-arcmore]')) { shown += PAGE; drawResults(); }
    if (e.target.closest('[data-arccsv]')) csv(filtered());
  });
}
