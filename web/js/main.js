import { CMP_MAX, renderCompare } from './compare.js';
import { BY, DATA, HIST, loadSummary } from './data.js';
import { PANES, charts, drawCharts, indChips, renderDetail, setRange, setSigPick, toggleFull } from './detail.js';
import { $, view } from './dom.js';
import { PRESETS, VIEWS } from './fields.js';
import { ASSETS, ASSET_CATS, CASH, applyTx, confirmDiv, ensureCash, isAssetCat, isCash, isCoin, isCrypto, num, numDec, pfCalc, pfId, removePosition, removeTx, toTl, trNum, undoDiv } from './pfcore.js';
import { alertMsg, coinSym, currentPrice, defaultFlow, pfHist, pfOpen, pfReadForm, renderPortfolio, txOpen, txPreview, txReadForm, usdPrice } from './portfolio.js';
import { clearFilter, closeMs, colsFor, filtered, fitPanel, moveCol, refreshCols, refreshResults, renderScreener, screenOf, setCols, sorted, tableHtml } from './screener.js';
import { listOf, persist, state, ui } from './store.js';
import { sync, syncConnect, syncDisconnect, syncNow, syncOn } from './sync.js';
import { backupJson, backupName, mergeData, parseBackup, replaceData } from './backup.js';
import { renderGuide } from './guide.js';
import { renderSignals } from './signals.js';
import { parseCode, renderTransfer } from './transfer.js';

addEventListener('online', () => { if (syncOn()) syncNow(); });
/* ============================================================
   Yedek dosyası: indir / yükle (birleştir ya da iki adımlı onayla tümünü değiştir)
   ============================================================ */
async function downloadBackup() {
  const now = new Date(), name = backupName(now);
  const file = new File([backupJson(now)], name, { type: 'application/json' });
  state.lastBackup = now.toISOString(); persist();
  // Telefonda paylaşım menüsü (Dosyalar'a kaydet, Drive…); masaüstünde doğrudan indirme
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); ui.backup = { done: 'Yedek paylaşıldı.' }; renderTransfer(); return; }
    catch (err) { if (err.name === 'AbortError') { renderTransfer(); return; } }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  ui.backup = { done: `${name} indirildi.` }; renderTransfer();
}
function readBackupFile(f) {
  if (!f) return;
  if (f.size > 5e6) { ui.backup = { err: 'Dosya çok büyük; Tahta yedeği olmayabilir.' }; renderTransfer(); return; }
  f.text().then(text => { ui.backup = { file: f.name, data: parseBackup(text), sync: syncOn() }; })
    .catch(err => { ui.backup = { err: err.message }; })
    .finally(() => renderTransfer());
}
function backupAction(act) {
  const b = ui.backup;
  if (act === 'download') { downloadBackup(); return; }
  if (act === 'cancel' || !b?.data) { ui.backup = null; renderTransfer(); return; }
  if (act === 'merge') {
    const r = mergeData(b.data); persist();
    ui.backup = { done: `Birleştirildi: ${r.pAdded} portföy varlığı eklendi, ${r.pUpdated} güncellendi; ${r.watch} yeni izleme hissesi, ${r.saved} tarama.` };
  } else if (act === 'replace') {
    if (!b.armed) { b.armed = true; renderTransfer(); return; }
    replaceData(b.data); persist();
    ui.backup = { done: `Veriler yedekteki hâline döndü: ${state.portfolio.length} portföy varlığı, ${state.watch.length} izleme hissesi, ${state.saved.length} tarama.` };
  }
  renderTransfer();
}
/* ============================================================
   Olaylar
   ============================================================ */
view.addEventListener('click', e => {
  const b = e.target.closest('button, tr[data-t]');
  if (!b) return;
  const d = b.dataset;
  if (d.star) {
    e.stopPropagation();
    const i = state.watch.indexOf(d.star);
    if (i >= 0) state.watch.splice(i, 1); else state.watch.push(d.star);
    persist();
    document.querySelectorAll(`[data-star="${d.star}"]`).forEach(x => x.setAttribute('aria-pressed', i < 0));
    if (state.preset === 'watch' && !location.hash.startsWith('#/h/')) renderScreener();
    return;
  }
  if (d.pgroup) { ui.pgroup = ui.pgroup === d.pgroup ? null : d.pgroup; renderScreener(); return; }
  if (d.sigpick != null) { setSigPick(+d.sigpick); return; }
  if (b.id === 'ftoggle') { ui.fOpen = !ui.fOpen; b.setAttribute('aria-expanded', ui.fOpen); b.closest('.toolbar').classList.toggle('fopen', ui.fOpen); return; }
  if (d.fclear) { clearFilter(d.fclear); persist(); renderScreener(); return; }
  if (d.intro) {
    if (d.intro === 'done') { state.introDone = true; ui.introStep = 0; persist(); } else ui.introStep = (ui.introStep || 0) + (d.intro === 'next' ? 1 : -1);
    renderScreener(); return;
  }
  if (d.preset) {
    state.preset = d.preset;
    const p = PRESETS.find(x => x.id === d.preset);
    if (!p?.group) ui.pgroup = null;
    if (p?.sort) state.sort = { key: p.sort[0], dir: p.sort[1] };
    persist(); renderScreener(); return;
  }
  if (d.view) { state.view = d.view; persist(); renderScreener(); return; }
  if (d.sort) {
    state.sort = state.sort.key === d.sort ? { key: d.sort, dir: -state.sort.dir } : { key: d.sort, dir: ['t', '_sector', '_idx', '_nextDiv'].includes(d.sort) ? 1 : -1 };
    persist(); renderScreener(); return;
  }
  // Karşılaştırma
  if (d.cmpadd) {
    if (!state.compare.includes(d.cmpadd)) {
      const stocks = state.compare.filter(x => x !== 'XU100');
      if (stocks.length >= CMP_MAX) state.compare.splice(state.compare.indexOf(stocks[0]), 1); // en eskisini çıkar
      state.compare.unshift(d.cmpadd);
    }
    persist(); location.hash = '#/karsilastir'; return;
  }
  if (d.cmpdel) { state.compare = state.compare.filter(x => x !== d.cmpdel); persist(); renderCompare(); return; }
  if (d.cmpidx) { state.compare.push('XU100'); persist(); renderCompare(); return; }
  if (d.crange) { state.cmpRange = d.crange; persist(); renderCompare(); return; }
  // Aktarma
  if (d.copy) {
    const el = $('#' + d.copy), msg = $('#copyMsg');
    const done = () => { msg.textContent = 'Kopyalandı'; setTimeout(() => { msg.textContent = ''; }, 2000); };
    const fallback = () => { el.hidden = false; el.focus(); el.select(); msg.textContent = 'Seçili metni kopyalayın'; };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(el.value).then(done, fallback); else fallback();
    return;
  }
  if (d.backup) { backupAction(d.backup); return; }
  if (b.id === 'importBtn') {
    const msg = $('#importMsg');
    try {
      const r = mergeData(parseCode($('#importCode').value));
      persist();
      msg.className = 'up';
      msg.textContent = `${r.watch} yeni izleme hissesi, ${r.saved} tarama ve ${r.pAdded} portföy varlığı eklendi (${r.pUpdated} güncellendi).`;
      if (location.hash.startsWith('#/aktar/')) history.replaceState(null, '', '#/aktar');
    } catch (e) {
      msg.className = 'down';
      msg.textContent = e.message.startsWith('Kod') ? e.message : 'Kod okunamadı. Eksik ya da bozuk kopyalanmış olabilir.';
    }
    return;
  }
  if (d.mstoggle) {
    const was = ui.msOpen === d.mstoggle;
    closeMs();
    if (!was) {
      ui.msOpen = d.mstoggle;
      const m = b.closest('.ms'), panel = m.querySelector('.ms-panel');
      panel.hidden = false; b.setAttribute('aria-expanded', 'true'); fitPanel(panel);
      m.querySelector('.ms-q')?.focus();
    }
    return;
  }
  if (d.msclear) { state[d.msclear] = []; persist(); b.closest('.ms').querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = false; }); refreshResults(); return; }
  if (d.msclose) { closeMs(); return; }
  if (d.colmove) {
    e.preventDefault(); // label içindeki düğme: onay kutusunu değiştirmesin
    const [k, dir] = d.colmove.split('|'), i = colsFor(state.view).indexOf(k);
    moveCol(k, i + +dir); refreshCols();
    view.querySelector(`.colpanel [data-colmove="${k}|${dir}"]:not([disabled])`)?.focus();
    return;
  }
  if (d.colsreset) { if (state.cols) delete state.cols[state.view]; persist(); renderScreener(); return; }
  // Portföy
  if (d.pfaddsym) { pfOpen('temettu', d.pfaddsym); ui.pfDelArmed = null; location.hash = '#/portfoy'; return; }
  if (d.pfadd) { pfOpen(d.pfadd); ui.pfDelArmed = null; renderPortfolio(); window.scrollTo(0, 0); $('#pfSym')?.focus(); return; }
  if (d.pfcat) {
    pfReadForm();
    const was = ui.pfForm.cat, nowAsset = isAssetCat(d.pfcat);
    ui.pfForm.cat = d.pfcat;
    if (!ui.pfForm.id && (isAssetCat(was) || nowAsset) && was !== d.pfcat) { ui.pfForm.sym = nowAsset ? ASSET_CATS[d.pfcat][0] : ''; ui.pfForm.cost = nowAsset ? (coinSym(ui.pfForm) ? usdPrice(ui.pfForm.sym) : currentPrice(ui.pfForm)) : ''; ui.pfForm.flow = defaultFlow(ui.pfForm.sym, false); }
    renderPortfolio(); return;
  }
  if (d.pfcancel) { ui.pfForm = null; renderPortfolio(); return; }
  if (d.pfedit) {
    const p = state.portfolio.find(x => x.id === d.pfedit);
    if (p) { ui.txForm = null; ui.pfForm = { id: p.id, cat: p.cat, sym: p.sym, note: p.note || '' }; }
    ui.pfDelArmed = null; renderPortfolio(); window.scrollTo(0, 0); return;
  }
  if (d.pftx) { const [type, pid] = d.pftx.split(':'); txOpen(type, pid); ui.pfDelArmed = null; renderPortfolio(); window.scrollTo(0, 0); $('#txQty')?.focus(); return; }
  if (d.txtype) { txReadForm(); const tp = state.portfolio.find(x => x.id === ui.txForm.pid); if (ui.txForm.type !== d.txtype && tp) ui.txForm.flow = defaultFlow(tp.sym, d.txtype === 'sell'); ui.txForm.type = d.txtype; renderPortfolio(); return; }
  if (d.txall) { txReadForm(); const p = state.portfolio.find(x => x.id === ui.txForm.pid); ui.txForm.qty = trNum(pfCalc(p).qty); renderPortfolio(); return; }
  if (d.txcancel) { ui.txForm = null; const c = CASH(); if (c && !c.txs.length) state.portfolio = state.portfolio.filter(x => x !== c); renderPortfolio(); return; }
  if (d.pfhist) { pfHist.has(d.pfhist) ? pfHist.delete(d.pfhist) : pfHist.add(d.pfhist); ui.pfDelArmed = null; renderPortfolio(); return; }
  if (d.divok || d.divno || d.divundo) {
    const [pid, date] = (d.divok || d.divno || d.divundo).split('|');
    const p = state.portfolio.find(x => x.id === pid);
    if (!p) return;
    if (d.divundo) { const err = undoDiv(p, date); if (err) { alertMsg(err); return; } persist(); renderPortfolio(); return; }
    if (d.divno) { (p.divs ||= {})[date] = { status: 'ignored' }; persist(); renderPortfolio(); return; }
    const row = b.closest('tr'), net = num(row.querySelector('.divnet').value), flow = row.querySelector('.divflow').value;
    if (!(net > 0)) { alertMsg('Net tutar sıfırdan büyük bir sayı olmalı.'); return; }
    confirmDiv(p, date, net, flow); persist(); renderPortfolio(); return;
  }
  if (d.cashflow) { ensureCash(); txOpen(d.cashflow, CASH().id); ui.pfDelArmed = null; renderPortfolio(); window.scrollTo(0, 0); $('#txQty')?.focus(); return; }
  if (d.pfdel) {
    if (ui.pfDelArmed !== d.pfdel) { ui.pfDelArmed = d.pfdel; renderPortfolio(); return; } // ilk dokunuş: onay iste
    const err = removePosition(d.pfdel); ui.pfDelArmed = null;
    if (err) { renderPortfolio(); alertMsg(err); return; }
    persist(); renderPortfolio(); return;
  }
  if (d.txdel) {
    const [pid, tid] = d.txdel.split(':');
    if (ui.pfDelArmed !== tid) { ui.pfDelArmed = tid; renderPortfolio(); return; }
    const p = state.portfolio.find(x => x.id === pid), err = p ? removeTx(p, tid) : null; ui.pfDelArmed = null;
    if (err) { renderPortfolio(); alertMsg(err); return; }
    persist(); renderPortfolio(); return;
  }
  if (b.id === 'saveBtn') { ui.savingOpen = true; renderScreener(); $('#saveName')?.focus(); return; }
  if (d.cancelsave) { ui.savingOpen = false; renderScreener(); return; }
  if (d.load != null) {
    const sv = state.saved[+d.load];
    if (sv) Object.assign(state, { preset: sv.preset, index: sv.index, markets: listOf(sv, 'market'), sectors: listOf(sv, 'sector'), view: VIEWS[sv.view] ? sv.view : state.view,
      sort: { ...sv.sort }, filters: sv.filters.map(f => ({ ...f })) });
    persist(); renderScreener(); return;
  }
  if (d.unsave != null) { state.saved.splice(+d.unsave, 1); persist(); renderScreener(); return; }
  if (b.id === 'addFilter') { state.filters.push({ key: 'rsi', op: '<', value: '' }); persist(); renderScreener(); view.querySelector('.frow:last-child input')?.focus(); return; }
  if (d.remove != null) { state.filters.splice(+d.remove, 1); persist(); renderScreener(); return; }
  if (d.range) {
    state.chart.range = d.range; persist();
    view.querySelectorAll('[data-range]').forEach(x => x.setAttribute('aria-pressed', x.dataset.range === d.range));
    const t = location.hash.slice(4);
    if (HIST.has(t)) setRange(d.range, HIST.get(t).d);
    return;
  }
  if (d.cscale) {
    state.chart.scale = d.cscale; persist();
    view.querySelectorAll('[data-cscale]').forEach(x => x.setAttribute('aria-pressed', x.dataset.cscale === d.cscale));
    charts[0]?.priceScale('right').applyOptions({ mode: { lin: 0, log: 1, pct: 2 }[d.cscale], autoScale: true });
    return;
  }
  if (d.cview === 'reset') {
    const t = location.hash.slice(4);
    for (const c of charts) c.priceScale('right').applyOptions({ autoScale: true });
    if (HIST.has(t)) setRange(state.chart.range, HIST.get(t).d);
    return;
  }
  if (d.cview === 'full') { toggleFull(); return; }
  if (d.dtab) {
    state.dtab = d.dtab; persist();
    view.querySelectorAll('[data-dtab]').forEach(x => x.setAttribute('aria-selected', x.dataset.dtab === d.dtab));
    view.querySelectorAll('.dpane').forEach(x => { x.hidden = x.dataset.pane !== d.dtab; });
    return;
  }
  if (d.tg) {
    state.chart[d.tg] = d.tg === 'vol' ? state.chart.vol === false : !state.chart[d.tg]; persist();
    view.querySelectorAll(`#indMenu [data-tg="${d.tg}"]`).forEach(x => x.setAttribute('aria-pressed', state.chart[d.tg]));
    const chips = $('#indChips'); if (chips) chips.innerHTML = indChips();
    for (const [k] of PANES) $(`#pane-${k}`).hidden = !state.chart[k];
    const t = location.hash.slice(4);
    if (HIST.has(t)) drawCharts(HIST.get(t));
    return;
  }
  if (d.t) location.hash = `#/h/${d.t}`;
});
// Açılır menüler (<details class="dd">): dışarı tıklanınca kapanır
document.addEventListener('click', e => { document.querySelectorAll('details.dd[open]').forEach(x => { if (!x.contains(e.target)) x.open = false; }); });
// Bilgisayarda başlığı sürükleyip bırakarak sütun sırası
export let dragCol = null;
view.addEventListener('dragstart', e => {
  const th = e.target.closest?.('th[data-col]'); if (!th) return;
  dragCol = th.dataset.col; th.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragCol);
});
view.addEventListener('dragover', e => {
  const th = e.target.closest?.('th[data-col]'); if (!th || !dragCol) return;
  e.preventDefault();
  const r = th.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
  view.querySelectorAll('th.drop-before, th.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  if (th.dataset.col !== dragCol) th.classList.add(after ? 'drop-after' : 'drop-before');
});
view.addEventListener('dragend', () => { dragCol = null; view.querySelectorAll('th.dragging, th.drop-before, th.drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after')); });
view.addEventListener('drop', e => {
  const th = e.target.closest?.('th[data-col]'); if (!th || !dragCol) return;
  e.preventDefault();
  const target = th.dataset.col, k = dragCol; dragCol = null;
  if (target === k) return;
  const r = th.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
  const rest = colsFor(state.view).filter(x => x !== k), i = rest.indexOf(target);
  moveCol(k, after ? i + 1 : i); refreshCols();
});
view.addEventListener('change', e => {
  if (e.target.id === 'backupFile') { readBackupFile(e.target.files?.[0]); return; }
  if (e.target.id === 'indexSel') { state.index = e.target.value; persist(); renderScreener(); return; }
  if (e.target.id === 'hideTedbir') { state.hideTedbir = e.target.checked; persist(); refreshResults(); return; }
  const ms = e.target.closest('.ms');
  if (ms && e.target.type === 'checkbox') {
    const k = ms.dataset.ms, v = e.target.value;
    if (k === 'cols') {
      const cur = colsFor(state.view);
      if (!e.target.checked && cur.length <= 1) { e.target.checked = true; return; } // en az bir sütun kalsın
      setCols(state.view, e.target.checked ? [...cur, v] : cur.filter(x => x !== v));
      refreshCols(); return;
    }
    state[k] = e.target.checked ? [...new Set([...state[k], v])] : state[k].filter(x => x !== v);
    persist(); refreshResults(); return;
  }
  if (e.target.id === 'txFlow') { txReadForm(); const el = $('#txAmt'); if (el) el.innerHTML = txPreview(ui.txForm); return; }
  if (e.target.id === 'pfSym' && isAssetCat(ui.pfForm?.cat)) { pfReadForm(); ui.pfForm.cost = ui.pfForm.sym === 'TRY' ? '' : coinSym(ui.pfForm) ? usdPrice(ui.pfForm.sym) : currentPrice(ui.pfForm); ui.pfForm.flow = defaultFlow(ui.pfForm.sym, false); renderPortfolio(); return; }
  const row = e.target.closest('.frow');
  if (!row) return;
  const f = state.filters[+row.dataset.i];
  f[e.target.dataset.f] = e.target.value;
  persist(); renderScreener();
});
// Değer yazarken anında süz (odak kaybolmasın diye yalnızca tablo ve sayaç yenilenir)
view.addEventListener('input', e => {
  if (e.target.closest?.('#txForm')) { txReadForm(); const el = $('#txAmt'); if (el) el.innerHTML = txPreview(ui.txForm); }
  if (e.target.classList.contains('ms-q')) {
    const q = e.target.value.trim().toLocaleLowerCase('tr');
    const list = e.target.closest('.ms').querySelector('.ms-list');
    list.querySelectorAll('label').forEach(l => { l.hidden = q && !l.textContent.toLocaleLowerCase('tr').includes(q); });
    // Eşleşen satırı kalmayan grup başlıklarını da gizle
    let grp = null, any = false;
    const close = () => { if (grp) grp.hidden = !any; };
    for (const el of list.children) {
      if (el.classList.contains('ms-grp')) { close(); grp = el; any = false; } else if (!el.hidden) any = true;
    }
    close();
    return;
  }
  if (e.target.dataset.f !== 'value') return;
  state.filters[+e.target.closest('.frow').dataset.i].value = e.target.value;
  persist();
  const rows = sorted(filtered());
  view.querySelector('.tablewrap').innerHTML = rows.length ? tableHtml(rows, colsFor(state.view)) : '<p class="empty">Bu koşullara uyan hisse yok.</p>';
  view.querySelector('.count b').textContent = rows.length;
});
view.addEventListener('submit', e => {
  if (e.target.id === 'cmpForm') {
    e.preventDefault();
    const q = $('#cmpAdd').value.trim().toUpperCase();
    const hit = BY.has(q) ? q : DATA.stocks.find(s => s.t.startsWith(q))?.t;
    if (!hit) { $('#cmpAdd').setCustomValidity('Bu kodla hisse bulunamadı'); $('#cmpAdd').reportValidity(); return; }
    if (!state.compare.includes(hit)) state.compare.unshift(hit);
    persist(); renderCompare(); return;
  }
  if (e.target.id === 'pfForm') {
    e.preventDefault(); pfReadForm();
    const f = ui.pfForm, asset = isAssetCat(f.cat), msg = $('#pfMsg');
    if (f.id) { // yalnızca kategori ve not
      const p = state.portfolio.find(x => x.id === f.id);
      if (p) { p.cat = f.cat; p.note = (f.note || '').trim() || null; }
      ui.pfForm = null; persist(); renderPortfolio(); return;
    }
    const cash = asset && f.sym === 'TRY';
    const qty = ASSETS[f.sym]?.crypto ? numDec(f.qty) : num(f.qty), price = cash ? 1 : num(f.cost), fee = f.fee ? num(f.fee) : 0;
    if (!asset && !BY.has(f.sym)) { msg.textContent = `"${f.sym}" kodunda hisse bulunamadı.`; return; }
    if (!(qty > 0)) { msg.textContent = 'Miktar sıfırdan büyük bir sayı olmalı.'; return; }
    if (!(price > 0)) { msg.textContent = 'Fiyat sıfırdan büyük bir sayı olmalı.'; return; }
    if (!(fee >= 0)) { msg.textContent = 'Komisyon geçerli bir sayı olmalı.'; return; }
    const tx = { id: pfId(), type: 'buy', date: f.date || null, qty, price, fee: cash ? 0 : fee };
    if (coinSym(f)) { const err = toTl(tx, f.flow, price, fee); if (err) { msg.textContent = err; return; } }
    let pos = cash ? CASH() : state.portfolio.find(x => x.cat === f.cat && x.sym === f.sym);
    const isNew = !pos;
    if (isNew) pos = { id: pfId(), cat: f.cat, sym: f.sym, note: null, txs: [] };
    const err = applyTx(pos, tx, cash ? 'ext' : f.flow);
    if (err) { msg.textContent = err; return; }
    if (isNew && !state.portfolio.includes(pos)) state.portfolio.push(pos);
    if (f.note?.trim()) pos.note = f.note.trim();
    ui.pfForm = null; persist(); renderPortfolio(); return;
  }
  if (e.target.id === 'txForm') {
    e.preventDefault(); txReadForm();
    const f = ui.txForm, p = state.portfolio.find(x => x.id === f.pid), msg = $('#txMsg');
    if (!p) { ui.txForm = null; renderPortfolio(); return; }
    const fixed = isCash(p);
    const qty = isCrypto(p) ? numDec(f.qty) : num(f.qty), price = fixed ? 1 : num(f.price), fee = !fixed && f.fee ? num(f.fee) : 0;
    if (!f.date) { msg.textContent = 'Tarih girin.'; return; }
    if (!(qty > 0)) { msg.textContent = 'Miktar sıfırdan büyük bir sayı olmalı.'; return; }
    if (!(price > 0)) { msg.textContent = 'Fiyat sıfırdan büyük bir sayı olmalı.'; return; }
    if (!(fee >= 0)) { msg.textContent = 'Komisyon geçerli bir sayı olmalı.'; return; }
    const tx = { id: pfId(), type: f.type, date: f.date, qty, price, fee };
    if (isCoin(p)) { const e2 = toTl(tx, f.flow, price, fee); if (e2) { msg.textContent = e2; return; } }
    const err = applyTx(p, tx, fixed ? 'ext' : f.flow);
    if (err) { msg.textContent = err; return; }
    ui.txForm = null; persist(); renderPortfolio(); return;
  }
  if (e.target.id !== 'saveForm') return;
  e.preventDefault();
  const name = $('#saveName').value.trim();
  if (!name) return;
  const i = state.saved.findIndex(s => s.name === name);
  const sv = { name, ...screenOf() };
  if (i >= 0) state.saved[i] = sv; else state.saved.push(sv); // aynı ad varsa üzerine yaz
  ui.savingOpen = false; persist(); renderScreener();
});
$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#search').value.trim().toUpperCase();
  if (!q || !DATA) return;
  const hit = BY.has(q) || q === 'XU100' ? q : DATA.stocks.find(s => s.t.startsWith(q) || (s.name || '').toUpperCase().includes(q))?.t;
  if (hit) { location.hash = `#/h/${hit}`; $('#search').value = ''; $('#search').blur(); }
});
$('#search').addEventListener('change', e => { const q = e.target.value.trim().toUpperCase(); if (BY.has(q)) $('#searchForm').requestSubmit(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const t = location.hash.slice(4);
  if (location.hash.startsWith('#/h/') && HIST.has(t)) drawCharts(HIST.get(t));
});
/* ============================================================
   Yönlendirme
   ============================================================ */
export let lastScroll = 0;
export function route() {
  if (!DATA) return;
  const h = location.hash;
  const onScreener = !!view.querySelector('.toolbar');
  if (onScreener) lastScroll = view.querySelector('.tablewrap')?.scrollTop || 0;
  const m = h.match(/^#\/h\/([A-Z0-9]+)$/i);
  const section = m ? 'hisse' : h.startsWith('#/karsilastir') ? 'karsilastir' : h.startsWith('#/aktar') ? 'aktar' : h.startsWith('#/portfoy') ? 'portfoy' : h.startsWith('#/rehber') ? 'rehber' : h.startsWith('#/sinyal') ? 'sinyal' : 'tarama';
  document.querySelectorAll('[data-nav]').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === section));
  if (m) renderDetail(m[1].toUpperCase());
  else if (section === 'karsilastir') renderCompare();
  else if (section === 'aktar') renderTransfer(h.startsWith('#/aktar/') ? h.slice(8) : null);
  else if (section === 'portfoy') renderPortfolio();
  else if (section === 'rehber') renderGuide();
  else if (section === 'sinyal') renderSignals();
  else {
    renderScreener();
    const tw = view.querySelector('.tablewrap');
    if (tw) tw.scrollTop = lastScroll;
    return;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
/* Yana kayan satırlarda (sekmeler, hazır taramalar, kartlar) devamı olduğunu sağ kenarı soldurarak göster */
const FADE = '.dtabs, .presets:not(.sub), .today, .controls .seg';
function fadeCheck(el) { el.classList.toggle('fade-r', el.scrollWidth - el.clientWidth - el.scrollLeft > 4); }
function fadeScan() {
  view.querySelectorAll(FADE).forEach(el => {
    if (!el.dataset.fade) { el.dataset.fade = '1'; el.addEventListener('scroll', () => fadeCheck(el), { passive: true }); }
    fadeCheck(el);
  });
}
let fadeT = 0;
new MutationObserver(() => { cancelAnimationFrame(fadeT); fadeT = requestAnimationFrame(fadeScan); }).observe(view, { childList: true, subtree: true });
addEventListener('resize', fadeScan);
(async () => {
  try {
    await loadSummary();
    route();
    if (syncOn()) syncNow();
  } catch (e) {
    view.innerHTML = `<p class="empty">Veri yüklenemedi. GitHub Actions'taki "Veriyi güncelle ve yayınla" iş akışı henüz çalışmamış olabilir.<br>Yerelde denemek için: <code>scripts/dev.sh</code></p>`;
  }
})();
// Uygulama dosyaları güncellenince service worker haber verir; kullanıcı tek dokunuşla yeniler.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // Sayfa açıkken yeni service worker devralırsa (yeni sürüm yayınlandı) yenileme uyarısı göster
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) $('#updateBar').hidden = false; });
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'update') $('#updateBar').hidden = false;
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Yeni bir service worker devreye girdiğinde de uyar
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'activated' && hadController) $('#updateBar').hidden = false; }); // ilk kurulumda gösterme
    });
  }).catch(() => {});
}
$('#reloadBtn').addEventListener('click', () => location.reload());
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-sync]');
  if (!b) return;
  const act = b.dataset.sync;
  if (act === 'connect') {
    const msg = $('#syncMsg'), token = $('#syncToken').value;
    if (!token.trim()) { msg.className = 'down'; msg.textContent = 'Erişim anahtarını girin.'; return; }
    b.disabled = true; msg.className = 'muted'; msg.textContent = 'Bağlanılıyor…';
    try {
      const r = await syncConnect(token, $('#syncGist').value);
      if (location.hash.startsWith('#/aktar')) renderTransfer();
      if (r === 'created') alertMsg('Bağlandı: özel Gist oluşturuldu ve verileriniz yedeklendi.');
      else if (sync.state === 'idle') alertMsg('Bağlandı: veriler buluttakiyle eşitlendi.');
    } catch (err) { msg.className = 'down'; msg.textContent = err.message; b.disabled = false; }
    return;
  }
  if (act === 'now') { await syncNow(); return; }
  if (act === 'disconnect') { syncDisconnect(); if (location.hash.startsWith('#/aktar')) renderTransfer(); return; }
  if (act === 'keeplocal') { sync.state = 'idle'; await syncNow('local'); return; }
  if (act === 'takeremote') { sync.state = 'idle'; await syncNow('remote'); return; }
});
