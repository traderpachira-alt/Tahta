import { DATA } from './data.js';
import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { FIELDS, MKT_NAME, OPS, PRESETS, PRESET_GROUPS, TEXTCOLS, TIER_RANK, VIEWS, tierRank, val } from './fields.js';
import { listOf, persist, state, ui } from './store.js';
import { tedbirIcon } from './tedbir.js';
import { F1, cls, esc, fmt, info, ok } from './util.js';

/* ============================================================
   Tarama ekranı
   ============================================================ */
export function filtered() {
  const preset = PRESETS.find(p => p.id === state.preset) || PRESETS[0];
  return DATA.stocks.filter(s =>
    preset.test(s) &&
    (!state.sectors.length || state.sectors.includes(s.sector)) &&
    (!state.index || tierRank(s) <= TIER_RANK[state.index]) &&
    (!state.markets.length || state.markets.includes(s.mkt)) &&
    (!state.hideTedbir || !s.tedbir?.length || state.preset === 'tedbir') &&
    state.filters.every(f => {
      const v = s[f.key], fd = FIELDS[f.key];
      if (f.value === '' || f.value == null) return true;
      if (!ok(v)) return false;
      const target = parseFloat(String(f.value).replace(',', '.')) / (fd.pct ? 100 : 1);
      return Number.isFinite(target) ? OPS[f.op](v, target) : true;
    }));
}
export function sorted(list) {
  const { key, dir } = state.sort;
  return [...list].sort((a, b) => {
    const x = val(a, key), y = val(b, key);
    const nx = x == null || x === '' || (typeof x === 'number' && !Number.isFinite(x));
    const ny = y == null || y === '' || (typeof y === 'number' && !Number.isFinite(y));
    if (nx || ny) return nx - ny; // boşlar hep sonda
    if (typeof x === 'string') return x.localeCompare(y, 'tr') * dir;
    return (x - y) * dir;
  });
}
export function cellHtml(s, k) {
  if (k in TEXTCOLS) return `<td class="txt">${TEXTCOLS[k].cell(s)}</td>`;
  const fd = FIELDS[k], v = s[k];
  return `<td class="${fd.color ? cls(v) : ''}">${fd.f(v)}</td>`;
}
export function tableHtml(rows, cols, { sortable = true, highlight = null } = {}) {
  const th = k => {
    const def = FIELDS[k] || TEXTCOLS[k];
    const sort = state.sort.key === k ? (state.sort.dir > 0 ? 'ascending' : 'descending') : null;
    const inner = sortable ? `<button type="button" data-sort="${k}">${esc(def.label)}</button>` : esc(def.label);
    return `<th${sort && sortable ? ` aria-sort="${sort}"` : ''}${def.title ? ` title="${esc(def.title)}"` : ''}${sortable ? ` draggable="true" data-col="${k}"` : ''}>${inner}</th>`;
  };
  const head = `<tr><th class="tk">${sortable ? '<button type="button" data-sort="t">Hisse</button>' : 'Hisse'}</th>${cols.map(th).join('')}</tr>`;
  const body = rows.map(s => {
    const starred = state.watch.includes(s.t);
    return `<tr data-t="${s.t}"${s.t === highlight ? ' style="font-weight:600"' : ''}>
      <td class="tk"><button type="button" class="star" data-star="${s.t}" aria-pressed="${starred}" aria-label="${s.t} izleme listesi">★</button><span class="code" title="${esc(s.name || '')}">${s.t}</span>${tedbirIcon(s)}</td>
      ${cols.map(k => cellHtml(s, k)).join('')}</tr>`;
  }).join('');
  return `<table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
/* Kayıtlı taramalar: hazır tarama + endeks + sektör + filtreler + görünüm + sıralama */
export const screenOf = () => ({ preset: state.preset, index: state.index, markets: [...state.markets], sectors: [...state.sectors], view: state.view,
  sort: { ...state.sort }, filters: state.filters.filter(f => f.value !== '').map(f => ({ ...f })) });
export const sameScreen = sv => {
  const c = screenOf();
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  return c.preset === sv.preset && c.index === sv.index && same(c.markets, listOf(sv, 'market')) && same(c.sectors, listOf(sv, 'sector')) && JSON.stringify(c.filters) === JSON.stringify(sv.filters);
};
export function describeScreen(sv) {
  const p = [];
  if (sv.preset && sv.preset !== 'all') p.push(PRESETS.find(x => x.id === sv.preset)?.label);
  if (sv.index) p.push('BIST ' + sv.index);
  const mk = listOf(sv, 'market'), sc = listOf(sv, 'sector');
  if (mk.length) p.push(mk.map(m => MKT_NAME[m] || m).join(' + '));
  if (sc.length) p.push(sc.length > 2 ? `${sc.length} sektör` : sc.join(' + '));
  for (const f of sv.filters || []) p.push(`${FIELDS[f.key]?.label} ${f.op} ${f.value}${FIELDS[f.key]?.pct ? '%' : ''}`);
  return p.join(' · ') || 'Tüm hisseler';
}
/* Çoklu seçim kutusu (pazar, sektör) */
export const MARKET_OPTS = [['Yıldız', 'Yıldız Pazar'], ['Ana', 'Ana Pazar'], ['Alt', 'Alt Pazar'], ['YİP', 'Yakın İzleme Pazarı']];
export function msLabel(key, allLabel, unit) {
  const sel = state[key];
  if (!sel.length) return allLabel;
  if (sel.length === 1) return key === 'markets' ? (MARKET_OPTS.find(o => o[0] === sel[0])?.[1] || sel[0]) : sel[0];
  return `${sel.length} ${unit}`;
}
export function multiSelect(key, allLabel, unit, options, searchable) {
  const sel = new Set(state[key]), open = ui.msOpen === key;
  return `<div class="ms${sel.size ? ' on' : ''}" data-ms="${key}" data-all="${esc(allLabel)}" data-unit="${unit}">
    <button type="button" class="btn ms-btn" data-mstoggle="${key}" aria-haspopup="true" aria-expanded="${open}"><span class="ms-lbl">${esc(msLabel(key, allLabel, unit))}</span> ▾</button>
    <div class="ms-panel"${open ? '' : ' hidden'}>
      ${searchable ? `<input type="search" class="ms-q" placeholder="Ara…" aria-label="${unit} ara" autocomplete="off">` : ''}
      <div class="ms-list">${options.map(([v, l, n]) => `<label><input type="checkbox" value="${esc(v)}"${sel.has(v) ? ' checked' : ''}> <span>${esc(l)}</span> <span class="n">${n}</span></label>`).join('')}</div>
      <div class="ms-foot"><button type="button" class="btn" data-msclear="${key}">Temizle</button><button type="button" class="btn primary" data-msclose="1">Tamam</button></div>
    </div>
  </div>`;
}
// Tabloyu ve sayacı yenile (araç çubuğunu yeniden çizmeden; açık paneller ve odak korunur)
export function refreshResults() {
  const rows = sorted(filtered());
  view.querySelector('.tablewrap').innerHTML = rows.length ? tableHtml(rows, colsFor(state.view)) : emptyHtml();
  view.querySelector('.count b').textContent = rows.length;
  const ft = view.querySelector('#ftoggle');
  if (ft) { ft.innerHTML = 'Filtrele' + fbadge(); view.querySelector('.fchips')?.remove(); ft.closest('.controls').insertAdjacentHTML('afterend', fchips()); }
  view.querySelectorAll('.ms').forEach(m => {
    const k = m.dataset.ms;
    if (k === 'cols') { m.classList.toggle('on', colsCustom(state.view) || !!state.hideTedbir); return; }
    m.querySelector('.ms-lbl').textContent = msLabel(k, m.dataset.all, m.dataset.unit);
    m.classList.toggle('on', state[k].length > 0);
  });
}
// Açılır paneli ekrana sığdır (sağdan taşıyorsa sola kaydır)
export function fitPanel(panel) {
  if (!panel || panel.hidden) return;
  panel.style.left = '';
  const r = panel.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 8);
  if (over > 0) panel.style.left = `${-Math.min(over, r.left - 8)}px`;
}
export function closeMs() {
  if (!ui.msOpen) return;
  ui.msOpen = null;
  view.querySelectorAll('.ms-panel').forEach(p => { p.hidden = true; });
  view.querySelectorAll('[data-mstoggle]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('click', e => { if (ui.msOpen && !e.target.closest?.('.ms')) closeMs(); });
/* Sütun seçimi: her sekme için ayrı (state.cols[görünüm]); varsayılan VIEWS tanımı. Hisse kodu her zaman görünür. */
export const colLabel = k => (FIELDS[k] || TEXTCOLS[k])?.label || k;
export const colsFor = v => { const c = state.cols?.[v]; return Array.isArray(c) ? c.filter(k => FIELDS[k] || TEXTCOLS[k]) : VIEWS[v].cols; };
export const colsCustom = v => Array.isArray(state.cols?.[v]);
export function setCols(v, list) {
  const def = VIEWS[v].cols, ordered = [...new Set(list)];
  state.cols ||= {};
  if (ordered.length === def.length && ordered.every((k, i) => k === def[i])) delete state.cols[v]; else state.cols[v] = ordered;
}
export function moveCol(k, to) { // to: hedef indeks
  const cur = colsFor(state.view).filter(x => x !== k);
  cur.splice(Math.max(0, Math.min(cur.length, to)), 0, k);
  setCols(state.view, cur);
}
// Sütun paneli ve tablo değişince: tabloyu yenile, açık paneli yeniden çiz (sıralama/bölümler güncellensin)
export function refreshCols() {
  persist(); refreshResults();
  const m = view.querySelector('.ms[data-ms="cols"]');
  if (m) {
    const q = m.querySelector('.ms-q')?.value || '';
    m.outerHTML = colsPanel();
    fitPanel(view.querySelector('.colpanel'));
    if (q) { const nq = view.querySelector('.colpanel .ms-q'); nq.value = q; nq.dispatchEvent(new Event('input', { bubbles: true })); }
  }
}
export function colsPanel() {
  const v = state.view, shown = colsFor(v), cur = new Set(shown), open = ui.msOpen === 'cols', def = VIEWS[v].cols;
  const others = Object.entries(VIEWS).filter(([id]) => id !== v).map(([, vw]) => [vw.label, [...vw.cols, ...(vw.extra || [])]]);
  const inViews = new Set(Object.values(VIEWS).flatMap(x => [...x.cols, ...(x.extra || [])]));
  const loose = Object.keys(FIELDS).filter(k => !inViews.has(k));
  const seen = new Set(shown);
  const addRow = k => `<label><input type="checkbox" value="${k}"> <span>${esc(colLabel(k))}</span></label>`;
  const group = (title, keys) => { keys = keys.filter(k => !seen.has(k) && (seen.add(k), true)); return keys.length ? `<div class="ms-grp">${title}</div>` + keys.map(addRow).join('') : ''; };
  return `<div class="ms${colsCustom(v) || state.hideTedbir ? ' on' : ''}" data-ms="cols">
    <button type="button" class="btn ms-btn" data-mstoggle="cols" aria-haspopup="true" aria-expanded="${open}" title="Sütunlar ve görünüm ayarları"><span class="ms-lbl">☰ Görünüm</span> ▾</button>
    <div class="ms-panel colpanel"${open ? '' : ' hidden'}>
      <label class="chkrow"><input type="checkbox" id="hideTedbir"${state.hideTedbir ? ' checked' : ''}> Tedbirli hisseleri gizle</label>
      <input type="search" class="ms-q" placeholder="Sütun ara…" aria-label="Sütun ara" autocomplete="off">
      <div class="ms-list">
        <div class="ms-grp">Sütunlar · soldan sağa (${cur.size})</div>
        ${shown.map((k, i) => `<label class="colrow"><input type="checkbox" value="${k}" checked> <span>${esc(colLabel(k))}</span>
          <button type="button" class="ic" data-colmove="${k}|-1" aria-label="${esc(colLabel(k))} sola taşı"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ic" data-colmove="${k}|1" aria-label="${esc(colLabel(k))} sağa taşı"${i === shown.length - 1 ? ' disabled' : ''}>↓</button></label>`).join('')}
        ${group(`${VIEWS[v].label} · eklenebilir`, [...def, ...(VIEWS[v].extra || [])])}
        ${others.map(([t, keys]) => group(`Ekle · ${t}`, keys)).join('')}
        ${group('Ekle · ek alanlar', loose)}
      </div>
      <p class="muted" style="font-size:11px;margin:0">Bilgisayarda tablo başlıklarını sürükleyerek de sıralayabilirsiniz.</p>
      <div class="ms-foot"><button type="button" class="btn" data-colsreset="1">Varsayılana dön</button><button type="button" class="btn primary" data-msclose="1">Tamam</button></div>
    </div>
  </div>`;
}
/* Hazır taramalar: Tümü, İzleme listem ve Aktif sinyal tek dokunuş; diğerleri Teknik / Temettü / Temel / Kayıtlı başlıkları altında.
   Başlığa dokununca altında o grubun taramaları açılır; seçili tarama başlıkta yazar. */
const presetBtn = (p, counts) => `<button type="button" data-preset="${p.id}" aria-pressed="${state.preset === p.id}" title="${esc(p.hint || '')}">${esc(p.label)}<span class="n">${counts[p.id]}</span></button>`;
export function presetBar(counts) {
  const cur = PRESETS.find(p => p.id === state.preset);
  const anySaved = state.saved.some(sameScreen);
  if (ui.pgroup === undefined) ui.pgroup = cur?.group || (anySaved ? 'kayitli' : null);
  const g = ui.pgroup;
  const grpBtn = (k, label) => {
    const sel = k === 'kayitli' ? anySaved : cur?.group === k;
    const sub = k === 'kayitli' ? (sel ? state.saved.find(sameScreen)?.name : null) : sel ? cur.label : null;
    return `<button type="button" class="grp${sel ? ' sel' : ''}" data-pgroup="${k}" aria-expanded="${g === k}">${esc(label)}${sub ? `: <b>${esc(sub)}</b>` : k === 'kayitli' && state.saved.length ? `<span class="n">${state.saved.length}</span>` : ''} <span class="car" aria-hidden="true">▾</span></button>`;
  };
  const row = g === 'kayitli' ? `<div class="saved" role="group" aria-label="Kayıtlı taramalar">
      ${state.saved.map((sv, i) => `<span class="svchip${sameScreen(sv) ? ' on' : ''}"><button type="button" data-load="${i}" title="${esc(describeScreen(sv))}">${esc(sv.name)}</button><button type="button" class="x" data-unsave="${i}" aria-label="${esc(sv.name)} taramasını sil">×</button></span>`).join('')}
      ${ui.savingOpen
        ? `<form id="saveForm" class="saveform"><label class="sr" for="saveName">Tarama adı</label><input id="saveName" maxlength="40" placeholder="Tarama adı, ör. Dipteki BIST 100" required><button class="btn">Kaydet</button><button type="button" class="btn" data-cancelsave="1">İptal</button></form>`
        : `<button type="button" class="btn ghost" id="saveBtn">☆ Bu taramayı kaydet</button>`}
    </div>`
    : g ? `<div class="presets sub" role="group" aria-label="${esc(PRESET_GROUPS[g])} taramaları">${PRESETS.filter(p => p.group === g).map(p => presetBtn(p, counts)).join('')}</div>` : '';
  return `<div class="presets" role="group" aria-label="Hazır taramalar">
      ${PRESETS.filter(p => ['all', 'watch', 'signal'].includes(p.id)).map(p => presetBtn(p, counts)).join('')}
      ${Object.entries(PRESET_GROUPS).map(([k, l]) => grpBtn(k, l)).join('')}
      ${grpBtn('kayitli', '☆ Kayıtlı')}
    </div>${row}`;
}
/* Piyasa genişliği: SMA50 / SMA200 üstündeki hisse oranı, 4 yıllık grafik ve yorum (olumlu ve olumsuz notlar) */
export const pulseTone = x => x >= 60 ? 'pos' : x < 40 ? 'neg' : 'neu';
function pulseHtml(P) {
  const d = x => `<span class="${cls(x)}">${x > 0 ? '+' : ''}${F1.format(x)}</span>`;
  return `<div class="pulse">
      <div class="pulsehead"><b class="${pulseTone(P.score)}">${P.score}</b><span>/100 · <b>${esc(P.band)}</b></span>
        <small class="muted">1 hafta önce ${P.w1} · 1 ay önce ${P.m1} · son 4 yılın %${Math.max(1, Math.round(P.pct * 100))}. dilimi</small></div>
      <div class="pulsebar"><i style="left:${P.score}%"></i></div>
      <div class="pulseaxis"><span>Kritik</span><span>Zayıf</span><span>Kararsız</span><span>Sağlıklı</span><span>Güçlü</span></div>
      <table class="grid parts"><thead><tr><th class="tk">Bileşen</th><th>Puan</th><th></th><th title="Son 1 haftadaki değişim">1 hafta</th></tr></thead><tbody>
        ${P.parts.map(x => `<tr title="${esc(x.why)}"><td class="tk">${esc(x.n)}</td><td>${F1.format(x.v)} / ${x.max}</td>
          <td class="pbar"><span class="meter"><i style="width:${x.v / x.max * 100}%"></i></span></td><td>${d(x.dw)}</td></tr>`).join('')}
      </tbody></table>
    </div>`;
}
export function breadthHtml(B) {
  const W = 600, H = 90, n = B.hist.length;
  const xy = k => B.hist.map((r, i) => `${(i / (n - 1) * W).toFixed(1)},${(H - r[k] * H).toFixed(1)}`).join(' ');
  const pc = x => `%${Math.round(x * 100)}`;
  const lvl = (x, med, p) => `<b>${pc(x)}</b> <span class="muted">4 yıl medyanı ${pc(med)} · 4 yılın %${Math.max(1, Math.round(p * 100))}. dilimi</span>`;
  return `<h2>Piyasa Nabzı <span class="muted" style="font-weight:400">· BIST TÜM, ${B.n} hisse · ${fmt.date(B.date)}</span></h2>
    <div class="brdgrid">
      <div>
        ${B.pulse ? pulseHtml(B.pulse) : ''}
        <p class="brdhead ${B.tone}">Genişlik: ${esc(B.head)}</p>
        <div class="brdrows">
          <div><span>Kısa vade · 50 günlük ortalama üstü</span>${lvl(B.a50, B.med50, B.p50)}</div>
          <div><span>Uzun vade · 200 günlük ortalama üstü</span>${lvl(B.a200, B.med200, B.p200)}</div>
          <div><span>Kısa vadede değişim (10 / 20 gün)</span><b><span class="${cls(B.d50_10)}">${B.d50_10 > 0 ? '+' : ''}${(B.d50_10 * 100).toFixed(0)}</span> / <span class="${cls(B.d50_20)}">${B.d50_20 > 0 ? '+' : ''}${(B.d50_20 * 100).toFixed(0)}</span> puan</b></div>
        </div>
        <ul class="brdnotes">
          ${B.pos.map(t => `<li class="up">▲ ${esc(t)}</li>`).join('')}
          ${B.neg.map(t => `<li class="down">▼ ${esc(t)}</li>`).join('')}
          ${!B.pos.length && !B.neg.length ? '<li class="muted">Belirgin bir işaret yok: genişlik olağan aralıkta.</li>' : ''}
        </ul>
      </div>
      <div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="brdchart" role="img" aria-label="Son 4 yılda SMA50 ve SMA200 üstündeki hisse oranı">
          <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="mid"/>
          <polyline points="${xy(2)}" class="l200"/><polyline points="${xy(1)}" class="l50"/>
        </svg>

        <div class="brdaxis"><span>${fmt.date(B.hist[0][0])}</span><span><i class="k50"></i>SMA50 üstü <i class="k200"></i>SMA200 üstü · orta çizgi %50</span><span>${fmt.date(B.hist[n - 1][0])}</span></div>
        ${B.pulse ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="brdchart pulsechart" role="img" aria-label="Son 4 yılda Piyasa Nabzı">
          <line x1="0" x2="${W}" y1="${H * 0.6}" y2="${H * 0.6}" class="mid"/><line x1="0" x2="${W}" y1="${H * 0.2}" y2="${H * 0.2}" class="mid"/><line x1="0" x2="${W}" y1="${H * 0.8}" y2="${H * 0.8}" class="mid"/>
          <polyline points="${B.hist.map((r, i) => r[3] == null ? '' : `${(i / (n - 1) * W).toFixed(1)},${(H - r[3] / 100 * H).toFixed(1)}`).filter(Boolean).join(' ')}" class="lp"/>
        </svg><div class="brdaxis"><span>Piyasa Nabzı, son 4 yıl</span><span>çizgiler: 20 · 40 · 80</span></div>` : ''}
      </div>
    </div>
    ${info('<b>Piyasa Nabzı</b> beş bileşenin toplamıdır: kısa ve uzun vade genişliğinin son 4 yıldaki yeri (25+25), kısa ve uzun vadenin yönü (20+15) ve kısa vadenin uzun vadeye önderliği (15). Olumlu gelişmeler (genişliğin artması, dipten dönüş) puanı artırır, olumsuzlar düşürür; bileşen tablosu puanın neden değiştiğini gösterir. 0–20 Kritik, 20–40 Zayıf, 40–60 Kararsız, 60–80 Sağlıklı, 80–100 Güçlü. Bir durum göstergesidir, al-sat sinyali değil: son 4 yılda en iyi 40 günlük BIST 100 getirileri hem Kritik (dip, ort. +%7,6) hem Güçlü (yaygın yükseliş, ort. +%12,6) bölgelerinden sonra geldi; aradaki bölgelerde getiri daha düşüktü. ' + 'Kısa vade (50 gün) piyasanın son haftalardaki yönünü, uzun vade (200 gün) ana trendin ne kadar geniş tabanlı olduğunu gösterir. %15 altı "çok zayıf" (panik), %15–35 zayıf, %35–65 dengeli, %65–85 güçlü, %85 üstü "çok güçlü" (aşırı ısınma). Yorumlar, seviyeye ek olarak yönü (son 10/20 gündeki değişim), kısa ve uzun vadenin ilişkisini ve endeksle uyumu dikkate alır; olumlu işaretler ▲, olumsuz işaretler ▼ ile gösterilir. Bu bir gösterge, al-sat sinyali değil.', 'Nasıl okunur?')}`;
}
const emptyHtml = () => state.preset === 'watch' && !state.watch.length
  ? '<p class="empty">İzleme listeniz boş.<br>Tablodaki ya da hisse sayfasındaki <b>★</b> işaretine dokunarak hisse ekleyin; burada birlikte izlersiniz.</p>'
  : `<p class="empty">Bu koşullara uyan hisse yok.${activeFilters().length ? '<br>Filtrelerden birini kaldırmayı deneyin.' : ''}</p>`;
/* Telefonda tablo ekranın görünen alanı kadar yüksektir; tablo kaydırılmaya başlayınca sayfa, tablo üst çubuğun altına
   oturacak kadar kendiliğinden kayar (iç içe iki kaydırma alanı yerine tablo ekranı doldurur) */
const phone = () => matchMedia('(max-width: 640px)').matches;
export function setTopH() { document.documentElement.style.setProperty('--toph', `${document.querySelector('.top')?.offsetHeight || 90}px`); }
addEventListener('resize', setTopH);
function fitTable(tw) {
  if (!tw) return;
  setTopH();
  let last = tw.scrollTop;
  tw.addEventListener('scroll', () => {
    const y = tw.scrollTop, down = y > last; last = y;
    if (!phone() || !down) return;
    const top = tw.getBoundingClientRect().top, want = document.querySelector('.top').offsetHeight + 8;
    if (top > want + 4) window.scrollTo({ top: window.scrollY + top - want, behavior: 'smooth' });
  }, { passive: true });
}
/* Telefonda filtreler "Filtrele" düğmesinin arkasında toplanır; kapalıyken seçili filtreler kaldırılabilir etiketler olarak görünür */
function activeFilters() {
  const out = [];
  if (state.index) out.push(['index', '', 'BIST ' + state.index]);
  for (const m of state.markets) out.push(['markets', m, MARKET_OPTS.find(o => o[0] === m)?.[1] || m]);
  for (const x of state.sectors) out.push(['sectors', x, x]);
  state.filters.forEach((f, i) => { if (f.value !== '' && f.value != null) out.push(['filter', String(i), `${FIELDS[f.key]?.label} ${f.op === '>' ? '>' : '<'} ${f.value}${FIELDS[f.key]?.pct ? '%' : ''}`]); });
  return out;
}
const fbadge = () => { const n = activeFilters().length; return n ? ` <span class="fn">${n}</span>` : ''; };
const fchips = () => { const a = activeFilters(); return a.length ? `<div class="fchips" aria-label="Seçili filtreler">${a.map(([k, v, l]) =>
  `<button type="button" class="fchip" data-fclear="${k}|${esc(v)}" aria-label="${esc(l)} filtresini kaldır">${esc(l)} <span aria-hidden="true">×</span></button>`).join('')}</div>` : ''; };
export function clearFilter(spec) {
  const [k, v] = spec.split('|');
  if (k === 'index') state.index = '';
  else if (k === 'filter') state.filters.splice(+v, 1);
  else state[k] = state[k].filter(x => x !== v);
}
/* İlk açılış tanıtımı: 3 adım, kapatılınca bir daha görünmez (Rehber'den yeniden açılabilir) */
const INTRO = [
  ['Tahta\'ya hoş geldiniz', 'Borsa İstanbul\'daki 600\'den fazla hisse için tarama, teknik ve temel analiz, strateji sinyalleri ve portföy takibi. Veriler her işlem günü otomatik güncellenir; fiyatlar yaklaşık 15 dakika gecikmelidir.'],
  ['Tarama', 'Hazır taramalardan birini seçin ya da <b>Filtrele</b> ile endeks, pazar, sektör ve gösterge koşulu ekleyin. Satıra dokununca hissenin grafiği ve analizi açılır; <b>★</b> ile izleme listesine eklersiniz.'],
  ['Sinyaller ve portföy', '<b>Sinyaller</b> sayfası stratejilerin açık sinyallerini, oluşmak üzere olan kurulumları ve geçmiş test sonuçlarını gösterir. Portföyünüz ve izleme listeniz yalnızca bu cihazda saklanır; <b>⚙ Ayarlar</b>\'dan yedekleyebilirsiniz. Terimler için <b>?</b> Rehber.'],
];
export function introHtml() {
  const i = Math.min(ui.introStep || 0, INTRO.length - 1), [h, p] = INTRO[i], last = i === INTRO.length - 1;
  return `<section class="panel intro" aria-label="Tanıtım">
    <div class="introhead"><span class="introdots" aria-label="Adım ${i + 1} / ${INTRO.length}">${INTRO.map((_, k) => `<i${k === i ? ' class="on"' : ''}></i>`).join('')}</span>
      <button type="button" class="linkbtn" data-intro="done">Geç</button></div>
    <h2>${h}</h2><p>${p}</p>
    <div class="row">${i ? '<button type="button" class="btn" data-intro="prev">Geri</button>' : ''}<button type="button" class="btn primary" data-intro="${last ? 'done' : 'next'}">${last ? 'Başla' : 'İleri'}</button></div>
  </section>`;
}
export function renderScreener() {
  destroyCharts();
  document.title = 'Tarama · Tahta';
  const sectors = [...new Set(DATA.stocks.map(s => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const numericKeys = Object.keys(FIELDS).filter(k => !FIELDS[k].nofilter);
  const counts = Object.fromEntries(PRESETS.map(p => [p.id, DATA.stocks.filter(p.test).length]));
  const rows = sorted(filtered());
  const cols = colsFor(state.view);
  const preset = PRESETS.find(p => p.id === state.preset);

  view.innerHTML = `
  <section class="dhead scrhead"><div><h1>Tarama</h1></div></section>
  <section class="toolbar${ui.fOpen ? ' fopen' : ''}">
    ${presetBar(counts)}
    <div class="controls">
      <div class="seg" role="group" aria-label="Sütun grubu">
        ${Object.entries(VIEWS).map(([id, v]) => `<button type="button" data-view="${id}" aria-pressed="${state.view === id}">${v.label}</button>`).join('')}
      </div>
      <div class="fbox">
        <label class="sr" for="indexSel">Endeks</label>
        <select id="indexSel" class="btn">${[['', 'Tüm hisseler'], ['30', 'BIST 30'], ['50', 'BIST 50'], ['100', 'BIST 100']].map(([v, l]) => `<option value="${v}"${v === state.index ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${multiSelect('markets', 'Tüm pazarlar', 'pazar', MARKET_OPTS.map(([v, l]) => [v, l, DATA.stocks.filter(x => x.mkt === v).length]), false)}
        ${multiSelect('sectors', 'Tüm sektörler', 'sektör', sectors.map(v => [v, v, DATA.stocks.filter(x => x.sector === v).length]), true)}
        <button type="button" class="btn" id="addFilter">+ Gösterge koşulu</button>
      </div>
      <button type="button" class="btn ftoggle" id="ftoggle" aria-expanded="${!!ui.fOpen}" aria-controls="filters">Filtrele${fbadge()}</button>
      ${colsPanel()}
      <span class="count"><b class="num">${rows.length}</b> / ${DATA.stocks.length} hisse${preset?.hint ? ` · ${esc(preset.hint)}` : ''}</span>
    </div>
    ${fchips()}
    <div class="filters" id="filters">
      ${state.filters.map((f, i) => `
        <div class="frow" data-i="${i}">
          <select data-f="key" aria-label="Alan">${numericKeys.map(k => `<option value="${k}"${k === f.key ? ' selected' : ''}>${esc(FIELDS[k].label)}</option>`).join('')}</select>
          <select data-f="op" aria-label="Koşul"><option value=">"${f.op === '>' ? ' selected' : ''}>büyüktür</option><option value="<"${f.op === '<' ? ' selected' : ''}>küçüktür</option></select>
          <input data-f="value" inputmode="decimal" value="${esc(f.value)}" aria-label="Değer" placeholder="değer">
          <span class="unit">${FIELDS[f.key]?.pct ? '%' : ''}</span>
          <button type="button" class="x" data-remove="${i}" aria-label="Filtreyi kaldır">×</button>
        </div>`).join('')}
    </div>
  </section>
  <div class="tablewrap scr">${rows.length ? tableHtml(rows, cols) : emptyHtml()}</div>`;
  fitTable(view.querySelector('.tablewrap.scr'));
}
