import { state } from './store.js';
import { F1, F2, TREND, esc, fmt, ok } from './util.js';

/* ============================================================
   Alanlar: tablo sütunları ve filtreler aynı tanımı kullanır.
   pct: değer kesir olarak saklanır (0,12 = %12); filtrede kullanıcı yüzde yazar.
   fx: raporlama para birimi farklıysa güvenilmez olabilecek oran.
   ============================================================ */
export const FIELDS = {
  last:      { label: 'Fiyat',            f: fmt.price },
  chg1d:     { label: 'Gün',              f: fmt.pct, pct: 1, color: 1 },
  chg1w:     { label: '1H',               f: fmt.pct, pct: 1, color: 1 },
  chg1m:     { label: '1A',               f: fmt.pct, pct: 1, color: 1 },
  chg3m:     { label: '3A',               f: fmt.pct, pct: 1, color: 1 },
  chg6m:     { label: '6A',               f: fmt.pct, pct: 1, color: 1 },
  chg1y:     { label: '1Y',               f: fmt.pct, pct: 1, color: 1 },
  ytd:       { label: 'YB',               f: fmt.pct, pct: 1, color: 1, title: 'Yılbaşından beri' },
  turnover:  { label: 'İşlem hacmi ₺',    f: fmt.vol, title: 'Son 20 günün ortalama günlük işlem hacmi (TL)' },
  volRatio:  { label: 'Hacim/Ort.',       f: fmt.x, title: 'Son gün hacmi / önceki 20 gün ortalaması' },
  rsi:       { label: 'RSI 14',           f: fmt.num },
  macdPct:   { label: 'MACD hist.',       f: x => !ok(x) ? '—' : (x > 0 ? '+' : '') + F2.format(x * 100) + '%', pct: 1, color: 1, title: 'MACD histogramı / fiyat' },
  vsSma20:   { label: 'SMA20 farkı',      f: fmt.pct, pct: 1, color: 1 },
  vsSma50:   { label: 'SMA50 farkı',      f: fmt.pct, pct: 1, color: 1 },
  vsSma200:  { label: 'SMA200 farkı',     f: fmt.pct, pct: 1, color: 1 },
  distHi52:  { label: '52H zirveye',      f: fmt.pct, pct: 1, color: 1 },
  distLo52:  { label: '52H dibe',         f: fmt.pct, pct: 1, color: 1 },
  volat:     { label: 'Volatilite',       f: fmt.pctPlain, pct: 1, title: 'Yıllıklandırılmış, son 3 ay' },
  beta:      { label: 'Beta',             f: fmt.num2, title: 'BIST 100\'e göre, son 1 yıl' },
  rs3m:      { label: 'Göreli güç 3A',    f: fmt.pct, pct: 1, color: 1, title: '3 aylık getiri − BIST 100 3 aylık getirisi' },
  mcap:      { label: 'Piyasa değeri ₺',  f: fmt.big },
  pe:        { label: 'F/K',              f: fmt.num, title: 'Piyasa değeri / son 12 ay net kâr (zarardaysa boş)' },
  pb:        { label: 'PD/DD',            f: fmt.num2 },
  evEbitda:  { label: 'FD/FAVÖK',         f: fmt.num, title: '(Piyasa değeri + net borç) / son 12 ay FAVÖK' },
  netMargin: { label: 'Net marj',         f: fmt.pctPlain, pct: 1, color: 1 },
  opMargin:  { label: 'Faaliyet marjı',   f: fmt.pctPlain, pct: 1, color: 1 },
  roe:       { label: 'ÖK kârlılığı',     f: fmt.pctPlain, pct: 1, color: 1, title: 'Özkaynak kârlılığı (ROE)' },
  de:        { label: 'Borç/ÖK',          f: fmt.x },
  freeFloat: { label: 'Halka açıklık',    f: fmt.pctPlain, pct: 1 },
  revGrowth: { label: 'Satış büyümesi',   f: fmt.pct, pct: 1, color: 1, title: 'Yılbaşından bu yana, geçen yılın aynı dönemine göre' },
  epsGrowth: { label: 'Kâr büyümesi',     f: fmt.pct, pct: 1, color: 1, title: 'Yılbaşından bu yana, geçen yılın aynı dönemine göre' },
  divYield:  { label: 'Bu yıl verim',     f: fmt.pctPlain, pct: 1 },
  divCur:    { label: 'Bu yıl temettü ₺', f: x => !ok(x) || x === 0 ? '—' : fmt.price(x) },
  divYieldPrev: { label: 'Geçen yıl verim', f: fmt.pctPlain, pct: 1 },
  divPrev:   { label: 'Geçen yıl temettü ₺', f: x => !ok(x) || x === 0 ? '—' : fmt.price(x) },
  lastDivDate: { label: 'Son ödeme',      f: fmt.date, nofilter: 1, title: 'Son temettünün hak kullanım (eski: ex-date) tarihi' },
  lastDivAmt: { label: 'Son tutar ₺',     f: fmt.price, title: 'Son ödenen hisse başı brüt temettü (TL)' },
  divFreq:   { label: 'Bu yıl ödeme',     f: x => !ok(x) || x === 0 ? '—' : x + '×' },
  divYears5: { label: 'Son 5 yıl',        f: x => !ok(x) ? '—' : `${x}/5`, title: 'Bu yıl dahil son 5 takvim yılının kaçında temettü ödendi' },
  divStreak: { label: 'Kesintisiz',       f: x => !ok(x) || x === 0 ? '—' : x + ' yıl', title: 'Kaç yıldır her yıl temettü ödüyor (yaklaşık 5 yıllık veriyle; en fazla 6 takvim yılı görünür)' },
  divGrowth: { label: 'Temettü değişimi', f: fmt.pct, pct: 1, color: 1 },
  divYieldAvg:     { label: 'Bu yıl bağıl verim', f: fmt.pctPlain, pct: 1 },
  divYieldAvgPrev: { label: 'Geçen yıl bağıl verim', f: fmt.pctPlain, pct: 1 },
  lastDivYieldAvg: { label: 'Son ödeme bağıl verim', f: fmt.pctPlain, pct: 1, title: 'Bağıl verim: son temettü / önceki temettüden bu temettüye kadarki ortalama kapanış fiyatı' },
  dsScore:   { label: 'Temettü güvenliği', f: x => !ok(x) ? '—' : `<span class="score ${x >= 70 ? 'hi' : x >= 50 ? 'mid' : 'lo'}">${x}</span>`, title: 'Temettü güvenlik skoru (0–100): dağıtma oranı, serbest nakit akışı karşılama, net borç/FAVÖK, süreklilik, kesinti geçmişi, özkaynak kârlılığı ve F-skoru. Döküm hisse sayfasında.' },
  fScore:    { label: 'F-skoru', f: x => !ok(x) ? '—' : `<span class="score ${x >= 7 ? 'hi' : x >= 4 ? 'mid' : 'lo'}">${x}/9</span>`, title: 'Piotroski F-skoru (0–9): kârlılık, borçluluk/likidite ve verimlilikte 9 kriter, son 12 ay ile bir önceki yılın karşılaştırması. Bankalarda hesaplanmaz.' },
  ttmYield:  { label: 'Son 12 ay verim', f: fmt.pctPlain, pct: 1, title: 'Son 365 günde ödenen hisse başı brüt temettü / güncel fiyat' },
  yieldPct:  { label: 'Verim bandı', f: x => !ok(x) ? '—' : `<span class="score ${x >= 0.8 ? 'hi' : x >= 0.4 ? 'mid' : 'lo'}">%${Math.round(x * 100)}</span>`, pct: 1, title: 'Hissenin piyasaya göre veriminin (son 12 ay verimi / piyasa medyan verimi) kendi son 4 yıllık geçmişindeki yüzdelik dilimi. %90 = hisse, piyasaya göre geçmişte günlerin %90\'ından daha yüksek verimli (temettüsüne göre piyasadan daha ucuz). Piyasa genelindeki verim değişimi ayıklanır.' },
  yieldPctAbs: { label: 'Mutlak verim dilimi', f: x => !ok(x) ? '—' : `%${Math.round(x * 100)}`, pct: 1, title: 'Son 12 ay veriminin hissenin kendi son 4 yıllık geçmişindeki yüzdelik dilimi (piyasa genelindeki değişim dahil)' },
  yieldRel:  { label: 'Piyasaya göre verim', f: x => !ok(x) ? '—' : F2.format(x) + 'x', title: 'Son 12 ay verimi / piyasa medyan verimi (temettü ödeyen hisseler)' },
  yieldMed:  { label: 'Medyan verim (4Y)', f: fmt.pctPlain, pct: 1, title: 'Son 12 ay veriminin son 4 yıllık medyanı' },
  dcfImpliedG: { label: 'İma edilen büyüme', f: x => !ok(x) ? '—' : x <= -0.2 + 1e-9 ? '≤ −%20' : x >= 0.6 - 1e-9 ? '≥ %60' : fmt.pct(x), pct: 1, title: 'Ters DCF: bugünkü fiyatın varsaydığı, serbest nakit akışının dolar bazında ilk yıl büyümesi (10. yıla kadar %3\'e iner). Düşükse fiyat mütevazı bir beklenti içeriyor.' },
  dcfFair:   { label: 'DCF eder ₺', f: x => !ok(x) ? '—' : x <= 0 ? 'negatif' : fmt.price(x), title: 'Varsayılan varsayımlarla dolar bazında DCF eder fiyatı (hisse sayfasından değiştirilebilir)' },
  dcfUpside: { label: 'DCF farkı', f: fmt.pct, pct: 1, color: 1, title: 'DCF eder fiyat / güncel fiyat − 1 (varsayılan varsayımlarla)' },
  divAvg5:   { label: '5Y ort. verim',    f: fmt.pctPlain, pct: 1, title: 'Son 5 tamamlanmış yılın ortalama yıllık temettüsü / güncel fiyat' },
  nextDivNet:   { label: 'Sıradaki tutar (net) ₺', f: fmt.price, title: 'Açıklanan sıradaki temettünün stopaj sonrası pay başı tutarı (temettuhisseleri.com)' },
  nextDivYield: { label: 'Sıradaki verim (net)',   f: fmt.pctPlain, pct: 1, title: 'Sıradaki net temettü / güncel fiyat' },
  payout:    { label: 'Dağıtma oranı',    f: fmt.pctPlain, pct: 1, title: 'Son 12 ayda ödenen temettü (hisse başı × pay sayısı) / son 12 ay ana ortaklık net kârı' },
  stochK:    { label: 'Stoch RSI',        f: fmt.num, title: 'Stokastik RSI %K (14, 14, 3, 3)' },
  fisher:    { label: 'Fisher',           f: fmt.num2, color: 1, title: 'Ehlers Fisher dönüşümü (9)' },
  atrPct:    { label: 'ATR %',            f: fmt.pctPlain, pct: 1, title: 'ATR 14 / fiyat: günlük ortalama oynaklık' },
  stDist:    { label: 'Supertrend farkı', f: fmt.pct, pct: 1, color: 1, title: 'Fiyatın Supertrend (10, 3) çizgisine uzaklığı' },
  supDist:   { label: 'Destek uzaklığı', f: x => !ok(x) ? '—' : x === 0 ? 'bölgede' : '−' + F1.format(x * 100) + '%', pct: 1, title: 'En yakın major destek bölgesinin üst kenarına uzaklık (confluence)' },
  resDist:   { label: 'Direnç uzaklığı', f: x => !ok(x) ? '—' : x === 0 ? 'bölgede' : '+' + F1.format(x * 100) + '%', pct: 1, title: 'En yakın major direnç bölgesinin alt kenarına uzaklık (confluence)' },
  vsVwma20:  { label: 'VWMA20 farkı',     f: fmt.pct, pct: 1, color: 1, title: 'Fiyatın 20 günlük hacim ağırlıklı ortalamaya uzaklığı' },
};
export const VIEWS = {
  fiyat:    { label: 'Fiyat',    cols: ['_idx', 'last', 'chg1d', 'chg1w', 'chg1m', 'chg3m', 'chg1y', 'ytd', 'turnover', 'volRatio', 'mcap'] },
  trend:    { label: 'Trend',    cols: ['_idx', 'last', 'chg1d', '_trend', '_st', '_ichi', '_cross', 'supDist', '_supStr', 'resDist', '_resStr', 'vsSma50', 'vsSma200', 'vsVwma20', 'stDist', 'distHi52', 'rs3m'] },
  momentum: { label: 'Momentum', cols: ['_idx', 'last', 'chg1d', 'rsi', 'stochK', 'macdPct', 'fisher', '_cross', 'volRatio', 'atrPct', 'volat', 'beta'] },
  temettu:  { label: 'Temettü',  cols: ['_idx', 'last', 'dsScore', 'yieldPct', 'ttmYield', 'divYield', 'divYieldAvg', 'divCur', 'divYieldPrev', 'divYieldAvgPrev', 'divPrev', 'divGrowth', 'divFreq', '_nextDiv', 'nextDivNet', 'lastDivDate', 'lastDivAmt', 'divYears5', 'divStreak', 'divAvg5', 'payout'] },
  temel:    { label: 'Temel',    cols: ['_idx', 'last', 'fScore', 'dcfImpliedG', 'dcfUpside', 'mcap', 'pe', 'pb', 'evEbitda', 'netMargin', 'roe', 'de', 'revGrowth', 'epsGrowth', 'divYield', 'freeFloat', '_sector'] },
};
export const ST = { up: ['Al', 'up'], down: ['Sat', 'down'] };
export const ICHI = { above: ['Bulut üstü', 'up'], below: ['Bulut altı', 'down'], in: ['Bulut içi', ''] };
/* Endeks katmanı: her hisse yer aldığı en dar endeksle etiketlenir (BIST 30 ⊂ 50 ⊂ 100 ⊂ TÜM). */
export const TIER_RANK = { '30': 0, '50': 1, '100': 2, 'TÜM': 3 };
export const tierRank = s => TIER_RANK[s.idx] ?? 4;
export const MKT_RANK = { 'Yıldız': 0, 'Ana': 1, 'Alt': 2, 'YİP': 3, 'GSP': 4, 'PÖİP': 5 };
export const MKT_NAME = { 'Yıldız': 'Yıldız Pazar', 'Ana': 'Ana Pazar', 'Alt': 'Alt Pazar', 'YİP': 'Yakın İzleme Pazarı', 'GSP': 'Girişim Sermayesi Pazarı', 'PÖİP': 'Piyasa Öncesi İşlem Platformu' };
export const tierChip = s => {
  const ix = s.idx ? `<span class="ix ix${tierRank(s)}">${s.idx === 'TÜM' ? 'TÜM' : 'BIST ' + s.idx}</span>` : '<span class="ix ix4">Endeks dışı</span>';
  const mk = s.mkt ? `<span class="mk${s.mkt === 'YİP' ? ' risk' : ''}" title="${MKT_NAME[s.mkt] || s.mkt}">${s.mkt}</span>` : '';
  return `<span class="ixmk">${ix}${mk}</span>`;
};
export const SR_STRONG = 10;
 // güçlü bölge eşiği (bölgelerin ~en güçlü %20'si)
export const TEXTCOLS = {
  _idx:    { label: 'Endeks · Pazar', sortKey: s => tierRank(s) * 10 + (MKT_RANK[s.mkt] ?? 9), cell: tierChip, title: 'Hissenin yer aldığı en dar endeks ve işlem gördüğü pazar' },
  _trend:  { label: 'Trend',  sortKey: s => ({ up: 2, flat: 1, down: 0 })[s.trend] ?? null,
             cell: s => s.trend ? `<span class="chip ${TREND[s.trend][1]}">${TREND[s.trend][0]}</span>` : '—' },
  _st:     { label: 'Supertrend', sortKey: s => s.stTrend ? (s.stTrend === 'up' ? 2 : 0) + (s.stFlip ? 1 : 0) : null,
             cell: s => s.stTrend ? `<span class="chip ${ST[s.stTrend][1]}">${ST[s.stTrend][0]}${s.stFlip ? ' · yeni' : ''}</span>` : '—',
             title: 'Supertrend (10, 3) yönü; "yeni" = son 3 günde döndü' },
  _ichi:   { label: 'Ichimoku', sortKey: s => ({ above: 2, in: 1, below: 0 })[s.ichi] ?? null,
             cell: s => s.ichi ? `<span class="chip ${ICHI[s.ichi][1]}">${ICHI[s.ichi][0]}</span>` : '—',
             title: 'Fiyatın Ichimoku bulutuna (9, 26, 52) göre konumu' },
  _cross:  { label: 'Sinyal', sortKey: s => signalScore(s),
             cell: s => signalChips(s) || '<span class="muted">—</span>', title: 'Son günlerdeki kesişim sinyalleri' },
  _nextDiv: { label: 'Sıradaki temettü', sortKey: s => s.divUpcoming?.length ? (s.nextDivDate || '9999-12-31') : null,
             cell: s => !s.divUpcoming?.length ? '<span class="muted">—</span>'
               : s.nextDivDate ? `<span class="chip up">${fmt.date(s.nextDivDate)}</span>${s.divUpcoming.length > 1 ? ` <span class="muted">+${s.divUpcoming.length - 1}</span>` : ''}`
               : '<span class="chip warn" title="Temettü kararı alındı, ödeme tarihi henüz açıklanmadı">Tarih bekleniyor</span>',
             title: 'Açıklanmış ama henüz ödenmemiş temettü (temettuhisseleri.com)' },
  _supStr: { label: 'Destek gücü', sortKey: s => s.supS ?? null, title: 'En yakın destek bölgesinin skoru ve kesişen yöntem sayısı; skor ≥ 10 güçlü',
             cell: s => ok(s.supS) ? `<span class="${s.supS >= SR_STRONG ? 'up' : 'muted'}"><b>${F1.format(s.supS)}</b> · ${s.supN}×</span>` : '—' },
  _resStr: { label: 'Direnç gücü', sortKey: s => s.resS ?? null, title: 'En yakın direnç bölgesinin skoru ve kesişen yöntem sayısı; skor ≥ 10 güçlü',
             cell: s => ok(s.resS) ? `<span class="${s.resS >= SR_STRONG ? 'down' : 'muted'}"><b>${F1.format(s.resS)}</b> · ${s.resN}×</span>` : '—' },
  _sector: { label: 'Sektör', sortKey: s => s.sector || '', cell: s => esc(s.sector || '—') },
};
export const val = (s, k) => (k in TEXTCOLS ? TEXTCOLS[k].sortKey(s) : s[k]);
export function signalChips(s) {
  const out = [];
  if (s.cross === 'golden') out.push('<span class="chip up">Golden cross</span>');
  if (s.cross === 'death') out.push('<span class="chip down">Death cross</span>');
  if (s.macdCross === 'up') out.push('<span class="chip up">MACD al</span>');
  if (s.macdCross === 'down') out.push('<span class="chip down">MACD sat</span>');
  if (s.stFlip === 'up') out.push('<span class="chip up">Supertrend al</span>');
  if (s.stFlip === 'down') out.push('<span class="chip down">Supertrend sat</span>');
  if (s.fisherCross === 'up') out.push('<span class="chip up">Fisher al</span>');
  if (s.fisherCross === 'down') out.push('<span class="chip down">Fisher sat</span>');
  if (s.stochCross === 'up' && s.stochK < 30) out.push('<span class="chip up">Stoch RSI al</span>');
  if (s.stochCross === 'down' && s.stochK > 70) out.push('<span class="chip down">Stoch RSI sat</span>');
  if (s.tkCross === 'up') out.push('<span class="chip up">Tenkan/Kijun al</span>');
  if (s.tkCross === 'down') out.push('<span class="chip down">Tenkan/Kijun sat</span>');
  return out.join(' ');
}
export function signalScore(s) {
  const v = x => x === 'up' || x === 'golden' ? 1 : x === 'down' || x === 'death' ? -1 : 0;
  return 2 * v(s.cross) + v(s.macdCross) + v(s.stFlip) + v(s.fisherCross) + v(s.tkCross)
    + (s.stochCross === 'up' && s.stochK < 30 ? 1 : 0) - (s.stochCross === 'down' && s.stochK > 70 ? 1 : 0);
}
/* Hazır taramalar */
export const PRESETS = [
  { id: 'all',      label: 'Tümü',             test: () => true },
  { id: 'watch',    label: '★ İzleme listem',  test: s => state.watch.includes(s.t) },
  { id: 'oversold', label: 'Aşırı satım',      test: s => ok(s.rsi) && s.rsi < 30,  hint: 'RSI < 30', sort: ['rsi', 1] },
  { id: 'overbought', label: 'Aşırı alım',     test: s => s.rsi > 70,  hint: 'RSI > 70', sort: ['rsi', -1] },
  { id: 'uptrend',  label: 'Güçlü trend',      test: s => s.trend === 'up', hint: 'Fiyat > SMA50 > SMA200', sort: ['rs3m', -1] },
  { id: 'golden',   label: 'Golden cross',     test: s => s.cross === 'golden', hint: 'Son 10 günde SMA50, SMA200\'ü yukarı kesti' },
  { id: 'macdUp',   label: 'MACD al',          test: s => s.macdCross === 'up', hint: 'Son 3 günde MACD sinyal çizgisini yukarı kesti' },
  { id: 'stUp',     label: 'Supertrend al',    test: s => s.stFlip === 'up', hint: 'Son 3 günde Supertrend (10, 3) yukarı döndü', sort: ['turnover', -1] },
  { id: 'fisherUp', label: 'Fisher al',        test: s => s.fisherCross === 'up' && s.fisher < 0, hint: 'Son 2 günde Fisher, tetik çizgisini sıfırın altında yukarı kesti', sort: ['fisher', 1] },
  { id: 'nearSup',  label: 'Güçlü desteğe yakın', test: s => s.supDist <= 0.03 && s.supS >= SR_STRONG, hint: 'En yakın destek bölgesi %3 içinde ve güçlü (skor ≥ 10)', sort: ['supDist', 1] },
  { id: 'nearRes',  label: 'Güçlü dirence yakın', test: s => s.resDist <= 0.02 && s.resS >= SR_STRONG, hint: 'En yakın direnç bölgesi %2 içinde ve güçlü (skor ≥ 10): kırılım takibi', sort: ['resDist', 1] },
  { id: 'stochLow', label: 'Stoch RSI dipte',  test: s => ok(s.stochK) && s.stochK < 20, hint: 'Stokastik RSI %K < 20', sort: ['stochK', 1] },
  { id: 'cloudUp',  label: 'Bulut üstünde',    test: s => s.ichi === 'above' && s.tkCross !== 'down', hint: 'Fiyat Ichimoku bulutunun üstünde', sort: ['rs3m', -1] },
  { id: 'high52',   label: '52H zirvesinde',   test: s => s.distHi52 > -0.03, hint: '52 haftalık zirveye %3\'ten yakın', sort: ['distHi52', -1] },
  { id: 'volspike', label: 'Hacim patlaması',  test: s => s.volRatio >= 2, hint: 'Hacim, 20 günlük ortalamanın 2 katı', sort: ['volRatio', -1] },
  { id: 'tedbir',   label: '⚠ Tedbirli',       test: s => !!s.tedbir?.length, hint: 'Borsa İstanbul tedbiri uygulanan hisseler' },
  { id: 'divSoon',  label: 'Yaklaşan temettü', test: s => !!s.divUpcoming?.length, hint: 'Açıklanmış, henüz ödenmemiş temettüsü olanlar (tarihli olanlar önce)', sort: ['_nextDiv', 1] },
  { id: 'divHigh',  label: 'Yüksek temettü',   test: s => Math.max(s.divYield || 0, s.divYieldPrev || 0) >= 0.06, hint: 'Bu yılın ya da geçen yılın temettü verimi ≥ %6', sort: ['divYield', -1] },
  { id: 'signal',   label: 'Aktif sinyal',     test: s => !!s.sig?.length, hint: 'Morning star kurulumunda açık sinyali olanlar (Sinyaller sayfası)' },
  { id: 'divSafe',  label: 'Güvenli temettü',  test: s => s.dsScore >= 70, hint: 'Temettü güvenlik skoru ≥ 70', sort: ['dsScore', -1] },
  { id: 'yieldTop', label: 'Verim bandının tepesi', test: s => s.yieldPct >= 0.8 && s.dsScore >= 50, hint: 'Piyasaya göre verimi kendi 4 yıllık geçmişinin üst %20\'sinde ve güvenlik skoru ≥ 50', sort: ['yieldPct', -1] },
  { id: 'dcfModest', label: 'Mütevazı fiyatlama', test: s => ok(s.dcfImpliedG) && s.dcfImpliedG <= 0.02, hint: 'Ters DCF: fiyat, serbest nakit akışının dolar bazında en fazla %2 büyümesini varsayıyor', sort: ['dcfImpliedG', 1] },
  { id: 'fStrong',  label: 'Güçlü F-skoru',    test: s => s.fScore >= 7, hint: 'Piotroski F-skoru ≥ 7', sort: ['fScore', -1] },
  { id: 'divReg',   label: 'Düzenli temettü',  test: s => s.divYears5 >= 5, hint: 'Son 5 yılın her birinde temettü ödedi', sort: ['divAvg5', -1] },
  { id: 'value',    label: 'Ucuz',             test: s => s.pe > 0 && s.pe < 8 && s.pb > 0 && s.pb < 1.5, hint: 'F/K < 8 ve PD/DD < 1,5', sort: ['pe', 1] },
  { id: 'quality',  label: 'Kârlı büyüme',     test: s => s.roe > 0.25 && s.netMargin > 0.1 && s.revGrowth > 0, hint: 'ÖK kârlılığı > %25, net marj > %10, satış büyüyor', sort: ['roe', -1] },
];
export const OPS = { '>': (a, b) => a > b, '<': (a, b) => a < b };
if (!VIEWS[state.view]) state.view = 'trend';
// Sonradan eklenen varsayılan sütunlar, sütunları elle düzenlenmiş görünümlere de kendi yerlerinde eklenir
// (kullanıcının kaldırdığı sütunlar geri gelmez: her görünümün daha önce görülen varsayılanları saklanır).
// colsSeen kaydı olmayan eski kurulumlar için o sürümden sonra eklenen sütunlar:
const ADDED_LATER = ['divYieldAvg', 'divYieldAvgPrev', 'dsScore', 'yieldPct', 'ttmYield', 'fScore', 'dcfImpliedG', 'dcfUpside'];
state.colsSeen ||= {};
for (const [v, def] of Object.entries(VIEWS)) {
  const seen = state.colsSeen[v] || def.cols.filter(k => !ADDED_LATER.includes(k));
  const cur = state.cols?.[v];
  if (Array.isArray(cur)) {
    def.cols.forEach((k, i) => {
      if (seen.includes(k) || cur.includes(k)) return;
      const before = def.cols.slice(0, i).reverse().find(x => cur.includes(x)); // varsayılan sırada kendinden önceki sütunun arkasına
      cur.splice(before ? cur.indexOf(before) + 1 : cur.length, 0, k);
    });
  }
  state.colsSeen[v] = [...def.cols];
}
