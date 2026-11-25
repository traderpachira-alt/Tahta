import { DATA, DIV_Y } from './data.js';
import { destroyCharts } from './detail.js';
import { $, view } from './dom.js';
import { FIELDS, SR_STRONG, ST } from './fields.js';
import { ASSETS, ASSET_CATS, PF_CATS, WALLETS, assetName, cashBal, divReceived, divReceivedExt, exitSignals, isAsset, isAssetCat, isCash, isCoin, isCrypto, netInvested, num, numDec, pendingDivs, pfCalc, pfQuote, pfRows, qtyFmt, rateAt, signed, tl, todayIso, trNum, unitOf, wFmt, walletBal } from './pfcore.js';
import { state, ui } from './store.js';
import { syncStatusHtml } from './sync.js';
import { tedbirIcon } from './tedbir.js';
import { F1, TREND, cls, esc, fmt, ok } from './util.js';

export const pfHist = new Set();
export function alertMsg(text) {
  const el = document.createElement('div'); el.className = 'updatebar'; el.textContent = text; el.setAttribute('role', 'alert');
  document.body.appendChild(el); setTimeout(() => el.remove(), 5000);
}
export function renderPortfolio() {
  destroyCharts();
  document.title = 'Portföy · Tahta';
  const all = pfRows(), rows = all.filter(r => r.open), closed = all.filter(r => !r.open && r.c.txs.length);
  const tot = rows.reduce((a, r) => ({ value: a.value + (r.value || 0), cost: a.cost + r.c.cost, day: a.day + (r.day || 0) }), { value: 0, cost: 0, day: 0 });
  const unreal = tot.value - tot.cost, realized = all.reduce((a, r) => a + r.c.realized, 0), inv = netInvested();
  const pend = pendingDivs(), pendNet = pend.reduce((a, x) => a + x.net, 0), ret = tot.value - inv + divReceivedExt();
  const divYear = rows.filter(r => r.s && !isAsset(r.p)).reduce((a, r) => a + (r.s.divCur || 0) * r.c.qty, 0);
  const byCat = Object.fromEntries(Object.keys(PF_CATS).map(c => [c, rows.filter(r => r.p.cat === c)]));
  const catVal = c => byCat[c].reduce((a, r) => a + (r.value || 0), 0);
  const share = r => tot.value ? (r.value || 0) / tot.value : null;

  const actions = r => `<td class="txt act">
    <button type="button" class="ic buy" data-pftx="buy:${r.p.id}" title="${isCash(r.p) ? 'Para yatır' : 'Alım ekle'}">${isCash(r.p) ? 'Yatır' : 'Al'}</button>
    <button type="button" class="ic sell" data-pftx="sell:${r.p.id}" title="${isCash(r.p) ? 'Para çek' : 'Satış ekle'}">${isCash(r.p) ? 'Çek' : 'Sat'}</button>
    <button type="button" class="ic" data-pfhist="${r.p.id}" aria-expanded="${pfHist.has(r.p.id)}" title="İşlem geçmişi">İşlemler <span class="muted">${r.c.txs.length}</span></button>
    <button type="button" class="ic" data-pfedit="${r.p.id}" aria-label="Kategori / not düzenle">✎</button>
    <button type="button" class="ic${ui.pfDelArmed === r.p.id ? ' armed' : ''}" data-pfdel="${r.p.id}" aria-label="Pozisyonu sil">${ui.pfDelArmed === r.p.id ? 'Sil?' : '×'}</button></td>`;
  const name = r => isAsset(r.p) ? `<span class="code">${assetName(r.p)}</span>` : `<span class="code">${r.p.sym}</span>${r.s ? tedbirIcon(r.s) : ' <span class="muted">(veri yok)</span>'}`;
  const note = r => r.p.note ? `<span class="nm">${esc(r.p.note)}</span>` : '';
  const common = r => `<td>${qtyFmt(r.c.qty, r.p)}</td><td>${fmt.price(r.c.avg)}</td><td>${r.q ? fmt.price(r.q.last) : '—'}</td><td>${r.value != null ? fmt.big(r.value) : '—'}</td>
    <td class="${cls(r.pl)}">${signed(r.pl)}</td><td class="${cls(r.plPct)}">${fmt.pct(r.plPct)}</td><td>${fmt.pctPlain(share(r))}</td>`;
  const commonHead = (q = 'Adet') => `<th>${q}</th><th title="Birim başına ortalama maliyet (₺), komisyon dahil">Ort. maliyet</th><th>Fiyat</th><th>Değer ₺</th><th>K/Z ₺</th><th>K/Z %</th><th title="Portföy içindeki payı">Pay</th>`;
  const histRow = (r, cols) => !pfHist.has(r.p.id) ? '' : `<tr class="txrow"><td colspan="${cols}">${txTable(r)}</td></tr>`;

  const tables = {
    temettu: list => `<table class="grid"><thead><tr><th class="tk">Hisse</th>${commonHead()}<th title="${DIV_Y} yılında ödenen temettü / güncel fiyat">${DIV_Y} verimi</th><th title="${DIV_Y} yılında ödenen temettü / ortalama maliyetiniz">Maliyete göre</th><th title="${DIV_Y} yılında ödenen hisse başı temettü × adet (brüt)">${DIV_Y} temettüsü ₺</th><th>Sıradaki temettü</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr data-t="${r.p.sym}"><td class="tk">${name(r)}${note(r)}</td>${common(r)}
        <td>${fmt.pctPlain(r.s?.divYield)}</td><td>${r.s?.divCur && r.c.avg ? fmt.pctPlain(r.s.divCur / r.c.avg) : '—'}</td><td>${r.s?.divCur ? fmt.big(r.s.divCur * r.c.qty) : '—'}</td>
        <td class="txt">${r.s?.divUpcoming?.length ? `${r.s.nextDivDate ? `<span class="chip up">${fmt.date(r.s.nextDivDate)}</span>` : '<span class="chip warn">Tarih bekleniyor</span>'} <span class="num">${fmt.big(r.s.nextDivNet * r.c.qty)} ₺ net</span>` : '<span class="muted">—</span>'}</td>${actions(r)}</tr>${histRow(r, 13)}`).join('')}
    </tbody></table>`,
    trend: list => `<table class="grid"><thead><tr><th class="tk">Hisse</th>${commonHead()}<th>Durum</th><th>Supertrend</th><th>Trend</th><th>RSI</th><th title="Supertrend çizgisi: olası stop seviyesi">ST stop</th><th title="En yakın major destek bölgesi (confluence) ve uzaklığı">Destek</th><th></th></tr></thead><tbody>
      ${list.map(r => {
        const s = r.s, sig = s ? exitSignals(s) : { strong: [], weak: [] };
        const status = !s ? '—' : sig.strong.length ? `<span class="chip down" title="${esc([...sig.strong, ...sig.weak].join(' · '))}">Çıkış sinyali</span> <small class="muted">${esc(sig.strong[0])}</small>`
          : sig.weak.length ? `<span class="chip warn" title="${esc(sig.weak.join(' · '))}">Dikkat</span> <small class="muted">${esc(sig.weak[0])}</small>` : '<span class="chip up">Trend sürüyor</span>';
        return `<tr data-t="${r.p.sym}" class="${sig.strong.length ? 'exit' : ''}"><td class="tk">${name(r)}${note(r)}</td>${common(r)}
          <td class="txt">${status}</td><td class="txt">${s?.stTrend ? `<span class="chip ${ST[s.stTrend][1]}">${ST[s.stTrend][0]}</span>` : '—'}</td>
          <td class="txt">${s?.trend ? `<span class="chip ${TREND[s.trend][1]}">${TREND[s.trend][0]}</span>` : '—'}</td><td>${fmt.num(s?.rsi)}</td>
          <td>${s && ok(s.stDist) ? fmt.price(s.last / (1 + s.stDist)) : '—'}</td><td>${s?.supLvl ? `${fmt.price(s.supLvl)} <small class="${s.supS >= SR_STRONG ? 'up' : 'muted'}">${FIELDS.supDist.f(s.supDist)} · skor ${F1.format(s.supS)}</small>` : '—'}</td>${actions(r)}</tr>${histRow(r, 15)}`;
      }).join('')}
    </tbody></table>`,
    kripto: list => `<table class="grid"><thead><tr><th class="tk">Varlık</th>${commonHead('Miktar')}<th>Fiyat $</th><th>Gün</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td class="tk">${name(r)}${note(r)}</td>${common(r)}<td>${fmt.price(DATA.assets?.[r.p.sym]?.usd)}</td><td class="${cls(r.q?.chg1d)}">${fmt.pct(r.q?.chg1d)}</td>${actions(r)}</tr>${histRow(r, 11)}`).join('')}
    </tbody></table>`,
    emtia: list => `<table class="grid"><thead><tr><th class="tk">Varlık</th>${commonHead('Miktar')}<th>Gün</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td class="tk">${name(r)}${note(r)}</td>${common(r)}<td class="${cls(r.q?.chg1d)}">${fmt.pct(r.q?.chg1d)}</td>${actions(r)}</tr>${histRow(r, 10)}`).join('')}
    </tbody></table>`,
  };

  view.innerHTML = `
  <section class="dhead">
    <div><h1>Portföy</h1><p class="sub" data-syncstatus>${syncStatusHtml()}</p></div>
    <div class="row"><button type="button" class="btn" data-cashflow="buy">± Para yatır / çek</button><button type="button" class="btn primary" data-pfadd="temettu">+ Varlık ekle</button></div>
  </section>
  ${ui.pfForm ? pfFormHtml() : ''}
  ${ui.txForm ? txFormHtml() : ''}
  ${pend.length ? divPendingHtml(pend) : ''}
  ${all.length ? `
  <div class="pfsum">
    <div class="ret"><span>Toplam değer</span><b>${fmt.big(tot.value)} ₺</b></div>
    <div class="ret"><span title="Emtia / İtibari'deki Türk lirası bakiyesi">Nakit (TL)</span><b>${tl(cashBal())}</b></div>
    <div class="ret"><span title="Dışarıdan yatırılan − dışarı çekilen para">Net yatırılan</span><b>${tl(inv)}</b></div>
    <div class="ret"><span title="Toplam değer − net yatırılan + portföy dışına alınan temettüler (gerçekleşen, açık K/Z ve onaylanan temettüler birlikte)">Toplam getiri</span><b class="${cls(ret)}">${signed(ret)} ₺ · ${fmt.pct(inv > 0 ? ret / inv : null)}</b></div>
    <div class="ret"><span title="Onaylanan temettülerin net toplamı">Alınan temettü</span><b>${tl(divReceived())}</b></div>
    ${pendNet > 0 ? `<div class="ret pendcard"><span title="Hak kullanımı gerçekleşmiş, onayınızı bekleyen temettüler (tahmini net)">Bekleyen temettü</span><b>${tl(pendNet)}</b></div>` : ''}
    <div class="ret"><span title="Açık pozisyonların ortalama maliyet × adet toplamı">Maliyet</span><b>${fmt.big(tot.cost)} ₺</b></div>
    <div class="ret"><span title="Elde tutulan varlıkların kâr/zararı">Açık K/Z</span><b class="${cls(unreal)}">${signed(unreal)} ₺ · ${fmt.pct(tot.cost ? unreal / tot.cost : null)}</b></div>
    <div class="ret"><span title="Satışlardan gerçekleşen kâr/zarar (ortalama maliyet yöntemi, komisyon dahil)">Gerçekleşen K/Z</span><b class="${cls(realized)}">${signed(realized)} ₺</b></div>
    <div class="ret"><span>Bugün</span><b class="${cls(tot.day)}">${signed(tot.day)} ₺ · ${fmt.pct(tot.value - tot.day ? tot.day / (tot.value - tot.day) : null)}</b></div>
    <div class="ret"><span title="Hisselerin ${DIV_Y} yılında ödediği temettü × bugünkü adet (brüt)">${DIV_Y} temettüsü</span><b>${fmt.big(divYear)} ₺ · ${fmt.pctPlain(tot.value ? divYear / tot.value : null)}</b></div>
  </div>
  ${tot.value ? `<div class="alloc" aria-label="Kategori dağılımı">
    <div class="bar">${Object.entries(PF_CATS).map(([c, d]) => { const v = catVal(c); return v > 0 ? `<i style="width:${v / tot.value * 100}%;background:var(${d.color})" title="${d.label}"></i>` : ''; }).join('')}</div>
    <div class="legend2">${Object.entries(PF_CATS).filter(([c]) => catVal(c) > 0).map(([c, d]) => `<span><i style="background:var(${d.color})"></i>${d.label} <b class="num">${fmt.pctPlain(catVal(c) / tot.value)}</b> <span class="muted num">${fmt.big(catVal(c))} ₺</span></span>`).join('')}</div>
  </div>` : ''}` : ui.pfForm || ui.txForm ? '' : `<section class="panel pfempty">
    <h2>Portföyünüz boş</h2>
    <ol class="steps">
      <li><b>+ Varlık ekle</b> ile hisse, altın/döviz ya da kripto ekleyin; alım tarihini, adedi ve fiyatı girin. Bir hisse sayfasındaki <b>+ Portföye ekle</b> düğmesi de aynı formu açar.</li>
      <li>İsterseniz <b>± Para yatır / çek</b> ile TL bakiyesi tutun; alımlar bu bakiyeden ödenir, satışlar bakiyeye eklenir ve toplam getiri buna göre hesaplanır.</li>
      <li>Değer, kâr/zarar ve temettüler her veri güncellemesinde kendiliğinden hesaplanır; temettü ödendiğinde onayınız istenir.</li>
    </ol>
    <p class="muted" style="font-size:12px;margin:0">Kayıtlar yalnızca bu cihazda saklanır. Daha önce yedek aldıysanız ya da başka bir cihazda portföyünüz varsa <a href="#/aktar">⚙ Ayarlar ve yedek</a> sayfasından getirebilirsiniz.</p>
  </section>`}
  ${Object.entries(PF_CATS).filter(([c]) => byCat[c].length).map(([c, d]) => `
  <section class="panel pfcat">
    <h2><i style="background:var(${d.color})"></i>${d.label} <span class="muted">· ${byCat[c].length} varlık · ${fmt.big(catVal(c))} ₺</span>
      <button type="button" class="btn ghost" data-pfadd="${c}">+ Ekle</button></h2>
    <div class="tablewrap flat">${tables[c](byCat[c].sort((a, b) => (b.value || 0) - (a.value || 0)))}</div>
  </section>`).join('')}
  ${closed.length ? `
  <section class="panel pfcat">
    <h2>Kapanan pozisyonlar <span class="muted">· tamamı satılanlar</span></h2>
    <div class="tablewrap flat"><table class="grid"><thead><tr><th class="tk">Varlık</th><th>Kategori</th><th>Alınan</th><th>Satılan</th><th>Gerçekleşen K/Z ₺</th><th>Son satış</th><th></th></tr></thead><tbody>
      ${closed.map(r => `<tr${isAsset(r.p) ? '' : ` data-t="${r.p.sym}"`}><td class="tk"><span class="code">${assetName(r.p)}</span>${note(r)}</td><td class="txt">${PF_CATS[r.p.cat].label}</td>
        <td>${qtyFmt(r.c.bought, r.p)}</td><td>${qtyFmt(r.c.sold, r.p)}</td><td class="${cls(r.c.realized)}">${signed(r.c.realized)}</td><td>${fmt.date(r.c.lastSell)}</td>
        <td class="txt act"><button type="button" class="ic buy" data-pftx="buy:${r.p.id}" title="Yeniden al">Al</button>
          <button type="button" class="ic" data-pfhist="${r.p.id}" aria-expanded="${pfHist.has(r.p.id)}">İşlemler <span class="muted">${r.c.txs.length}</span></button>
          <button type="button" class="ic${ui.pfDelArmed === r.p.id ? ' armed' : ''}" data-pfdel="${r.p.id}" aria-label="Sil">${ui.pfDelArmed === r.p.id ? 'Sil?' : '×'}</button></td></tr>${histRow(r, 7)}`).join('')}
    </tbody></table></div>
  </section>` : ''}
  <p class="muted" style="font-size:12px">Fiyatlar gecikmelidir. Gerçekleşen K/Z ortalama maliyet yöntemiyle hesaplanır; temettüler dahil değildir. Altın ve gümüş gram fiyatı uluslararası ons fiyatı × dolar kurundan hesaplanır; Kapalıçarşı ve banka fiyatlarından farklı olabilir.</p>`;
}
export const txLabel = (p, t) => t.kind === 'div' ? 'Temettü' : t.src ? (t.type === 'buy' ? 'Satış geliri' : 'Alım ödemesi') : isCash(p) ? (t.type === 'buy' ? 'Yatırma' : 'Çekme') : (t.type === 'buy' ? 'Alım' : 'Satış');
export function txFlowNote(p, t) {
  if (t.src) { const sp = state.portfolio.find(x => x.id === t.src); return sp ? ` <small class="muted">${esc(assetName(sp))}${t.price !== 1 ? ` · kur ${fmt.price(t.price)} ₺` : ''}</small>` : ''; }
  const q = t.q ? ` · ${fmt.price(t.q.price)} ${t.q.cur}${t.q.fee ? ` + ${fmt.price(t.q.fee)} kom.` : ''}` : '';
  const w = WALLETS[t.flow];
  return w ? ` <small class="muted">${t.type === 'buy' ? `${w.label}'den` : `→ ${w.label}`}${q}</small>` : q ? ` <small class="muted">dışarıdan${q}</small>` : '';
}
export function divPendingHtml(pend) {
  return `<section class="panel divpend" id="divPend">
    <h2>Temettü ödemesi tespit edildi <span class="muted">· ${pend.length} ödeme onayınızı bekliyor</span></h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">Şirket bu tarihte hak kullanımını gerçekleştirdi. Adet, hak kullanımından önceki gün sonunda elinizde olan miktardır.
      Net tutar %15 stopajla tahmin edildi (GYO ve yatırım ortaklıklarında stopajsız); hesabınıza geçen tutarı kontrol edip onaylayın.</p>
    <div class="tablewrap flat"><table class="grid"><thead><tr><th class="tk">Hisse</th><th>Hak kullanım</th><th>Adet</th><th>Hisse başı brüt ₺</th><th>Brüt ₺</th><th>Hesaba geçen net ₺</th><th>Nereye</th><th></th></tr></thead><tbody>
      ${pend.map(x => { const k = `${x.p.id}|${x.date}`; return `<tr data-divkey="${k}"><td class="tk"><span class="code">${x.p.sym}</span><span class="nm">${PF_CATS[x.p.cat].label}</span></td>
        <td>${fmt.date(x.date)}</td><td>${qtyFmt(x.qty)}</td><td>${fmt.price(x.per)}</td><td>${fmt.price(x.gross)}</td>
        <td><input class="divnet" inputmode="decimal" value="${trNum(Math.round(x.net * 100) / 100)}" aria-label="${x.p.sym} net tutar"></td>
        <td class="txt"><select class="divflow btn"><option value="cash">TL bakiyeye ekle</option><option value="ext">Portföy dışına</option></select></td>
        <td class="txt act"><button type="button" class="ic buy" data-divok="${k}">Aldım, kaydet</button> <button type="button" class="ic" data-divno="${k}" title="Bu ödeme hesabıma geçmedi">Almadım</button></td></tr>`; }).join('')}
    </tbody></table></div>
  </section>`;
}
export function txTable(r) {
  const u = unitOf(r.p);
  // Her satışın o anki gerçekleşen K/Z'si için sırayla yeniden hesapla
  let qty = 0, cost = 0;
  const lines = r.c.txs.map(t => {
    let res = null;
    if (t.type === 'buy') { qty += t.qty; cost += t.qty * t.price + (t.fee || 0); }
    else { const q = Math.min(t.qty, qty), avg = qty ? cost / qty : 0; res = q * t.price - (t.fee || 0) - q * avg; cost -= q * avg; qty -= q; }
    return { t, res, after: qty };
  });
  return `<div class="txbox"><table class="grid mini"><thead><tr><th class="tk">Tarih</th><th>İşlem</th><th>Miktar</th><th>Fiyat ₺</th><th>Komisyon ₺</th><th>Tutar ₺</th><th title="Satışta gerçekleşen kâr/zarar">K/Z ₺</th><th>Sonra elde</th><th></th></tr></thead><tbody>
    ${lines.slice().reverse().map(({ t, res, after }) => `<tr><td class="tk">${t.date ? fmt.date(t.date) : '<span class="muted">tarihsiz</span>'}</td>
      <td class="txt"><span class="chip ${t.type === 'buy' ? 'up' : 'down'}">${txLabel(r.p, t)}</span>${txFlowNote(r.p, t)}</td>
      <td>${qtyFmt(t.qty, r.p)} <span class="muted">${u}</span></td><td>${fmt.price(t.price)}</td><td>${t.fee ? fmt.price(t.fee) : '—'}</td><td>${fmt.big(t.qty * t.price)}</td>
      <td class="${cls(res)}">${res == null ? '—' : signed(res)}</td><td>${qtyFmt(after, r.p)}</td>
      <td class="txt act">${t.src && t.kind !== 'div' ? '<span class="muted" title="Otomatik oluştu; kaynak işlemi silin">🔗</span>' : `<button type="button" class="ic${ui.pfDelArmed === t.id ? ' armed' : ''}" data-txdel="${r.p.id}:${t.id}" aria-label="İşlemi sil">${ui.pfDelArmed === t.id ? 'Sil?' : '×'}</button>`}</td></tr>`).join('')}
  </tbody></table>${divRows(r)}</div>`;
}
export function divRows(r) {
  const ds = Object.entries(r.p.divs || {}).sort((a, b) => a[0] < b[0] ? 1 : -1);
  if (!ds.length) return '';
  return `<table class="grid mini" style="margin-top:8px"><thead><tr><th class="tk">Hak kullanım</th><th>Temettü</th><th>Net ₺</th><th>Nereye</th><th></th></tr></thead><tbody>
    ${ds.map(([d, x]) => `<tr><td class="tk">${fmt.date(d)}</td><td class="txt">${x.status === 'received' ? '<span class="chip up">Alındı</span>' : '<span class="chip">Yoksayıldı</span>'}</td>
      <td>${x.status === 'received' ? fmt.price(x.net) : '—'}</td><td class="txt">${x.status !== 'received' ? '—' : x.flow === 'cash' ? 'TL bakiye' : 'Portföy dışı'}</td>
      <td class="txt act"><button type="button" class="ic" data-divundo="${r.p.id}|${d}" title="Geri al: yeniden onay bekler">Geri al</button></td></tr>`).join('')}
  </tbody></table>`;
}
// Para akışı seçenekleri: BTC/ETH/SOL/BNB → USDT/USDC; diğerleri → TL
export const coinSym = f => isCoin({ cat: f.cat, sym: f.sym });
export function flowSelect(id, sym, sell, flow) {
  const coin = isCoin({ cat: 'kripto', sym }), opts = coin
    ? (sell ? [['USDT', 'USDT bakiyeye ekle'], ['USDC', 'USDC bakiyeye ekle'], ['ext', 'Portföy dışına']]
            : [['USDT', `USDT bakiyeden (${wFmt('USDT', walletBal('USDT'))})`], ['USDC', `USDC bakiyeden (${wFmt('USDC', walletBal('USDC'))})`], ['ext', 'Dışarıdan (elimde zaten var / başka yerden)']])
    : (sell ? [['cash', 'TL bakiyeye ekle'], ['ext', 'Portföy dışına (çekildi)']]
            : [['cash', `TL bakiyeden (${tl(cashBal())})`], ['ext', 'Dışarıdan (yeni para)']]);
  const cur = opts.some(o => o[0] === flow) ? flow : opts[0][0];
  return `<label>${sell ? 'Satış geliri' : coin ? 'Ödeme' : 'Para nereden?'}<select id="${id}" class="btn">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
}
export const defaultFlow = (sym, sell) => isCoin({ cat: 'kripto', sym })
  ? (walletBal('USDT') > 0 || walletBal('USDC') <= 0 ? 'USDT' : 'USDC')
  : (sell || cashBal() > 0 ? 'cash' : 'ext');
export const usdPrice = sym => { const u = DATA.assets?.[sym]?.usd; return u ? trNum(u) : ''; };
export function pfFormHtml() {
  const f = ui.pfForm, asset = isAssetCat(f.cat), edit = !!f.id;
  const cats = edit ? (asset ? [] : Object.entries(PF_CATS).filter(([c]) => !isAssetCat(c))) : Object.entries(PF_CATS);
  return `<form class="panel pfform" id="pfForm">
    <h2>${edit ? `${esc(assetName(f))} · kategori ve not` : 'Varlık ekle'}</h2>
    ${cats.length > 1 ? `<div class="seg" role="radiogroup" aria-label="Kategori">${cats.map(([c, d]) => `<button type="button" data-pfcat="${c}" aria-pressed="${f.cat === c}" title="${esc(d.hint)}">${d.label}</button>`).join('')}</div>
    <p class="muted" style="font-size:12px;margin:0">${esc(PF_CATS[f.cat].hint)}</p>` : ''}
    <div class="pfgrid">
      ${edit ? '' : asset
        ? `<label>Varlık<select id="pfSym" class="btn">${ASSET_CATS[f.cat].map(k => [k, ASSETS[k]]).map(([k, a]) => `<option value="${k}"${k === f.sym ? ' selected' : ''}>${a.name}</option>`).join('')}</select></label>`
        : `<label>Hisse kodu<input id="pfSym" list="tickerList" value="${esc(f.sym || '')}" placeholder="ör. TUPRS" autocapitalize="characters" autocomplete="off" required></label>`}
      ${edit ? '' : `<label>${asset ? (ASSETS[f.sym]?.qtyLabel || 'Miktar') : 'Adet'}${ASSETS[f.sym]?.crypto ? ' <small class="muted">(ör. 0.0125 — binlik ayırıcı kullanmayın)</small>' : ''}<input id="pfQty" inputmode="decimal" value="${esc(f.qty ?? '')}" required></label>
      ${asset && f.sym === 'TRY' ? '' : `<label>Alış fiyatı (${coinSym(f) ? '$' : '₺'} / ${asset ? ASSETS[f.sym]?.unit : 'hisse'})<input id="pfCost" inputmode="decimal" value="${esc(f.cost ?? '')}" required></label>`}
      <label>Alış tarihi<input id="pfDate" type="date" value="${f.date || ''}"></label>
      <label>Komisyon (${coinSym(f) ? '$' : '₺'}) <small class="muted">(isteğe bağlı)</small><input id="pfFee" inputmode="decimal" value="${esc(f.fee ?? '')}"></label>
      ${asset && f.sym === 'TRY' ? '' : flowSelect('pfFlow', f.sym, false, f.flow)}`}
      <label class="wide">Not <small class="muted">(isteğe bağlı)</small><input id="pfNote" maxlength="80" value="${esc(f.note || '')}"></label>
    </div>
    ${edit ? '' : '<p class="muted" style="font-size:12px;margin:0">Aynı kategoride bu varlık zaten varsa yeni alım olarak eklenir ve ortalama maliyet güncellenir.</p>'}
    <div class="row"><button class="btn primary">${edit ? 'Kaydet' : 'Ekle'}</button><button type="button" class="btn" data-pfcancel="1">İptal</button><span id="pfMsg" class="down" role="status"></span></div>
  </form>`;
}
export function txPreview(f) {
  const pp = state.portfolio.find(x => x.id === f.pid), q = isCrypto(pp) ? numDec(f.qty) : num(f.qty), pr = num(f.price), fee = f.fee ? num(f.fee) : 0;
  if (!(q > 0) || !(pr > 0)) return 'Tutar, miktar ve fiyat girilince hesaplanır.';
  const amt = f.type === 'buy' ? q * pr + (fee || 0) : q * pr - (fee || 0);
  if (isCoin(pp)) {
    const cur = f.flow === 'USDC' ? 'USDC' : 'USDT', rate = rateAt(cur, f.date), w = WALLETS[f.flow];
    const tlv = rate ? ` (≈ ${tl(amt * rate)}, kur ${fmt.price(rate)} ₺)` : '';
    return f.type === 'buy' ? `Ödenecek: <b>${fmt.price(amt)} ${cur}</b>${tlv}${w ? ` · alım sonrası ${w.label} bakiye: ${wFmt(f.flow, walletBal(f.flow) - amt)}` : ''}`
                            : `Elinize geçecek: <b>${fmt.price(amt)} ${cur}</b>${tlv}${w ? ` · satış sonrası ${w.label} bakiye: ${wFmt(f.flow, walletBal(f.flow) + amt)}` : ''}`;
  }
  return f.type === 'buy' ? `Ödenecek: <b>${tl(amt)}</b>${fee ? ' (komisyon dahil)' : ''}${f.flow === 'cash' ? ` · alım sonrası TL bakiye: ${tl(cashBal() - amt)}` : ''}`
                          : `Elinize geçecek: <b>${tl(amt)}</b>${fee ? ' (komisyon düşülmüş)' : ''}${f.flow === 'cash' ? ` · satış sonrası TL bakiye: ${tl(cashBal() + amt)}` : ''}`;
}
export function txFormHtml() {
  const f = ui.txForm, p = state.portfolio.find(x => x.id === f.pid);
  if (!p) return '';
  const c = pfCalc(p), sell = f.type === 'sell', u = unitOf(p), fixed = isAsset(p) && p.sym === 'TRY';
  return `<form class="panel pfform ${sell ? 'sellform' : ''}" id="txForm">
    <h2>${fixed ? 'TL bakiye · para yatır / çek' : `${esc(assetName(p))} · ${sell ? 'Satış' : 'Alım'}`} <span class="muted">· ${fixed ? `bakiye ${tl(c.qty)}` : `elde ${qtyFmt(c.qty, p)} ${u}${c.qty ? `, ort. maliyet ${fmt.price(c.avg)} ₺` : ''}`}</span></h2>
    <div class="seg" role="radiogroup" aria-label="İşlem türü"><button type="button" data-txtype="buy" aria-pressed="${!sell}">${fixed ? 'Para yatır' : 'Alım'}</button><button type="button" data-txtype="sell" aria-pressed="${sell}">${fixed ? 'Para çek' : 'Satış'}</button></div>
    <div class="pfgrid">
      <label>Tarih<input id="txDate" type="date" value="${f.date || ''}" required></label>
      <label>${isAsset(p) ? (ASSETS[p.sym]?.qtyLabel || 'Miktar') : 'Adet'}${isCrypto(p) ? ' <small class="muted">(ör. 0.0125)</small>' : ''}${sell && c.qty ? ` <button type="button" class="linkbtn" data-txall="1">tümü (${qtyFmt(c.qty, p)})</button>` : ''}<input id="txQty" inputmode="decimal" value="${esc(f.qty ?? '')}" required></label>
      ${fixed ? '' : `<label>${sell ? 'Satış' : 'Alış'} fiyatı (${isCoin(p) ? '$' : '₺'} / ${isAsset(p) ? u : 'hisse'})<input id="txPrice" inputmode="decimal" value="${esc(f.price ?? '')}" required></label>`}
      ${fixed ? '' : `<label>Komisyon (${isCoin(p) ? '$' : '₺'}) <small class="muted">(isteğe bağlı)</small><input id="txFee" inputmode="decimal" value="${esc(f.fee ?? '')}"></label>
      ${flowSelect('txFlow', p.sym, sell, f.flow)}`}
    </div>
    ${fixed ? '' : `<p class="muted" id="txAmt" style="font-size:12px;margin:0">${txPreview(f)}</p>`}
    <div class="row"><button class="btn primary">${fixed ? (sell ? 'Çekimi kaydet' : 'Yatırmayı kaydet') : sell ? 'Satışı kaydet' : 'Alımı kaydet'}</button><button type="button" class="btn" data-txcancel="1">İptal</button><span id="txMsg" class="down" role="status"></span></div>
  </form>`;
}
export function pfReadForm() {
  if (!ui.pfForm || !$('#pfForm')) return;
  for (const [k, id] of [['sym', 'pfSym'], ['qty', 'pfQty'], ['cost', 'pfCost'], ['date', 'pfDate'], ['fee', 'pfFee'], ['note', 'pfNote'], ['flow', 'pfFlow']]) {
    const el = $('#' + id);
    if (el) ui.pfForm[k] = k === 'sym' ? el.value.trim().toUpperCase() : el.value;
  }
}
export function txReadForm() {
  if (!ui.txForm || !$('#txForm')) return;
  for (const [k, id] of [['date', 'txDate'], ['qty', 'txQty'], ['price', 'txPrice'], ['fee', 'txFee'], ['flow', 'txFlow']]) { const el = $('#' + id); if (el) ui.txForm[k] = el.value; }
}
export const currentPrice = p => { const q = pfQuote(p); return q ? trNum(q.last) : ''; };
export function pfOpen(cat, sym) {
  ui.txForm = null;
  ui.pfForm = { cat, sym: sym || (isAssetCat(cat) ? ASSET_CATS[cat][0] : ''), qty: '', cost: '', date: todayIso(), fee: '', note: '' };
  ui.pfForm.flow = defaultFlow(ui.pfForm.sym, false);
  if (ui.pfForm.sym) ui.pfForm.cost = coinSym(ui.pfForm) ? usdPrice(ui.pfForm.sym) : currentPrice(ui.pfForm);
}
export function txOpen(type, pid) {
  ui.pfForm = null;
  const p = state.portfolio.find(x => x.id === pid);
  ui.txForm = { pid, type, date: todayIso(), qty: '', price: p ? (isCoin(p) ? usdPrice(p.sym) : currentPrice(p)) : '', fee: '', flow: p ? defaultFlow(p.sym, type === 'sell') : 'ext' };
}
