import { DATA, loadHist } from './data.js';
import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { ASSETS, pfRows } from './pfcore.js';
import { breadthHtml, introHtml, pulseTone } from './screener.js';
import { loadSignals } from './signals.js';
import { state, ui } from './store.js';
import { F0, F1, F2, TREND, cls, esc, fmt, ok } from './util.js';

/* ============================================================
   Anasayfa: açılışta günün özeti — piyasa, kişisel (portföy, izleme listesi), sinyaller, günün hareketleri, sektörler, takvim
   Bütün bilgiler mevcut veriden (summary.json, signals.json, cihazdaki portföy) türetilir; yeni bir veri kaynağı yok.
   ============================================================ */
const LIQ = 20e6;   // günün hareketlerinde dikkate alınan en düşük 20 günlük ortalama işlem hacmi (sinyallerdeki likidite filtresiyle aynı)
const LIMIT = 0.095; // tavan / taban yaklaşığı (BIST fiyat sınırı %10)
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const longDate = iso => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${DAYS[d.getDay()]}`; };
const pctB = x => `<b class="num ${cls(x)}">${fmt.pct(x)}</b>`;
const link = (t, inner, extra = '') => `<a class="hrow" href="#/h/${esc(t)}"${extra}>${inner}</a>`;
const median = a => { const v = a.filter(ok).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

/* Piyasa: BIST 100, 3 aylık çizgi, piyasa nabzı, yükselen / düşen, döviz ve altın */
function marketHtml() {
  const ix = DATA.index, B = DATA.breadth, P = B?.pulse;
  const all = DATA.stocks.filter(s => ok(s.chg1d));
  const upN = all.filter(s => s.chg1d > 0).length, dnN = all.filter(s => s.chg1d < 0).length, flat = all.length - upN - dnN;
  const ceil = all.filter(s => s.chg1d >= LIMIT).length, floor = all.filter(s => s.chg1d <= -LIMIT).length;
  const trend = ix?.trend ? TREND[ix.trend] : null;
  const rsiNote = !ix || !ok(ix.rsi) ? '' : ix.rsi < 30 ? ' · RSI aşırı satım bölgesinde' : ix.rsi > 70 ? ' · RSI aşırı alım bölgesinde' : '';
  const fx = [['USD', 'Dolar', '₺'], ['EUR', 'Euro', '₺'], ['XAU', 'Gram altın', '₺'], ['BTC', 'Bitcoin', '$']].filter(([k]) => DATA.assets?.[k]);
  return `<section class="panel hmarket">
    ${ix ? `<a class="hix" href="#/h/XU100">
      <div><span class="hlbl">BIST 100</span><div class="hixnum"><b class="num">${F2.format(ix.last)}</b> <span class="num ${cls(ix.chg1d)}">${fmt.pct(ix.chg1d)}</span></div>
        <div class="hixrets">${[['1 hafta', ix.chg1w], ['1 ay', ix.chg1m], ['3 ay', ix.chg3m], ['Yılbaşı', ix.ytd]].map(([l, v]) => `<span>${l} <b class="num ${cls(v)}">${fmt.pct(v)}</b></span>`).join('')}</div>
        ${trend ? `<p class="hnote">Trend: <b class="${trend[1]}">${trend[0]}</b> · 52 haftalık zirveye ${fmt.pct(ix.distHi52)}${rsiNote}</p>` : ''}</div>
      <div class="hspark" id="hSpark" aria-hidden="true"></div></a>` : ''}
    <div class="hgrid2">
      ${P ? `<button type="button" class="hcard hpulse ${pulseTone(P.score)}" id="brdBtn" aria-expanded="${!!ui.brdOpen}">
        <span class="hlbl">Piyasa Nabzı</span><b class="num">${P.score}<small>/100</small> · ${esc(P.band)}</b>
        <span class="pulsebar sm"><i style="left:${P.score}%"></i></span>
        <small class="muted">1 hafta önce ${P.w1} · 1 ay önce ${P.m1} · ayrıntı ▾</small></button>` : ''}
      <div class="hcard hbreadth"><span class="hlbl">Bugün · ${all.length} hisse</span>
        <div class="hbar" role="img" aria-label="${upN} yükselen, ${dnN} düşen"><i class="u" style="flex:${upN}"></i><i class="f" style="flex:${flat}"></i><i class="d" style="flex:${dnN}"></i></div>
        <div class="hbreadthn"><span class="up">▲ ${upN} yükselen</span><span class="down">▼ ${dnN} düşen</span></div>
        <small class="muted">Tavan ${ceil} · taban ${floor}${flat ? ` · değişmeyen ${flat}` : ''}</small></div>
    </div>
    <a class="hregime" id="hRegime" href="#/sinyal" hidden></a>
    ${B ? `<div class="brdpanel hbrd" id="brdPanel"${ui.brdOpen ? '' : ' hidden'}>${breadthHtml(B)}</div>` : ''}
    ${B && (B.neg.length || B.pos.length) ? `<p class="hnote">${B.pos[0] ? `<span class="up">▲</span> ${esc(B.pos[0])}` : `<span class="down">▼</span> ${esc(B.neg[0])}`}</p>` : ''}
    ${fx.length ? `<div class="hfx">${fx.map(([k, l, u]) => { const a = DATA.assets[k], v = u === '$' ? a.usd : a.last;
      return `<span><small>${l}</small><b class="num">${u === '$' ? '$' + F0.format(v) : fmt.price(v)}</b> <span class="num ${cls(a.chg1d)}">${fmt.pct(a.chg1d)}</span></span>`; }).join('')}</div>` : ''}
  </section>`;
}

/* Kişisel: portföy ve izleme listesi (boşsa kısa yönlendirme) */
function personalHtml() {
  const rows = state.portfolio.length ? pfRows().filter(r => r.open) : [];
  let pf;
  if (rows.length) {
    const v = rows.reduce((a, r) => a + (r.value || 0), 0), d = rows.reduce((a, r) => a + (r.day || 0), 0);
    const mv = rows.filter(r => r.p.sym !== 'TRY' && ok(r.q?.chg1d) && r.value > 0).sort((a, b) => b.q.chg1d - a.q.chg1d);
    const nm = r => esc(r.s?.t || ASSETS[r.p.sym]?.name || r.p.sym);
    pf = `<a class="hcard" href="#/portfoy"><span class="hlbl">Portföy · ${rows.length} varlık</span><b class="num">${fmt.big(v)} ₺</b>
      <small><span class="${cls(d)}">bugün ${d > 0 ? '+' : ''}${fmt.big(d)} ₺ (${fmt.pct(v - d ? d / (v - d) : null)})</span></small>
      ${mv.length > 1 ? `<small class="muted">en iyi ${nm(mv[0])} <span class="${cls(mv[0].q.chg1d)}">${fmt.pct(mv[0].q.chg1d)}</span> · en zayıf ${nm(mv.at(-1))} <span class="${cls(mv.at(-1).q.chg1d)}">${fmt.pct(mv.at(-1).q.chg1d)}</span></small>` : ''}</a>`;
  } else pf = `<a class="hcard hcta" href="#/portfoy"><span class="hlbl">Portföy</span><b>Portföyünüzü ekleyin</b><small class="muted">Değer, kâr/zarar ve temettüler kendiliğinden izlenir</small></a>`;
  const w = DATA.stocks.filter(s => state.watch.includes(s.t) && ok(s.chg1d)).sort((a, b) => b.chg1d - a.chg1d);
  const watch = w.length ? `<div class="hcard hlist"><div class="hhead"><span class="hlbl">İzleme listem · ${w.length}</span><a href="#/tarama" data-gopreset="watch">Tümü →</a></div>
      ${(w.length > 6 ? [...w.slice(0, 3), ...w.slice(-3)] : w).map(s => link(s.t, `<b>${s.t}</b>${s.sig?.length ? ' <span class="chip up" title="Açık sinyal">sinyal</span>' : ''}<span class="num">${fmt.price(s.last)}</span>${pctB(s.chg1d)}`)).join('')}
      ${w.length > 6 ? `<small class="muted">En güçlü ve en zayıf üçer hisse</small>` : ''}</div>`
    : `<div class="hcard hcta"><span class="hlbl">İzleme listem</span><b>Henüz hisse yok</b><small class="muted">Tablodaki ya da hisse sayfasındaki ★ ile ekleyin</small></div>`;
  return `<section class="hsec"><h2 class="hh">Sizin için</h2><div class="hgrid2">${pf}${watch}</div></section>`;
}

/* Sinyaller: bugün oluşanlar, açık / hazırlanan sayıları, son 60 günün özeti (signals.json gelince doldurulur) */
function signalsHtml() {
  const st = DATA.stocks.filter(s => s.sig?.length), all = st.flatMap(s => s.sig.map(g => ({ ...g, t: s.t })));
  const fresh = all.filter(g => g.d.startsWith(DATA.lastDate)).sort((a, b) => b.d.localeCompare(a.d));
  const mine = new Set([...state.watch, ...state.portfolio.map(p => p.sym)]);
  const myS = st.filter(s => mine.has(s.t));
  return `<section class="hsec"><h2 class="hh">Sinyaller <a href="#/sinyal">Sinyaller →</a></h2>
    <div class="hgrid2">
      <a class="hcard" href="#/sinyal"><span class="hlbl">Açık sinyaller</span><b class="num">${all.length} sinyal · ${st.length} hisse</b>
        <small class="muted" id="hCand">&nbsp;</small><small class="muted" id="hRec">&nbsp;</small></a>
      <div class="hcard hlist"><div class="hhead"><span class="hlbl">Bugün oluşan · ${fresh.length}</span></div>
        ${fresh.length ? fresh.slice(0, 5).map(g => link(g.t, `<b>${g.t}</b><span class="hsub">${esc(g.n || g.k)}${g.tf === '4H' ? ' · 4 saat' : ''}</span><span class="num">giriş ${fmt.price(g.e)}</span>`)).join('')
          : '<small class="muted">Son kapanışta yeni sinyal oluşmadı. Hazırlanan kurulumlar bir sonraki kapanışta sinyale dönüşebilir.</small>'}
        ${fresh.length > 5 ? `<small class="muted">+${fresh.length - 5} sinyal daha</small>` : ''}</div>
    </div>
    ${myS.length ? `<p class="hnote">İzleme listenizde ya da portföyünüzde açık sinyal: ${myS.map(s => `<a href="#/h/${s.t}">${s.t}</a>`).join(', ')}</p>` : ''}
  </section>`;
}

/* Günün hareketleri: likit hisselerde en çok yükselen / düşen, en yüksek işlem hacmi; sektörler */
function moversHtml() {
  const liq = DATA.stocks.filter(s => ok(s.chg1d) && (s.turnover || 0) >= LIQ);
  const up = [...liq].sort((a, b) => b.chg1d - a.chg1d).slice(0, 5), dn = [...liq].sort((a, b) => a.chg1d - b.chg1d).slice(0, 5);
  const vol = [...liq].filter(s => ok(s.volRatio)).sort((a, b) => b.volRatio - a.volRatio).slice(0, 5);
  const list = (title, arr, val, mid = s => fmt.price(s.last)) => `<div class="hcard hlist"><div class="hhead"><span class="hlbl">${title}</span></div>${arr.map(s => link(s.t, `<b>${s.t}</b><span class="num">${mid(s)}</span>${val(s)}`)).join('')}</div>`;
  const by = {};
  for (const s of DATA.stocks) if (s.sector && ok(s.chg1d)) (by[s.sector] ||= []).push(s.chg1d);
  const secs = Object.entries(by).filter(([, v]) => v.length >= 4).map(([k, v]) => [k, median(v), v.length]).sort((a, b) => b[1] - a[1]);
  const sec = arr => arr.map(([k, m, n]) => `<div class="hrow static"><span class="hsec-n">${esc(k)} <small class="muted">${n}</small></span>${pctB(m)}</div>`).join('');
  return `<section class="hsec"><h2 class="hh">Günün hareketleri <small class="muted">20 mn ₺ üstü ortalama işlem hacmi olan ${liq.length} hisse</small></h2>
    <div class="hgrid3">
      ${list('En çok yükselen', up, s => pctB(s.chg1d))}
      ${list('En çok düşen', dn, s => pctB(s.chg1d))}
      ${list('Hacmi artanlar', vol, s => `<b class="num" title="Günün hacmi / 20 günlük ortalama">${F1.format(s.volRatio)}×</b>`, s => `<span class="${cls(s.chg1d)}">${fmt.pct(s.chg1d)}</span>`)}
    </div>
    ${secs.length >= 6 ? `<div class="hgrid2 hsecs"><div class="hcard hlist"><div class="hhead"><span class="hlbl">Günün en iyi sektörleri</span><small class="muted">medyan</small></div>${sec(secs.slice(0, 3))}</div>
      <div class="hcard hlist"><div class="hhead"><span class="hlbl">Günün en zayıf sektörleri</span><small class="muted">medyan</small></div>${sec(secs.slice(-3).reverse())}</div></div>` : ''}
  </section>`;
}

/* Takvim: 14 gün içindeki temettüler */
function calendarHtml() {
  const lim = new Date(new Date(DATA.lastDate) * 1 + 14 * 864e5).toISOString().slice(0, 10);
  const div = DATA.stocks.filter(s => s.nextDivDate && s.nextDivDate >= DATA.lastDate && s.nextDivDate <= lim).sort((a, b) => a.nextDivDate.localeCompare(b.nextDivDate));
  if (!div.length) return '';
  return `<section class="hsec"><h2 class="hh">Yaklaşan temettüler <a href="#/tarama" data-gopreset="divSoon">Tümü →</a></h2>
    <div class="hcard hlist">${div.slice(0, 8).map(s => { const net = s.divUpcoming?.[0]?.net;
      return link(s.t, `<b>${s.t}</b><span class="hsub">${fmt.date(s.nextDivDate)}${s.t && state.portfolio.some(p => p.sym === s.t) ? ' · <span class="chip up">portföyde</span>' : ''}</span><span class="num">${ok(net) ? fmt.price(net) + ' ₺ net' : ''}</span><b class="num up">${ok(net) && s.last ? '%' + F1.format(net / s.last * 100) : ''}</b>`); }).join('')}
      ${div.length > 8 ? `<small class="muted">+${div.length - 8} hisse daha</small>` : ''}</div></section>`;
}

/* BIST 100: son 3 ayın kapanış çizgisi */
async function drawSpark() {
  const el = view.querySelector('#hSpark');
  if (!el) return;
  let h; try { h = await loadHist('XU100'); } catch { return; }
  if (!view.contains(el)) return;
  const c = h.c.slice(-63).filter(ok); if (c.length < 2) return;
  const W = 200, H = 60, lo = Math.min(...c), hi = Math.max(...c), y = v => H - 4 - (v - lo) / (hi - lo || 1) * (H - 8);
  const pts = c.map((v, i) => `${(i / (c.length - 1) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" class="${c.at(-1) >= c[0] ? 'up' : 'down'}"/></svg><small class="muted">son 3 ay</small>`;
}

export function renderHome() {
  destroyCharts();
  document.title = 'Tahta';
  const d = DATA.lastDate;
  view.innerHTML = `
  <section class="dhead hhead1"><div><h1>${longDate(d)}</h1><p class="sub">Son kapanışın özeti · fiyatlar yaklaşık 15 dk gecikmeli</p></div></section>
  ${state.introDone ? '' : introHtml()}
  ${marketHtml()}
  ${personalHtml()}
  ${signalsHtml()}
  ${moversHtml()}
  ${calendarHtml()}`;
  view.querySelector('#brdBtn')?.addEventListener('click', e => {
    ui.brdOpen = !ui.brdOpen; e.currentTarget.setAttribute('aria-expanded', ui.brdOpen); view.querySelector('#brdPanel').hidden = !ui.brdOpen;
  });
  drawSpark();
  loadSignals().then(S => {
    const c = view.querySelector('#hCand'), r = view.querySelector('#hRec'), g = view.querySelector('#hRegime'), now = S.regime?.now;
    if (g && now?.lvl) {
      const cl = ['', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5'][now.lvl];
      g.className = `hregime regime-inline ${cl}`; g.style.setProperty('--c', `var(--${cl})`);
      g.innerHTML = `<span class="hlbl">Sinyaller için piyasa</span><span class="rgmeter">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= now.lvl ? cl : ''}"></i>`).join('')}</span><b>${now.lvl}/5 · ${esc(now.name)}</b><span class="muted">→</span>`;
      g.hidden = false;
    }
    if (c && S.candidates) c.textContent = `${S.candidates.length} hazırlanan kurulum`;
    if (r && S.recent?.length) { const w = S.recent.filter(a => a.r > 0).length; r.textContent = `Son 60 gün: ${S.recent.length} sonuçlandı, %${Math.round(w / S.recent.length * 100)} kârlı`; }
  }).catch(() => {});
}
