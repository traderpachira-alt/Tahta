import { renderDcfPanel } from './dcf.js';
import { loadFin, renderFinPanel, renderQualityPanel } from './quality.js';
import { atr, bollinger, fisher, ichimoku, macd, rsi, sma, stochRsi, supertrend, vwma } from '../ind.js';
import { BY, DATA, DIV_Y, MEDIANS, loadHist } from './data.js';
import { $, view } from './dom.js';
import { FIELDS, ICHI, SR_STRONG, ST, tierChip } from './fields.js';
import { colsFor, sorted, tableHtml } from './screener.js';
import { state } from './store.js';
import { tedbirIcon } from './tedbir.js';
import { F1, F2, F4, TREND, cls, esc, fmt, info, ok } from './util.js';

/* ============================================================
   Hisse detayı
   ============================================================ */
export let charts = [];
export function destroyCharts() { charts.forEach(c => c.remove()); charts = []; }
export const SIG_NAMES = { morningstar: 'Morning star' };
export const RANGES = { '1A': 1, '3A': 3, '6A': 6, '1Y': 12, '2Y': 24 };
// Açılışta son mumun sağında bırakılan boşluk (görünen genişliğe oranı): son mumlar kenara yapışmaz, ortaya yakın durur
export const RIGHT_SPACE = 0.35;
// Ana grafik katmanları: [anahtar, etiket, renk değişkeni]
export const OVERLAYS = [
  ['sma20', 'SMA20', '--c-sma20'], ['sma50', 'SMA50', '--c-sma50'], ['sma200', 'SMA200', '--c-sma200'],
  ['vwma', 'VWMA20', '--c-vwma'], ['bb', 'Bollinger', '--c-bb'], ['ichi', 'Ichimoku', '--c-ichi'], ['st', 'Supertrend', '--up'], ['sr', 'Destek/Direnç', '--down'],
];
// Alt paneller: [anahtar, düğme etiketi, panel başlığı]
export const PANES = [
  ['rsi', 'RSI', 'RSI 14'], ['stoch', 'Stoch RSI', 'Stoch RSI 14, 14, 3, 3'], ['macd', 'MACD', 'MACD 12, 26, 9'],
  ['fisher', 'Fisher', 'Fisher 9'], ['atr', 'ATR', 'ATR 14'],
];
/* Destek / direnç (confluence) kaynak adları */
export const SR_LABELS = {
  Yh: 'Önceki yıl yükseği', Yl: 'Önceki yıl düşüğü', Ye: 'Önceki yıl ortası', Qh: 'Önceki çeyrek yükseği', Ql: 'Önceki çeyrek düşüğü', Qe: 'Önceki çeyrek ortası',
  Mh: 'Önceki ay yükseği', Ml: 'Önceki ay düşüğü', Me: 'Önceki ay ortası', Wh: 'Önceki hafta yükseği', Wl: 'Önceki hafta düşüğü', We: 'Önceki hafta ortası',
  Yo: 'Yıllık açılış', Mo: 'Aylık açılış', Wo: 'Haftalık açılış', SWH: 'Haftalık tepe', SWL: 'Haftalık dip',
  POC: 'Hacim profili POC', VAH: 'Değer alanı üstü (VAH)', VAL: 'Değer alanı altı (VAL)', '52H': '52 hafta zirvesi', '52L': '52 hafta dibi',
  S200: 'SMA200', S50: 'SMA50', WS50: 'Haftalık SMA50', PP: 'Aylık pivot', PS1: 'Aylık S1', PR1: 'Aylık R1', GAP: 'Kapanmamış boşluk', RND: 'Yuvarlak sayı',
};
export const srWidth = z => z.s >= 12 ? 4 : z.s >= 8 ? 3 : z.s >= 5 ? 2 : 1;
// Açık göstergeler: araç çubuğunda küçük etiketler (dokununca kapanır)
export function indChips() {
  return [...OVERLAYS, ...PANES.map(([k, l]) => [k, l])].filter(([k]) => state.chart[k])
    .map(([k, l, c]) => `<button type="button" class="tg on" data-tg="${k}" aria-pressed="true" title="${esc(l)} kapat">${c ? `<i style="--c:var(${c})"></i>` : ''}${esc(l)} <span aria-hidden="true">×</span></button>`).join('');
}
export function srPanelHtml(s) {
  const zs = [...(s.srRes || []).slice().reverse().map((z, i, a) => ({ ...z, kind: 'R', i: a.length - i })), ...(s.srSup || []).map((z, i) => ({ ...z, kind: 'D', i: i + 1 }))];
  if (!zs.length) return '';
  const maxS = Math.max(...zs.map(z => z.s));
  const row = z => {
    const dist = z.kind === 'R' ? (z.lo - s.last) / s.last : (z.hi - s.last) / s.last;
    const inZone = s.last >= z.lo && s.last <= z.hi;
    return `<tr class="${z.kind === 'R' ? 'srR' : 'srD'}"><td class="tk"><span class="chip ${z.kind === 'R' ? 'down' : 'up'}">${z.kind === 'R' ? 'Direnç' : 'Destek'} ${z.i}</span></td>
      <td>${fmt.price(z.lo)}${z.hi !== z.lo ? ' – ' + fmt.price(z.hi) : ''}</td><td class="${inZone ? '' : cls(dist)}">${inZone ? 'bölgede' : fmt.pct(dist)}</td>
      <td class="txt"><span class="srbar"><i style="width:${z.s / maxS * 100}%"></i></span> <span class="num${z.s >= SR_STRONG ? ' strong' : ''}">${F1.format(z.s)}</span>${z.s >= SR_STRONG ? ' <span class="chip ' + (z.kind === 'R' ? 'down' : 'up') + '">güçlü</span>' : ''}</td><td>${z.n}×</td>
      <td class="txt srsrc">${z.src.map(c => `<span class="tag">${SR_LABELS[c] || c}</span>`).join('')}</td></tr>`;
  };
  return `<section class="panel srpanel"><h2>Destek / direnç bölgeleri <span class="muted">· confluence</span></h2>
    <div class="tablewrap flat"><table class="grid"><thead><tr><th class="tk">Bölge</th><th>Aralık ₺</th><th>Uzaklık</th><th title="Kesişen seviyelerin ağırlık toplamı (uzun dönem seviyeleri daha ağır)">Güç</th><th title="Kesişen farklı yöntem sayısı">Kesişim</th><th>Kesişen seviyeler</th></tr></thead><tbody>
      ${zs.filter(z => z.kind === 'R').map(row).join('')}
      <tr class="srnow"><td class="tk"><b>Fiyat</b></td><td><b>${fmt.price(s.last)}</b></td><td colspan="4"></td></tr>
      ${zs.filter(z => z.kind === 'D').map(row).join('')}
    </tbody></table></div>
    ${info(`Önceki yıl/çeyrek/ay/hafta yüksek-düşük-orta seviyeleri, dönem açılışları, haftalık dönüş noktaları, 1 yıllık hacim profili, 52 hafta, ortalamalar, aylık pivot ve kapanmamış boşluklar
      yarım ATR toleransla bölgelere birleştirilir. Güç: kesişen seviyelerin ağırlık toplamı (uzun dönem daha ağır); skor ≥ 10 güçlü sayılır. En az 2 farklı yöntemin kesiştiği, fiyatın ±%30'u içindeki en güçlü 3 destek ve 3 direnç gösterilir.`)}
  </section>`;
}
export async function renderDetail(t) {
  destroyCharts();
  const s = BY.get(t) || (t === 'XU100' ? DATA.index : null);
  if (!s) { view.innerHTML = `<p class="empty">"${esc(t)}" bulunamadı. <a href="#/">Taramaya dön</a></p>`; return; }
  document.title = `${t} · Tahta`;
  const isIdx = t === 'XU100';
  const starred = state.watch.includes(t);
  const med = MEDIANS[s.sector || '—'] || {};
  const peers = isIdx ? [] : DATA.stocks.filter(p => p.sector && p.sector === s.sector);

  const rets = [['Gün', 'chg1d'], ['1 hafta', 'chg1w'], ['1 ay', 'chg1m'], ['3 ay', 'chg3m'], ['6 ay', 'chg6m'], ['1 yıl', 'chg1y'], ['Yılbaşı', 'ytd'], ['BIST\'e göre 3A', 'rs3m']];
  const pos52 = ok(s.hi52) && ok(s.lo52) && s.hi52 > s.lo52 ? (s.last - s.lo52) / (s.hi52 - s.lo52) * 100 : null;

  const tech = [
    ['RSI 14', fmt.num(s.rsi), s.rsi < 30 ? '<span class="chip up">Aşırı satım</span>' : s.rsi > 70 ? '<span class="chip down">Aşırı alım</span>' : '<span class="chip">Nötr</span>'],
    ['MACD', FIELDS.macdPct.f(s.macdPct), s.macdCross === 'up' ? '<span class="chip up">Al kesişimi</span>' : s.macdCross === 'down' ? '<span class="chip down">Sat kesişimi</span>' : ok(s.macdPct) ? `<span class="chip ${s.macdPct > 0 ? 'up' : 'down'}">${s.macdPct > 0 ? 'Pozitif' : 'Negatif'}</span>` : ''],
    ['Trend', '', s.trend ? `<span class="chip ${TREND[s.trend][1]}">${TREND[s.trend][0]}</span>` : '—'],
    ['SMA50 / SMA200', '', s.cross === 'golden' ? '<span class="chip up">Golden cross</span>' : s.cross === 'death' ? '<span class="chip down">Death cross</span>' : '<span class="muted">Yeni kesişim yok</span>'],
    ['SMA20 farkı', `<span class="${cls(s.vsSma20)}">${fmt.pct(s.vsSma20)}</span>`, ''],
    ['SMA50 farkı', `<span class="${cls(s.vsSma50)}">${fmt.pct(s.vsSma50)}</span>`, ''],
    ['SMA200 farkı', `<span class="${cls(s.vsSma200)}">${fmt.pct(s.vsSma200)}</span>`, ''],
    ['Hacim / 20g ort.', fmt.x(s.volRatio), s.volRatio >= 2 ? '<span class="chip warn">Hacim patlaması</span>' : ''],
    ['Ort. işlem hacmi', fmt.vol(s.turnover) + ' ₺', ''],
    ['Volatilite (yıllık)', fmt.pctPlain(s.volat), ''],
    ['Beta', fmt.num2(s.beta), ''],
    ['Stoch RSI %K', fmt.num(s.stochK), s.stochK < 20 ? '<span class="chip up">Dipte</span>' : s.stochK > 80 ? '<span class="chip down">Tepede</span>' : ''],
    ['Fisher', fmt.num2(s.fisher), s.fisherCross === 'up' ? '<span class="chip up">Al kesişimi</span>' : s.fisherCross === 'down' ? '<span class="chip down">Sat kesişimi</span>' : ''],
    ['Supertrend', `<span class="${cls(s.stDist)}">${fmt.pct(s.stDist)}</span>`, s.stTrend ? `<span class="chip ${ST[s.stTrend][1]}">${ST[s.stTrend][0]}${s.stFlip ? ' · yeni' : ''}</span>` : ''],
    ['Ichimoku', '', s.ichi ? `<span class="chip ${ICHI[s.ichi][1]}">${ICHI[s.ichi][0]}</span>` : '—'],
    ['VWMA20 farkı', `<span class="${cls(s.vsVwma20)}">${fmt.pct(s.vsVwma20)}</span>`, ''],
    ['ATR 14', fmt.pctPlain(s.atrPct), ok(s.atrPct) && ok(s.last) ? `<span class="muted num">≈ ${fmt.price(s.atrPct * s.last)} ₺</span>` : ''],
  ];
  const hasSr = !isIdx && !!((s.srRes || []).length + (s.srSup || []).length);
  const tabs = [['genel', 'Genel'], ...(hasSr ? [['sr', 'Destek / direnç']] : []), ...(isIdx ? [] : [['temettu', 'Temettü'], ['temel', 'Temel ve değerleme']]),
    ...(peers.length > 1 ? [['sektor', `Sektör <span class="n">${peers.length}</span>`]] : [])];
  const tab = tabs.some(([k]) => k === state.dtab) ? state.dtab : 'genel';
  const fundRows = [
    ['Piyasa değeri', 'mcap', x => fmt.big(x) + ' ₺'], ['F/K', 'pe'], ['PD/DD', 'pb'], ['FD/FAVÖK', 'evEbitda'],
    ['Net marj', 'netMargin'], ['ÖK kârlılığı', 'roe'], ['Borç / ÖK', 'de'], ['Satış büyümesi', 'revGrowth'], ['Kâr büyümesi', 'epsGrowth'], [`Temettü verimi (${DIV_Y})`, 'divYield'], ['Dağıtma oranı', 'payout'], ['Halka açıklık', 'freeFloat'],
  ];

  view.innerHTML = `
  <section class="dhead">
    <a class="back" href="#/">← Tarama</a>
    <div>
      <h1>${isIdx ? '' : `<button type="button" class="star" data-star="${t}" aria-pressed="${starred}" aria-label="İzleme listesi">★</button>`}${esc(t)}${tedbirIcon(s)}</h1>
      <p class="sub">${isIdx ? '' : tierChip(s, true) + ' '}${esc(s.name || '')}${s.sector ? ' · ' + esc(s.sector) : ''}${s.industry ? ' · ' + esc(s.industry) : ''}</p>
    </div>
    <div class="px"><span class="price">${fmt.price(s.last)}${isIdx ? '' : ' ₺'}</span><span class="chg ${cls(s.chg1d)}">${fmt.pct(s.chg1d)}</span><span class="date">${fmt.date(s.date)} kapanış</span></div>
    ${isIdx ? '' : `<div class="row"><button type="button" class="btn" data-cmpadd="${t}">${state.compare.includes(t) ? '⇆ Karşılaştırmada' : '⇆ Karşılaştır'}</button><button type="button" class="btn" data-pfaddsym="${t}">+ Portföye ekle${state.portfolio.some(p => p.sym === t) ? ' <span class="chip up">var</span>' : ''}</button></div>`}
  </section>

  <div class="chartwrap" id="chartWrap">
  <div class="chartbar">
    <div class="seg" role="group" aria-label="Zaman aralığı">${Object.keys(RANGES).map(r => `<button type="button" data-range="${r}" aria-pressed="${state.chart.range === r}">${r}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Fiyat ölçeği">${[['lin', 'Doğrusal', 'Doğrusal fiyat ölçeği'], ['log', 'Log', 'Logaritmik ölçek: oransal hareketler eşit görünür'], ['pct', '%', 'Ekrandaki ilk muma göre yüzde değişim']].map(([k, l, t]) => `<button type="button" data-cscale="${k}" aria-pressed="${state.chart.scale === k}" title="${t}">${l}</button>`).join('')}</div>
    <details class="dd" id="indMenu"><summary class="btn">Göstergeler ▾</summary>
      <div class="dd-panel">
        <div class="ms-grp">Grafik üzerinde</div>
        <div class="dd-grid">${OVERLAYS.map(([k, l, c]) => `<button type="button" class="tg" data-tg="${k}" aria-pressed="${!!state.chart[k]}"><i style="--c:var(${c})"></i>${l}</button>`).join('')}</div>
        <div class="ms-grp">Alt paneller</div>
        <div class="dd-grid">${PANES.map(([k, l]) => `<button type="button" class="tg" data-tg="${k}" aria-pressed="${!!state.chart[k]}">${l}</button>`).join('')}</div>
        <div class="ms-grp">Görünüm</div>
        <div class="dd-grid">
          <button type="button" class="tg" data-tg="vol" aria-pressed="${state.chart.vol !== false}" title="Hacim çubuklarını göster/gizle">Hacim</button>
          <button type="button" class="tg" data-tg="magnet" aria-pressed="${!!state.chart.magnet}" title="İmleç mumların açılış/yüksek/düşük/kapanış değerlerine yapışsın">🧲 Mıknatıs</button>
        </div>
      </div>
    </details>
    <div class="toggles" id="indChips">${indChips()}</div>
    <div class="toggles cview">
      <button type="button" class="tg" data-cview="reset" title="Kaydırma ve yakınlaştırmayı sıfırla (seçili aralık + otomatik ölçek)" aria-label="Sıfırla">↺</button>
      <button type="button" class="tg" data-cview="full" title="Tam ekran (Esc ile çık)" aria-label="Tam ekran">⤢</button>
    </div>
  </div>
  <div class="charts">
    <div class="legend" id="legend"></div>
    <div class="c-main" id="cMain"></div>
    ${PANES.map(([k, , title]) => `<div class="c-sub" id="pane-${k}"${state.chart[k] ? '' : ' hidden'}><span class="lbl">${title}</span></div>`).join('')}
    <button type="button" class="fullclose" data-cview="full" aria-label="Tam ekrandan çık">✕</button>
  </div>
  <div class="charthint">${info('Kaydırmak için sürükleyin, yakınlaştırmak için tekerlek ya da iki parmak. Fiyat ölçeği: sağdaki fiyat ekseninin üzerinde tekerlek ya da eksene basılı tutup yukarı/aşağı sürükleme; sonra grafik serbestçe yukarı/aşağı da kaydırılır. Eksene çift tıklama ya da ↺ otomatik ölçeğe döner.', 'Grafik nasıl kullanılır?')}</div>
  </div>

  ${(s.sig || []).map(g => `<p class="note-ok sigline">Aktif sinyal: <b>${esc(g.n || SIG_NAMES[g.k] || g.k)}</b> · ${g.tf === '4H' ? '4 saatlik' : 'günlük'} (${g.d.includes(' ') ? fmt.date(g.d.split(' ')[0]) + ' ' + g.d.split(' ')[1] : fmt.date(g.d)}) · giriş ${fmt.price(g.e)} · ${g.armed ? `takip stopu ${fmt.price(g.s)}` : g.xl ? `stop ${fmt.price(g.s)}${g.xl > g.s ? ` · kapanış ${fmt.price(g.xl)} altına inerse çıkış` : ' · kapanış son 10 günün en düşüğünün altına inerse çıkış'}` : `stop ${fmt.price(g.s)}${g.a ? ` · +1R'de (${fmt.price(g.a)}) takip başlar` : ''}`}
    · giriş sinyal günü kapanışında, pozisyon açık · <a href="#/sinyal">Sinyaller</a></p>`).join('')}
  ${tabs.length > 1 ? `<nav class="dtabs" role="tablist" aria-label="Hisse bölümleri">${tabs.map(([k, l]) => `<button type="button" role="tab" data-dtab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</nav>` : ''}
  <div class="dpane" data-pane="genel"${tab === 'genel' ? '' : ' hidden'}>
  <div class="panels two">
    <section class="panel">
      <h2>Getiriler</h2>
      <div class="rets">${rets.map(([l, k]) => `<div class="ret"><span>${l}</span><b class="${cls(s[k])}">${fmt.pct(s[k])}</b></div>`).join('')}</div>
      <div class="range52">
        <div class="muted" style="font-size:12px">52 haftalık aralık · zirveye ${fmt.pct(s.distHi52)}</div>
        <div class="bar">${pos52 != null ? `<span class="dot" style="left:${Math.min(100, Math.max(0, pos52))}%"></span>` : ''}</div>
        <div class="ends"><span>${fmt.price(s.lo52)}</span><span>${fmt.price(s.hi52)}</span></div>
      </div>
    </section>
    <section class="panel">
      <h2>Teknik görünüm</h2>
      <dl class="kv">${tech.map(([l, v, n]) => `<dt>${l}</dt><dd>${v}</dd><dd class="note">${n}</dd>`).join('')}</dl>
    </section>
  </div>
  </div>
  ${isIdx ? '' : `<div class="dpane" data-pane="sr"${tab === 'sr' ? '' : ' hidden'}>${srPanelHtml(s)}</div>
  <div class="dpane" data-pane="temettu"${tab === 'temettu' ? '' : ' hidden'}>
    <section class="panel" id="divPanel"><h2>Temettü geçmişi</h2><p class="muted">Yükleniyor…</p></section>
    <section class="panel" id="qualPanel"><h2>Temettü güvenliği ve finansal kalite</h2><p class="muted">Yükleniyor…</p></section>
  </div>
  <div class="dpane" data-pane="temel"${tab === 'temel' ? '' : ' hidden'}>
    <section class="panel">
      <h2>Temel veriler</h2>
      
      <dl class="kv">
        <dt class="colhead"></dt><dd class="colhead">${esc(t)}</dd><dd class="colhead note">Sektör medyanı</dd>
        ${fundRows.map(([l, k, f]) => {
          const fd = FIELDS[k], fn = f || fd.f;
          return `<dt>${l}</dt><dd class="${fd.color ? cls(s[k]) : ''}">${fn(s[k])}</dd><dd class="note num">${fn(med[k])}</dd>`;
        }).join('')}
      </dl>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${s.period ? `Son bilanço: <b>${esc(s.period)}</b> · ` : 'Mali tablo bulunamadı · '}Gelir kalemleri son 12 ay. ${s.finGroup === 'UFRS' ? 'Banka/sigorta: satışa dayalı oranlar hesaplanmaz. ' : ''}Sektör: ${esc(s.sector || '—')} (${med.n || 0} hisse).</p>
    </section>
    <section class="panel" id="finPanel"><h2>Mali tablolar</h2><p class="muted">Yükleniyor…</p></section>
    <section class="panel" id="dcfPanel"><h2>DCF · indirgenmiş nakit akışı</h2><p class="muted">Yükleniyor…</p></section>
  </div>`}
  <div class="dpane" data-pane="sektor"${tab === 'sektor' ? '' : ' hidden'}>
  ${peers.length > 1 ? `<section class="panel peers"><h2>${esc(s.sector)} sektöründeki hisseler</h2>
    <div class="tablewrap">${tableHtml(sorted(peers), colsFor(state.view), { sortable: false, highlight: t })}</div></section>` : ''}
  </div>`;

  if (!isIdx) {
    (s.period || s.dsScore != null ? loadFin(t) : Promise.resolve(null)).then(j => {
      if (location.hash !== `#/h/${t}`) return;
      renderQualityPanel(s, j); renderFinPanel(s, j); renderDcfPanel(s, j);
    }).catch(() => { renderQualityPanel(s, null); renderFinPanel(s, null); renderDcfPanel(s, null); });
  }
  try {
    const h = await loadHist(t);
    if (location.hash !== `#/h/${t}`) return; // kullanıcı bu arada başka sayfaya geçti
    drawCharts(h);
    if (!isIdx) renderDivPanel(s, h);
  } catch (e) {
    $('#cMain').innerHTML = '<p class="empty">Grafik verisi yüklenemedi.</p>';
  }
}
export function renderDivPanel(s, h) {
  const el = $('#divPanel');
  if (!el) return;
  const div = (h.div || []).slice().reverse();
  if (!div.length && !s.divUpcoming?.length) { el.innerHTML = '<h2>Temettü geçmişi</h2><p class="muted">Son 5 yılda temettü ödemesi görünmüyor.</p>'; return; }
  const closeOn = new Map(h.d.map((d, i) => [d, h.c[i]]));
  // Ödeme günündeki (ya da hemen önceki işlem günündeki) kapanışa göre o günkü verim
  const pxAt = d => { if (closeOn.has(d)) return closeOn.get(d); const i = h.d.findIndex(x => x > d); return i > 0 ? h.c[i - 1] : null; };
  const byYear = {};
  const avgYear = {}; // yıl → dönem ortalama fiyatı verimleri toplamı (bir ödemesi hesaplanamayan yıl boş)
  for (const [d, a, , ya] of div) {
    const y = d.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + a;
    avgYear[y] = ya == null || avgYear[y] === null ? null : (avgYear[y] || 0) + ya;
  }
  const years = Object.keys(byYear).sort().reverse();
  const up = s.divUpcoming || [];
  const upHtml = up.length ? `<div class="upcoming"><b>Açıklanan temettü${up.length > 1 ? 'ler' : ''}</b>${up.map(u =>
      `<span class="chip ${u.date ? 'up' : 'warn'}">${u.date ? fmt.date(u.date) : 'Tarih bekleniyor'}</span> <span class="num">${fmt.price(u.net)} ₺ net</span> <span class="muted">(${fmt.pctPlain(u.net / s.last)})</span>`).join(' · ')}</div>` : '';
  el.innerHTML = `<h2>Temettü geçmişi</h2>
  ${upHtml}
  <div class="divgrid">
    <dl class="kv">
      <dt>${DIV_Y} verimi</dt><dd>${fmt.pctPlain(s.divYield)}</dd><dd class="note">${s.divCur ? fmt.price(s.divCur) + ' ₺' + (s.divFreq > 1 ? ` (${s.divFreq} ödeme)` : '') : 'henüz ödeme yok'}</dd>
      <dt>${DIV_Y - 1} verimi</dt><dd>${fmt.pctPlain(s.divYieldPrev)}</dd><dd class="note">${s.divPrev ? fmt.price(s.divPrev) + ' ₺' : '—'}</dd>
      <dt title="Her ödeme, önceki temettüden o temettüye kadarki ortalama kapanış fiyatına bölünür">Bağıl verim ${DIV_Y}</dt><dd>${fmt.pctPlain(s.divYieldAvg)}</dd><dd class="note">${DIV_Y - 1}: ${fmt.pctPlain(s.divYieldAvgPrev)}</dd>
      <dt>Son 5 yıl</dt><dd>${FIELDS.divYears5.f(s.divYears5)}</dd><dd class="note">${s.divStreak ? s.divStreak + ' yıldır kesintisiz' : ''}</dd>
      <dt>5 yıllık ort. verim</dt><dd>${fmt.pctPlain(s.divAvg5)}</dd><dd class="note"></dd>
      <dt>Temettü değişimi</dt><dd class="${cls(s.divGrowth)}">${fmt.pct(s.divGrowth)}</dd><dd class="note">${DIV_Y} / ${DIV_Y - 1}</dd>
      <dt>Dağıtma oranı</dt><dd>${fmt.pctPlain(s.payout)}</dd><dd class="note">${s.payout != null ? 'temettü / net kâr' : ''}</dd>
    </dl>
    <div class="tablewrap flat"><table class="grid"><thead><tr><th class="tk">Tarih</th><th>Hisse başı ₺</th><th title="Ödeme günündeki (temettü düşülmeden önceki) kapanışa göre verim">O gün</th><th title="Önceki temettüden bu temettüye kadarki ortalama kapanış fiyatına göre bağıl verim (ilk temettüde son 1 yıl)">Bağıl</th><th title="Bugünkü fiyata göre verim">Bugün</th></tr></thead><tbody>
      ${div.slice(0, 12).map(([d, a, y, ya]) => { const p = pxAt(d); const yy = y ?? (p ? a / p : null); return `<tr><td class="tk">${fmt.date(d)}</td><td>${fmt.price(a)}</td><td>${fmt.pctPlain(yy)}</td><td>${fmt.pctPlain(ya)}</td><td>${fmt.pctPlain(a / s.last)}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="tablewrap flat"><table class="grid"><thead><tr><th class="tk">Yıl</th><th>Toplam ₺</th><th title="Yıl içindeki her ödemenin dönem ortalama fiyatına göre veriminin toplamı">Bağıl</th><th title="Bugünkü fiyata göre verim">Bugün</th></tr></thead><tbody>
      ${years.map(y => `<tr><td class="tk">${y}</td><td>${fmt.price(byYear[y])}</td><td>${fmt.pctPlain(avgYear[y])}</td><td>${fmt.pctPlain(byYear[y] / s.last)}</td></tr>`).join('')}
    </tbody></table></div>
  </div>
  ${info(`Verim: <b>O gün</b> ödeme günündeki fiyata, <b>Bağıl</b> önceki temettüden bu temettüye kadarki ortalama kapanış fiyatına (ilk temettüde son 1 yıl), <b>Bugün</b> güncel fiyata göre. Geçmiş ödemeler brüt, bedelsiz sermaye artırımlarına göre düzeltilmiş (temettuhisseleri.com ve Yahoo Finance karşılaştırılarak); tarih, hak kullanım tarihidir. Açıklanan temettüler stopaj sonrası net tutardır (temettuhisseleri.com).`, 'Verim nasıl hesaplanır?')}`;
}
export function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
export function drawCharts(h) {
  destroyCharts();
  const LWC = window.LightweightCharts;
  if (!LWC) return;
  const C = state.chart;
  const subs = PANES.map(([k]) => k).filter(k => C[k]);
  const base = (bottom) => ({
    autoSize: true,
    layout: { background: { type: 'solid', color: css('--surface') }, textColor: css('--muted'), fontFamily: css('--mono'), fontSize: 11 },
    grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
    rightPriceScale: { borderColor: css('--line'), minimumWidth: 72 },
    timeScale: { borderColor: css('--line'), visible: bottom, rightOffset: 3 },
    crosshair: { mode: C.magnet ? 1 : 0 },
    localization: { locale: 'tr-TR', priceFormatter: p => (Math.abs(p) < 1 ? F4 : F2).format(p) },
    handleScale: { axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
  });
  const up = css('--up'), down = css('--down');
  const T = h.d;
  const line = arr => T.map((time, i) => arr[i] == null ? { time } : { time, value: arr[i] });

  // Ana grafik: mum + hacim + hareketli ortalamalar
  const main = LWC.createChart($('#cMain'), base(subs.length === 0));
  charts.push(main);
  const candle = main.addCandlestickSeries({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down, priceLineVisible: false });
  candle.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
  candle.setData(T.map((time, i) => ({ time, open: h.o[i], high: h.h[i], low: h.l[i], close: h.c[i] })));
  candle.priceScale().applyOptions({ mode: { lin: 0, log: 1, pct: 2 }[C.scale] ?? 0 });
  // Aktif sinyal: giriş / stop / hedef çizgileri
  const sigT = decodeURIComponent(location.hash.slice(4)).toUpperCase();
  for (const g of BY.get(sigT)?.sig || []) {
    const line = (price, color, title) => candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });
    const tf = g.tf === '4H' ? ' (4S)' : '';
    const sigs = BY.get(sigT).sig, nm = sigs.length > 1 ? (g.n || SIG_NAMES[g.k] || '') + ' · ' : '';
    line(g.e, css('--accent'), nm + 'Giriş' + tf); line(g.s, css('--down'), (g.armed ? 'Takip stopu' : 'Stop') + tf);
    if (!g.armed && g.a) line(g.a, css('--up'), '+1R takip başlar' + tf);
    if (g.xl > g.s) line(g.xl, css('--warn'), nm + 'Kanal çıkışı (kapanış)' + tf);
  }
  if (C.vol !== false) {
    const vol = main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(T.map((time, i) => ({ time, value: h.v[i], color: (h.c[i] >= h.o[i] ? up : down) + '55' })));
  } else candle.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.06 } });

  const ma = {};
  const addLine = (arr, color, width = 1.5, style = 0) => {
    const sr = main.addLineSeries({ color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    sr.setData(line(arr));
    return arr;
  };
  if (C.sma20) ma.sma20 = addLine(sma(h.c, 20), css('--c-sma20'));
  if (C.sma50) ma.sma50 = addLine(sma(h.c, 50), css('--c-sma50'));
  if (C.sma200) ma.sma200 = addLine(sma(h.c, 200), css('--c-sma200'));
  if (C.bb) {
    const bb = bollinger(h.c);
    addLine(bb.upper, css('--c-bb'), 1, 2); addLine(bb.lower, css('--c-bb'), 1, 2); addLine(bb.mid, css('--c-bb'), 1, 1);
  }
  if (C.vwma) ma.vwma = addLine(vwma(h.c, h.v, 20), css('--c-vwma'));
  const cur = BY.get(location.hash.slice(4));
  if (C.sr && cur) {
    // Confluence bölgeleri: orta çizgi (kalınlık = güç) + noktalı kenarlar
    const zone = (z, color, label) => {
      candle.createPriceLine({ price: z.m, color, lineWidth: srWidth(z), lineStyle: 0, axisLabelVisible: true, title: `${label} · ${z.n}×` });
      if (z.hi - z.lo > 0) for (const x of [z.lo, z.hi]) candle.createPriceLine({ price: x, color: color + '88', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });
    };
    (cur.srSup || []).forEach((z, i) => zone(z, up, `D${i + 1}`));
    (cur.srRes || []).forEach((z, i) => zone(z, down, `R${i + 1}`));
  }
  if (C.ichi) {
    const ic = ichimoku(h.h, h.l);
    addLine(ic.tenkan, css('--c-ichi'), 1);
    addLine(ic.kijun, css('--c-sma50'), 1);
    addLine(ic.spanA, up + 'aa', 1, 2);
    addLine(ic.spanB, down + 'aa', 1, 2);
  }
  let stLine = null;
  if (C.st) {
    const st = supertrend(h.h, h.l, h.c);
    stLine = st.line;
    // Tek seri, nokta bazında renk: yön değiştiği gündeki geçiş çizgisi görünmez yapılır
    const sr = main.addLineSeries({ lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    sr.setData(T.map((time, i) => {
      if (st.line[i] == null) return { time };
      const flip = i > 0 && st.trend[i - 1] != null && st.trend[i - 1] !== st.trend[i];
      return { time, value: st.line[i], color: flip ? 'rgba(0,0,0,0)' : st.trend[i] === 1 ? up : down };
    }));
  }

  // Alt paneller
  const sub = (k, build) => {
    if (!C[k]) return;
    const c = LWC.createChart($(`#pane-${k}`), base(subs.at(-1) === k));
    charts.push(c);
    const L = (arr, color, opts = {}) => {
      const sr = c.addLineSeries({ color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: !!opts.last, crosshairMarkerVisible: false });
      sr.setData(line(arr));
      for (const p of opts.levels || []) sr.createPriceLine({ price: p, color: css('--muted'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      return sr;
    };
    build(c, L);
  };
  let rsiArr = null;
  sub('rsi', (c, L) => { rsiArr = rsi(h.c); L(rsiArr, css('--accent'), { last: 1, levels: [70, 30] }); });
  sub('stoch', (c, L) => { const s = stochRsi(h.c); L(s.k, css('--accent'), { last: 1, levels: [80, 20] }); L(s.d, css('--c-sma20')); });
  sub('macd', (c, L) => {
    const m = macd(h.c);
    c.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false })
      .setData(T.map((time, i) => ({ time, value: m.hist[i], color: (m.hist[i] >= 0 ? up : down) + '99' })));
    L(m.line, css('--c-sma50')); L(m.signal, css('--c-sma20'));
  });
  sub('fisher', (c, L) => { const f = fisher(h.h, h.l); L(f.fish, css('--accent'), { last: 1, levels: [0] }); L(f.trigger, css('--c-sma20')); });
  sub('atr', (c, L) => { L(atr(h.h, h.l, h.c, 14), css('--accent'), { last: 1 }); });

  // Panelleri zaman ekseninde eşitle
  let syncing = false;
  for (const src of charts) {
    src.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (!r || syncing) return;
      syncing = true;
      for (const o of charts) if (o !== src) o.timeScale().setVisibleLogicalRange(r);
      syncing = false;
    });
  }

  // Lejant (imleçteki gün, yoksa son gün)
  const idxOf = new Map(T.map((d, i) => [d, i]));
  const legend = $('#legend');
  const showLegend = i => {
    const parts = [`<span>${fmt.date(T[i])}</span>`,
      `<span>A <b>${fmt.price(h.o[i])}</b></span>`, `<span>Y <b>${fmt.price(h.h[i])}</b></span>`,
      `<span>D <b>${fmt.price(h.l[i])}</b></span>`, `<span>K <b class="${cls(h.c[i] - (h.c[i - 1] ?? h.c[i]))}">${fmt.price(h.c[i])}</b></span>`,
      `<span>Hacim <b>${fmt.vol(h.v[i])}</b></span>`];
    for (const [k, l, c] of OVERLAYS.slice(0, 4)) if (ma[k]?.[i] != null) parts.push(`<span style="color:var(${c})">${l} <b style="color:inherit">${fmt.price(ma[k][i])}</b></span>`);
    if (stLine?.[i] != null) parts.push(`<span>Supertrend <b>${fmt.price(stLine[i])}</b></span>`);
    if (rsiArr?.[i] != null) parts.push(`<span>RSI <b>${fmt.num(rsiArr[i])}</b></span>`);
    legend.innerHTML = parts.join('');
  };
  showLegend(T.length - 1);
  main.subscribeCrosshairMove(p => {
    const i = p?.time ? idxOf.get(typeof p.time === 'string' ? p.time : `${p.time.year}-${String(p.time.month).padStart(2, '0')}-${String(p.time.day).padStart(2, '0')}`) : undefined;
    showLegend(i ?? T.length - 1);
  });

  charts.forEach((c, i) => priceAxisGestures(i === 0 ? $('#cMain') : $(`#pane-${subs[i - 1]}`), c));
  setRange(state.chart.range, T);
}
/* Fiyat ekseninde serbest ölçekleme
   - Fare tekerleği sağdaki fiyat ekseninin üzerindeyken fiyat ölçeğini büyütür/küçültür (aşağı = uzaklaş, yukarı = yakınlaş).
     Kütüphane (4.x) fiyat aralığını koddan ayarlamaya izin vermediği için tekerlek hareketi, eksende yapılan kısa bir
     dikey sürüklemeye çevrilir; ölçekleme kütüphanenin kendi eksen sürüklemesiyle yapılır.
   - Telefonda eksene basılı tutup yukarı/aşağı sürüklemek ölçeği değiştirir; bu sırada sayfa kaymaz.
   Ölçek elle değiştirilince grafik gövdesi de serbestçe yukarı/aşağı kaydırılabilir. ↺ Sıfırla ya da eksene çift
   tıklama/dokunma otomatik ölçeğe döner. */
function priceAxisGestures(el, chart) {
  if (!el) return;
  const inAxis = x => { const r = el.getBoundingClientRect(); return x >= r.right - chart.priceScale('right').width(); };
  let acc = 0;
  el.addEventListener('wheel', e => {
    if (!inAxis(e.clientX)) return; // grafiğin üzerinde tekerlek: zaman ekseni yakınlaştırma (kütüphanenin kendi davranışı)
    e.preventDefault(); e.stopPropagation(); // kütüphanenin zaman yakınlaştırmasına ulaşmasın
    acc += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1) * 0.35;
    if (Math.abs(acc) < 8) return; // çok küçük adımlar birikir (tıklama/çift tıklama sanılmasın)
    const dy = Math.max(-60, Math.min(60, acc)), x = e.clientX, y = e.clientY;
    acc = 0;
    const fire = (type, yy) => e.target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: yy, screenX: x, screenY: yy, button: 0, buttons: type === 'mouseup' ? 0 : 1 }));
    fire('mousedown', y); fire('mousemove', y + dy / 2); fire('mousemove', y + dy); fire('mouseup', y + dy);
  }, { passive: false, capture: true });
  let axisTouch = false;
  el.addEventListener('touchstart', e => { axisTouch = e.touches.length === 1 && inAxis(e.touches[0].clientX); }, { passive: true });
  el.addEventListener('touchmove', e => { if (axisTouch && e.cancelable) e.preventDefault(); }, { passive: false });
  el.addEventListener('touchend', () => { axisTouch = false; }, { passive: true });
}
// Tam ekran: grafik ve araç çubuğu tüm ekranı kaplar (iOS dahil her tarayıcıda çalışan CSS yöntemi)
export function toggleFull(force) {
  const w = $('#chartWrap');
  if (!w) return;
  const on = force ?? !w.classList.contains('full');
  w.classList.toggle('full', on);
  document.body.classList.toggle('noscroll', on);
  w.querySelector('[data-cview="full"].tg')?.setAttribute('aria-pressed', on);
}
addEventListener('keydown', e => { if (e.key === 'Escape' && $('#chartWrap.full')) toggleFull(false); });
addEventListener('hashchange', () => { document.body.classList.remove('noscroll'); });
export function setRange(r, T) {
  const main = charts[0];
  if (!main) return;
  const last = new Date(T.at(-1) + 'T00:00:00Z');
  const from = new Date(last); from.setUTCMonth(from.getUTCMonth() - RANGES[r]);
  const fromS = from.toISOString().slice(0, 10);
  const i0 = fromS <= T[0] ? 0 : Math.max(0, T.findIndex(d => d >= fromS));
  const n = T.length - 1, bars = Math.max(n - i0, 10);
  main.timeScale().setVisibleLogicalRange({ from: i0 - 0.5, to: n + bars * RIGHT_SPACE / (1 - RIGHT_SPACE) });
}
