import { $ } from './dom.js';
import { FIELDS } from './fields.js';
import { F2, cls, esc, fmt, ok } from './util.js';

export let DATA = null, BY = new Map(), MEDIANS = {}, DIV_Y = new Date().getFullYear(), FX = null;
export const HIST = new Map();
// Testler için: özeti ve kur geçmişini doğrudan yükle (fetch olmadan)
export function setData(d, fx = null) { DATA = d; FX = fx; BY = new Map((d?.stocks || []).map(s => [s.t, s])); }
 // tarayıcı dışında (testler) null

/* ============================================================
   Veri yükleme
   ============================================================ */
export async function loadSummary() {
  const r = await fetch('data/summary.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  DATA = await r.json();
  const Y = DATA.divYear || +String(DATA.lastDate).slice(0, 4), P = Y - 1;
  Object.assign(FIELDS.divYield, { label: `${Y} verimi`, title: `${Y} yılında şimdiye kadar ödenen hisse başı brüt temettü / güncel fiyat` });
  Object.assign(FIELDS.divCur, { label: `${Y} temettü ₺`, title: `${Y} yılında şimdiye kadar ödenen hisse başı brüt temettü toplamı (TL)` });
  Object.assign(FIELDS.divYieldPrev, { label: `${P} verimi`, title: `${P} yılında ödenen toplam hisse başı temettü / güncel fiyat` });
  const AVG = 'her ödeme, önceki temettünün hak kullanım gününden bu temettüye kadarki ortalama kapanış fiyatına bölünür (ilk temettüde son 1 yıl)';
  Object.assign(FIELDS.divYieldAvg, { label: `${Y} bağıl verim`, title: `${Y} bağıl temettü verimi: ${AVG}; yıl içindeki ödemeler toplanır` });
  Object.assign(FIELDS.divYieldAvgPrev, { label: `${P} bağıl verim`, title: `${P} bağıl temettü verimi: ${AVG}; yıl içindeki ödemeler toplanır` });
  Object.assign(FIELDS.divPrev, { label: `${P} temettü ₺`, title: `${P} yılında ödenen hisse başı brüt temettü toplamı (TL)` });
  Object.assign(FIELDS.divFreq, { label: `${Y} ödeme`, title: `${Y} yılındaki temettü ödemesi sayısı` });
  Object.assign(FIELDS.divGrowth, { label: `Değişim ${Y}/${P}`, title: `${Y} toplamı (şimdiye kadar) / ${P} toplamı − 1. ${Y} içinde henüz ödeme yoksa boş.` });
  DIV_Y = Y;
  fetch('data/fx.json', { cache: 'no-cache' }).then(x => x.ok ? x.json() : null).then(j => { FX = j; }).catch(() => {});
  BY = new Map(DATA.stocks.map(s => [s.t, s]));
  MEDIANS = sectorMedians(DATA.stocks);
  $('#tickerList').innerHTML = DATA.stocks.map(s => `<option value="${s.t}">${esc(s.name || '')}</option>`).join('');
  const ix = DATA.index;
  $('#idx').innerHTML = ix ? `<a href="#/h/XU100" class="muted" style="text-decoration:none">BIST 100</a> <b class="num">${F2.format(ix.last)}</b> <span class="num ${cls(ix.chg1d)}">${fmt.pct(ix.chg1d)}</span>` : '';
  const upd = new Date(DATA.updated);
  $('#stamp').textContent = `Son veri: ${fmt.date(DATA.lastDate)} · güncellendi ${upd.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`;
  const banner = $('#banner'), badge = $('#dataBadge');
  const ageDays = (Date.now() - new Date(DATA.lastDate + 'T18:00:00+03:00')) / 864e5;
  const stale = !DATA.sample && ageDays > 4;
  badge.hidden = false;
  badge.classList.toggle('warn', stale);
  badge.textContent = `Veri ${fmt.date(DATA.lastDate).slice(0, 5)}${stale ? ' ⚠' : ''}`;
  badge.title = `Son kapanış ${fmt.date(DATA.lastDate)} · güncellendi ${upd.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`;
  const staleMsg = `Veri ${fmt.date(DATA.lastDate)} tarihli. Otomatik güncelleme aksamış olabilir (GitHub Actions'ı kontrol edin).`;
  badge.onclick = () => { if (!DATA.sample) { banner.textContent = stale ? staleMsg : badge.title + '. Fiyatlar gecikmelidir; site gün içinde saatlik güncellenir.'; banner.hidden = !banner.hidden; } };
  if (DATA.sample) { banner.textContent = 'ÖRNEK VERİ: Bu sayılar rastgele üretildi, gerçek piyasa verisi değildir. Yalnızca arayüzü denemek içindir.'; banner.hidden = false; }
}
export async function loadHist(t) {
  if (HIST.has(t)) return HIST.get(t);
  const r = await fetch(`data/hist/${encodeURIComponent(t)}.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  const h = await r.json();
  HIST.set(t, h);
  return h;
}
export function median(a) {
  const v = a.filter(ok).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function sectorMedians(stocks) {
  const by = {};
  for (const s of stocks) (by[s.sector || '—'] ||= []).push(s);
  const out = {};
  for (const [sec, list] of Object.entries(by)) {
    out[sec] = { n: list.length };
    for (const k of ['pe', 'pb', 'evEbitda', 'netMargin', 'roe', 'de', 'revGrowth', 'epsGrowth', 'divYield', 'payout', 'freeFloat', 'mcap'])
      out[sec][k] = median(list.filter(s => !((k === 'pe' || k === 'evEbitda') && s[k] <= 0)).map(s => s[k]));
  }
  return out;
}
