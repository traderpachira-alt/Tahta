import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { persist, state } from './store.js';
import { setupFacts, setupSvg } from './setupviz.js';
import { renderArchive } from './archive.js';
import { F0, F1, F2, cls, esc, fmt, info, ok } from './util.js';

/* ============================================================
   Sinyaller: strateji modülleri (scripts/strategies/), açık sinyaller, hazırlanan kurulumlar, geriye dönük test
   Veri: data/signals.json (scripts/signals.py, her güncellemede yeniden üretilir)
   ============================================================ */
let SIG = null, tfSel = '1D', cardOpen = false, sigTab = 'acik';
// Tarih: günlük 'YYYY-MM-DD', 4 saatlik 'YYYY-MM-DD HH:MM'
const dfmt = d => { if (!d) return '—'; const [day, time] = d.split(' '); return time ? `${fmt.date(day).slice(0, 5)} ${time}` : fmt.date(day); };
// Hak kullanımdan önceki iş günü (temettü hakkı olan son gün)
const prevBday = d => { const x = new Date(d + 'T12:00:00Z'); do x.setUTCDate(x.getUTCDate() - 1); while ([0, 6].includes(x.getUTCDay())); return x.toISOString().slice(0, 10); };
const dm = d => fmt.date(d).slice(0, 5);
const tk = a => `<td class="tk c-tk"><a class="code" href="#/h/${a.t}">${a.t}</a> ${tfChip(a.tf)}</td>`;
/* Portföy stratejisi (ör. göreli güç rotasyonu): tablo satırı ve kendi sayfası */
const pct1 = x => !ok(x) ? '—' : (x > 0 ? '+' : '') + F1.format(x * 100) + '%';
/* Hesap hücresi: son bakiye (kalın), yıllık getiri ve en büyük düşüş, altında işlem bilgisi */
const tlFinal = x => fmt.price(x).replace(/,00$/, '') + ' ₺';
function acctCell(ac, A, note, lab = '') {
  const l = lab ? ` class="c-ac" data-l="${lab}"` : '';
  if (!ac) return `<td${l}>—</td>`;
  return `<td${l}><b class="${cls(ac.final - A.capital)}">${tlFinal(ac.final)}</b><small class="sub2" title="Yıllık getiri · en büyük düşüş"><span class="${cls(ac.cagr)}">${fmt.pct(ac.cagr)}/yıl</span> · <span class="down">−%${Math.round(ac.mdd * 100)}</span></small>${note ? `<small class="sub2">${note}</small>` : ''}</td>`;
}
const missNote = ac => `${ac.taken} işlem${ac.missed ? ` · <span title="Pozisyon boştaki nakdi aştığı için açılamayan sinyal">${ac.missed} kaçtı</span>` : ''}`;
const expNote = u => u ? `${u.taken} işlem · <span title="Aynı anda açık pozisyonların toplamı en çok bakiyenin bu katı oldu (1'in üstü kaldıraç gerektirir)">${F1.format(u.maxExp)}×</span>` : '';
function pfRow(u, A) {
  const p = u.pf, st = p.stats, ac = p.account;
  return `<tr data-sigs="${u.id}"><td class="tk"><b>${esc(u.name)}</b>${testChip(u)}<small class="sub2">${esc(u.short || '')}</small></td>
    <td class="txt c-tf"><span class="chip" title="Aylık yenilenen portföy">Aylık</span></td>
    <td data-l="Hisse" title="Portföydeki hisse sayısı">${p.holdings.length || '<span class="muted">nakit</span>'}</td>
    <td data-l="Test" title="Test edilen ay sayısı">${st.months} ay</td><td data-l="Endeksi geçen" title="Endeksi geçen ayların oranı">%${Math.round(st.beat * 100)}</td>
    <td data-l="Aylık ort." title="Aylık ortalama getiri">${pct1(st.avgM)}/ay</td><td class="muted" data-l="BIST 100" title="BIST 100'ün aylık ortalaması">${pct1(st.avgXu)}/ay</td><td class="c-tf"></td>
    ${acctCell(ac, A, '10 hisse · aylık', 'Bakiye')}<td class="muted c-tf" title="Portföy her zaman bakiyenin tamamıyla kurulur; kaldıraç yok, sınırsız biçim aynıdır">aynı</td></tr>`;
}
function portfolioView(S, u) {
  const p = u.pf, ac = p.account, b = p.bench, A = S.account;
  const off = !p.regime.on;
  return `
  <section class="panel">
    <h2>Güncel portföy <span class="muted" style="font-weight:400">· son dengeleme ${fmt.date(p.rebalanced)} · sonraki ${fmt.date(p.next)}</span></h2>
    ${p.holdings.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr><th class="tk">Hisse</th><th>Sıra</th><th>Ağırlık</th>
      <th title="Portföye giriş (dengeleme) tarihi">Portföyde</th><th title="Portföye girdiğinden bu yana getiri">Girişten beri</th><th title="Bu ayki dengelemeden bu yana">Bu ay</th>
      <th title="Bugün sıralansa kaçıncı olurdu">Bugünkü sıra</th><th>Son fiyat</th></tr></thead><tbody>
      ${p.holdings.map(h => `<tr data-t="${h.t}"><td class="tk"><a class="code" href="#/h/${h.t}">${h.t}</a></td><td>${h.rank}</td><td>%${F1.format(100 / p.holdings.length)}</td>
        <td>${fmt.date(h.since)}</td><td class="${cls(h.ret)}">${pct1(h.ret)}</td><td class="${cls(h.retM)}">${pct1(h.retM)}</td>
        <td>${h.nowRank ? (h.nowRank > 10 ? `<span class="down">${h.nowRank}</span>` : h.nowRank) : '<span class="muted">listede yok</span>'}</td><td>${fmt.price(h.c)}</td></tr>`).join('')}
    </tbody></table></div>`
    : `<p class="note-fx" style="margin:0">Portföy şu an <b>nakitte</b>: ${fmt.date(p.rebalanced)} dengelemesinde BIST 100, 200 günlük ortalamasının altındaydı (piyasa filtresi).
       ${off ? 'Filtre bugün de kapalı; ' : 'Filtre bugün açık: '}bir sonraki dengeleme ${fmt.date(p.next)}.</p>`}
  </section>

  <section class="panel">
    <h2>Bugün sıralansa <span class="muted" style="font-weight:400">· en güçlü 15 · ${off ? 'piyasa filtresi kapalı (nakitte kalınır)' : 'ilk 10 alınır'}</span></h2>
    <div class="tablewrap flat"><table class="grid sigtable"><thead><tr><th class="tk">Hisse</th><th>Sıra</th>
      <th title="Son 6 ay, son ay hariç">6 ay getiri</th><th title="Yıllıklandırılmış günlük oynaklık">Oynaklık</th><th title="Getiri / oynaklık">Güç skoru</th><th class="txt">Durum</th></tr></thead><tbody>
      ${p.preview.map(x => `<tr data-t="${x.t}"><td class="tk"><a class="code" href="#/h/${x.t}">${x.t}</a></td><td>${x.rank}</td><td class="${cls(x.mom)}">${pct1(x.mom)}</td>
        <td>%${Math.round(x.vol * 100)}</td><td>${F2.format(x.score)}</td>
        <td class="txt">${x.held ? (x.rank <= 10 ? '<span class="chip">portföyde</span>' : '<span class="chip down">çıkabilir</span>') : x.rank <= 10 ? `<span class="chip up">${off ? 'filtre açılınca' : 'girebilir'}</span>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${info('Sıralama, bir sonraki dengelemenin önizlemesidir; asıl karar ayın ilk işlem günü, bir önceki kapanışa göre verilir. Güç skoru = son 6 ayın getirisi (son ay hariç) / günlük getiri oynaklığı. Son 6 ayda +%200 üstü yükselenler ve 20 günlük ortalama işlem hacmi 20 mn ₺ altındakiler listede yer almaz.', 'Sıralama nasıl yapılır?')}
  </section>

  <section class="panel">
    <h2>Son dengelemeler</h2>
    <div class="tablewrap flat"><table class="grid sigtable"><thead><tr><th class="tk">Tarih</th><th>Portföy</th><th>BIST 100</th><th class="txt">Girenler</th><th class="txt">Çıkanlar</th></tr></thead><tbody>
      ${p.history.map(h => `<tr><td class="tk">${fmt.date(h.d)}</td><td class="${cls(h.r)}">${h.on ? pct1(h.r) : '<span class="muted">nakit</span>'}</td><td class="${cls(h.xu)}">${pct1(h.xu)}</td>
        <td class="txt">${h.in.join(', ') || '—'}</td><td class="txt">${h.out.join(', ') || '—'}</td></tr>`).join('')}
    </tbody></table></div>
    ${info('Her satır, o tarihte yapılan dengelemeden bir sonrakine kadarki getiridir (son satır devam ediyor). "Nakit": piyasa filtresi kapalıydı.', 'Nasıl okunur?')}
  </section>

  <details class="panel sigcard"${cardOpen ? ' open' : ''}>
    <summary><h2>${esc(u.name)} · kurallar ve test sonuçları</h2><span class="muted">Son ${F1.format(ac.years)} yıl: yıllık ${fmt.pct(ac.cagr)} (BIST 100 ${fmt.pct(b.cagr)}) · düşüş −%${Math.round(ac.mdd * 100)}</span></summary>
    <p class="muted" style="margin:0 0 8px">${esc(u.summary || '')}</p>
    <ul class="sigrules">${(u.rules || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    <h3>Geriye dönük test · ${fmt.big(A.capital)} ₺ ile</h3>
    <div class="tablewrap flat"><table class="grid sigtable"><thead><tr><th class="tk"></th><th>Bugünkü bakiye</th><th>Yıllık</th><th>En büyük düşüş</th></tr></thead><tbody>
      <tr><td class="tk"><b>${esc(u.name)}</b></td><td><b>${fmt.price(ac.final).replace(/,00$/, '')} ₺</b></td><td class="${cls(ac.cagr)}">${fmt.pct(ac.cagr)}</td><td class="down">−%${Math.round(ac.mdd * 100)}</td></tr>
      <tr><td class="tk">BIST 100 al-tut</td><td>${fmt.price(b.final).replace(/,00$/, '')} ₺</td><td class="${cls(b.cagr)}">${fmt.pct(b.cagr)}</td><td class="down">−%${Math.round(b.mdd * 100)}</td></tr>
    </tbody></table></div>
    <h3>Yıllara göre</h3>
    <div class="sigyearwrap"><table class="grid sigyears"><thead><tr><th class="tk"></th>${Object.keys(p.years).map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>
      <tr><td class="tk">Portföy</td>${Object.values(p.years).map(v => `<td class="${cls(v.r)}">${pct1(v.r)}</td>`).join('')}</tr>
      <tr><td class="tk">BIST 100</td>${Object.values(p.years).map(v => `<td class="${cls(v.xu)}">${pct1(v.xu)}</td>`).join('')}</tr>
      <tr><td class="tk">Ay sayısı</td>${Object.values(p.years).map(v => `<td>${v.n}</td>`).join('')}</tr>
    </tbody></table></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">${p.stats.months} tamamlanmış ayın %${Math.round(p.stats.beat * 100)}'inde endeksi geçti; ${p.stats.cash} ay piyasa filtresiyle nakitte kalındı. İlk ve son yıl kısmi.</p>
    <h3>Bilmeniz gerekenler</h3>
    <ul class="sigrules">${(u.notes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul>
  </details>`;
}
const tfChip = tf => tf === '4H' ? '<span class="chip tf4" title="4 saatlik mumlar (günde iki mum: 13:30 ve kapanış)">4 saat</span>' : '<span class="chip" title="Günlük mumlar">Günlük</span>';
/* Eski (tek stratejili) veri biçimini yeni biçime çevir */
function normalize(S) {
  if (S.version >= 2) return S;
  const id = 'morningstar', k = a => ({ ...a, k: a.k || id });
  return { ...S, groups: { formasyon: 'Mum formasyonları' },
    strategies: S.strategy ? [{ id, ...S.strategy, group: 'formasyon', groupName: 'Mum formasyonları', status: 'live', variants: S.variants, defaultV: S.defaultV,
      candidates: true, candMaxDist: S.candMaxDist, tfs: Object.keys(S.timeframes || { '1D': 1 }),
      stats: S.timeframes ? S.stats : { '1D': S.stats }, accounts: S.timeframes ? S.accounts : { '1D': S.accounts } }] : [],
    active: (S.active || []).map(k), recent: (S.recent || []).map(k), candidates: (S.candidates || []).map(k) };
}
export async function loadSignals() {
  if (SIG) return SIG;
  const r = await fetch('data/signals.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  SIG = normalize(await r.json());
  return SIG;
}
const TIER_OF = { 'BIST 30': ['30'], 'BIST 50': ['30', '50'], 'BIST 100': ['30', '50', '100'], 'BIST TÜM': ['30', '50', '100', 'TÜM'] };
const IDX_LABEL = { 30: 'BIST 30', 50: 'BIST 50', 100: 'BIST 100', TÜM: 'BIST 100 dışı' };
const rFmt = x => !ok(x) ? '—' : (x > 0 ? '+' : '') + F2.format(x) + 'R';
// Kümülatif sonuç TL: 1R = 1.000 ₺ (ör. 100.000 ₺ bakiyenin %1'i); bileşik değil, tüm işlemlerin toplamı
const R_TL = 1000;
const tl = x => !ok(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + fmt.big(Math.abs(x)) + ' ₺';
const pctFrom = (a, b) => ok(a) && ok(b) && b ? a / b - 1 : null;
const STATUS = {
  open: ['Açık', '', 'Giriş sinyal günü kapanışında yapıldı; pozisyon sürüyor'],
  trail: ['Takip stopu', '', 'Fiyat +1R\'yi gördükten sonra takip eden stop çalıştı'],
  tp: ['Hedef', 'up', 'Hedefe ulaştı'],
  stop: ['Stop', 'down', 'Başlangıç stopuna indi (−1R)'],
  chan: ['Kanal çıkışı', '', 'Kapanış son 10 günün en düşüğünün altına indi'],
  cum: ['Son gün çıkışı', '', 'Temettü hakkı olan son günün kapanışında çıkıldı'],
  time: ['Süre doldu', 'warn', '60 işlem günü doldu, kapanıştan çıkıldı'],
};
const chip = st => { const [l, c, t] = STATUS[st] || [st, '', '']; return `<span class="chip ${c}" title="${esc(t)}">${l}</span>`; };

/* Piyasa durumu (sinyaller için): BIST TÜM uzun vadeli genişliğinden 5 kademe; her kademede geçmişte açılan sinyallerin sonucu */
const LV_CLS = ['', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5'];
const lvMeter = lv => `<span class="rgmeter" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= lv ? LV_CLS[lv] : ''}"></i>`).join('')}</span>`;
const pctS = x => ok(x) ? '%' + Math.round(x * 100) : '—';
function lvRow(x, name, cur) {
  return `<tr class="${cur ? 'sel' : ''}"><td class="tk"><span class="lvdot ${LV_CLS[x.lvl]}"></span>${x.lvl} · ${esc(name)}</td><td>${x.n}</td><td>${x.n ? pctS(x.win) : '—'}</td>
    <td class="${cls(x.avgR)}">${x.n ? rFmt(x.avgR) : '—'}</td><td class="${cls(x.med)}">${x.n ? rFmt(x.med) : '—'}</td></tr>`;
}
const lvTable = (rows, levels, cur) => `<div class="tablewrap flat"><table class="grid sigtable lvtable"><thead><tr><th class="tk">Kademe (giriş günü)</th><th>İşlem</th><th>Kârlı</th>
  <th title="İşlem başına ortalama sonuç">Ort.</th><th title="Tipik işlemin sonucu">Medyan</th></tr></thead><tbody>
  ${rows.map(x => lvRow(x, levels[x.lvl - 1]?.name || '', x.lvl === cur)).join('')}</tbody></table></div>`;
function regimeHtml(S) {
  const G = S.regime, now = G?.now;
  if (!now?.lvl) return '';
  const st = G.stats?.find(x => x.lvl === now.lvl), nStr = S.strategies.filter(u => u.kind !== 'portfolio').length;
  const few = st && st.n < 100;
  const d20 = ok(now.d20) ? ` (20 günde ${now.d20 >= 0 ? '+' : '−'}${Math.round(Math.abs(now.d20) * 100)} puan)` : '';
  return `<section class="regime ${LV_CLS[now.lvl]}" aria-label="Piyasa durumu">
    <div class="rghead"><span class="rglbl">Piyasa durumu · sinyaller için</span>${lvMeter(now.lvl)}<b>${now.lvl}/5 · ${esc(now.name)}</b></div>
    <p>${esc(now.text)} BIST TÜM'de 200 günlük ortalamasının üstündeki hisse oranı <b>%${Math.round(now.a200 * 100)}</b>${d20}.</p>
    ${st ? `<p class="rgpast">Bu kademede geçmişte açılan sinyaller (${nStr} strateji, son 4 yıl): <b>${st.n} işlem</b> · ${st.n ? `${pctS(st.win)} kârlı · işlem başına <b class="${cls(st.avgR)}">${rFmt(st.avgR)}</b>` : 'örnek yok'}${few ? ' · <span class="chip warn" title="Bu kademede az sayıda işlem var; sonuç tek bir döneme ait olabilir">az örnek</span>' : ''}</p>` : ''}
    ${info(`${lvTable(G.stats, G.levels, now.lvl)}
      <p>Kademe, BIST TÜM hisselerinin kaçının 200 günlük ortalamasının üstünde olduğuna göre belirlenir (uzun vadeli genişlik): ${G.levels.map(l => `<b>${l.lvl}</b> ${esc(l.name)} ${l.lvl === 1 ? `%${Math.round(l.hi * 100)} altı` : l.lvl === 5 ? `%${Math.round(l.lo * 100)} ve üstü` : `%${Math.round(l.lo * 100)}–${Math.round(l.hi * 100)}`}`).join(' · ')}. Yalnızca o günün verisini kullanır.
      Tablo, varsayılan çıkışla son 4 yılda her kademede açılmış bütün sinyallerin sonucudur (giriş günündeki kademeye göre). Kademe bir al-sat kuralı değildir: kademeler arasındaki fark küçükse tek başına işlem kararı için yeterli değildir; her stratejinin kendi tablosu strateji sayfasında. Piyasa Nabzı (anasayfa) kısa vadeli yönü de içerir, bu ölçü yalnızca uzun vadeli genişliktir.`, 'Kademeler ve geçmiş sonuçlar')}
  </section>`;
}
const PROFILE = {
  balanced: ['Dengeli', 'up', 'Tipik işlem kârlı (medyan artıda); sonuç tek tük büyük işleme bağlı değil'],
  tail: ['Büyük kazançlara dayalı', '', 'İşlemlerin çoğu küçük zararla kapanır, kâr az sayıda büyük işlemden gelir; uçlar atılınca da artıda kalıyor'],
  fragile: ['Birkaç işleme bağlı', 'warn', 'En iyi ve en kötü %5 atılınca kalan ortalama sıfıra yakın ya da eksi: sonuç birkaç büyük işleme bağlı'],
};
const rSum = x => !ok(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.abs(x) >= 100 ? F0 : F1).format(Math.abs(x)) + 'R';
const profChip = R => { const p = PROFILE[R?.profile]; return p ? `<span class="chip ${p[1]}" title="${esc(p[2])}">${p[0]}</span>` : ''; };
function robustHtml(S, u) {
  const R = u.robust?.[tfSel];
  if (!R) return '';
  const max = Math.max(...R.hist, 1), labs = ['< −1,5', '−1,5…−1', '−1…−0,5', '−0,5…0', '0…0,5', '0,5…1', '1…2', '2…3', '3…5', '5…10', '≥ 10'];
  const ticks = ['', '−1,5', '−1', '−0,5', '0', '0,5', '1', '2', '3', '5', '10'];
  const ys = Object.keys(R.big).sort();
  const G = S.regime, rg = u.regime?.[tfSel];
  return `<h3>Sağlamlık <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">· BIST TÜM, varsayılan çıkış, ${R.n} işlem</span></h3>
    <div class="robrow">${profChip(R)} <span class="muted">${esc(PROFILE[R.profile]?.[2] || '')}</span></div>
    <div class="sigstats robstats">
      <div title="İşlem başına ortalama"><span>Ortalama</span><b class="${cls(R.mean)}">${rFmt(R.mean)}</b></div>
      <div title="İşlemlerin yarısı bunun altında, yarısı üstünde kapandı"><span>Medyan (tipik işlem)</span><b class="${cls(R.med)}">${rFmt(R.med)}</b></div>
      <div title="En iyi ve en kötü %5 işlem hariç ortalama"><span>Kırpılmış ort. (%5)</span><b class="${cls(R.tm)}">${rFmt(R.tm)}</b></div>
      <div title="Bütün işlemlerin toplamından en iyi 3 işlem çıkarıldığında"><span>En iyi 3 hariç toplam</span><b class="${cls(R.ex3)}">${rSum(R.ex3)}</b><small class="muted">toplam ${rSum(R.sum)}</small></div>
      <div title="Toplam kârın en iyi %5 işlemden gelen payı (%100'ün üstü: kalan işlemler toplamda zararda)"><span>En iyi %5'in payı</span><b>${ok(R.topShare) ? '%' + Math.round(R.topShare * 100) : '—'}</b></div>
      <div title="10R ve üstü kazançla kapanan işlem sayısı, yıllara göre"><span>≥ 10R işlem (yıllar)</span><b>${ys.map(y => R.big[y]).join(' · ')}</b><small class="muted">${ys.map(y => "'" + y.slice(2)).join(' · ')}</small></div>
    </div>
    <div class="rhist" role="img" aria-label="İşlem sonuçlarının R dağılımı">${R.hist.map((n, i) => `<div class="${i < 4 ? 'neg' : 'pos'}" title="${labs[i]}R: ${n} işlem"><b>${n || ''}</b><i style="height:${n / max * 100}%"></i></div>`).join('')}</div>
    <div class="rhaxis" aria-hidden="true">${ticks.map(t => `<span>${t}</span>`).join('')}</div>
    <p class="muted" style="font-size:12px;margin:4px 0 0">İşlem sonuçlarının dağılımı (R; çubuk üstünde işlem sayısı, eksende aralık sınırları). Kayıplar stopla yaklaşık −1R'de sınırlıdır, kazançlar açık uçludur; bu yüzden dağılım çan eğrisi değildir ve ortalama tek başına yanıltıcı olabilir.</p>
    ${rg && G ? `<h3>Piyasa durumuna göre</h3>${lvTable(rg, G.levels, G.now?.lvl)}` : ''}`;
}

function statsTable(S, u) {
  // varsayılan çıkış en üstte (JS nesnelerinde '2', '3' gibi sayısal anahtarlar öne geçer)
  const vs = [u.defaultV, ...Object.keys(u.variants).filter(v => v !== u.defaultV)], tierSel = curTier(S);
  return `<div class="tablewrap flat"><table class="grid sigstat"><thead><tr><th class="tk">Evren</th><th class="txt">Çıkış kuralı</th><th>İşlem</th>
    <th title="Kârla kapanan işlemlerin oranı">Kârlı</th><th title="Sabit hedefe ulaşan işlemlerin oranı">Hedefe ulaşan</th>
    <th title="İşlem başına ortalama sonuç (komisyon ve kayma dahil)">Ort.</th><th title="Aynı hisselerde rastgele günlerde, aynı stop yapısı ve çıkış kuralıyla girişin ortalaması">Rastgele giriş</th>
    <th title="Her işlemde sabit 1.000 ₺ riske edilseydi (1R = 1.000 ₺) tüm işlemlerin toplam sonucu; bileşik değildir, pozisyon sınırı yoktur">Kümülatif (1R = 1.000 ₺)</th><th title="Art arda en uzun kayıp serisi">Art arda kayıp</th>
    <th title="${fmt.big(S.account.capital)} ₺ bakiye, işlem başına güncel bakiyenin %${F1.format((u.risk ?? S.account.risk) * 100)}'i risk; pozisyon boştaki nakdi aşarsa sinyal kaçar">Bakiye: nakitle sınırlı</th>
    <th title="Aynı hesap, nakitten bağımsız bütün sinyallere girilirse">Bakiye: sınırsız</th></tr></thead><tbody>
    ${S.tierSets.map(name => vs.map((v, i) => { const st = u.stats?.[tfSel]?.[name]?.[v] || {}, ac = u.accounts?.[tfSel]?.[name]?.[v]; return `<tr class="${name === tierSel ? 'sel' : ''}">
      ${i === 0 ? `<td class="tk" rowspan="${vs.length}">${esc(name)}</td>` : ''}<td class="txt">${esc(u.variants[v])}${v === u.defaultV ? ' <small class="muted">(varsayılan)</small>' : ''}</td>
      <td>${st.n ?? 0}</td><td>${ok(st.win) ? '%' + Math.round(st.win * 100) : '—'}</td><td>${isNaN(+v) ? '—' : ok(st.tp) ? '%' + Math.round(st.tp * 100) : '—'}</td>
      <td class="${cls(st.avgR)}">${rFmt(st.avgR)}</td><td class="muted">${rFmt(st.randR)}</td>
      <td class="${cls(st.sumR)}">${tl(ok(st.sumR) ? st.sumR * R_TL : null)}</td><td>${st.streak ?? '—'}</td>
      ${acctCell(ac, S.account, ac ? missNote(ac) : '')}${acctCell(ac?.u, S.account, expNote(ac?.u))}</tr>`; }).join('')).join('')}
  </tbody></table></div>`;
}

function yearsTable(S, u) {
  const tierSel = curTier(S), st = u.stats?.[tfSel]?.[tierSel]?.[u.defaultV], st3 = u.stats?.[tfSel]?.[tierSel]?.['3'];
  const ys = Object.keys(st?.byYear || {});
  if (!ys.length) return '';
  const row = (lab, s, f) => `<tr><td class="tk">${lab}</td>${ys.map(y => { const d = s?.byYear?.[y]; return d ? f(d) : '<td>—</td>'; }).join('')}</tr>`;
  return `<h3>Yıllara göre · ${esc(tierSel)}</h3><div class="sigyearwrap"><table class="grid sigyears"><thead><tr><th class="tk"></th>${ys.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>
    ${row('İşlem', st, d => `<td>${d.n}</td>`)}
    ${row('Kârlı', st, d => `<td>%${Math.round(d.win * 100)}</td>`)}
    ${row(`Ort. (${esc(u.variants[u.defaultV])})`, st, d => `<td class="${cls(d.avgR)}">${rFmt(d.avgR)}</td>`)}
    ${row(`Toplam (${esc(u.variants[u.defaultV])})`, st, d => `<td class="${cls(d.sumR)}">${tl(d.sumR * R_TL)}</td>`)}
    ${u.defaultV === '3' || !st3 ? '' : row('Toplam (sabit 3R)', st3, d => `<td class="${cls(d.sumR)}">${tl(d.sumR * R_TL)}</td>`)}
  </tbody></table></div>`;
}

function accountHtml(S, u) {
  const tierSel = curTier(S), a = u.accounts?.[tfSel]?.[tierSel]?.[u.defaultV], A = S.account, b = S.bench;
  if (!a || !A) return '';
  const lim = a, un = a.u, r = F1.format((u.risk ?? A.risk) * 100);
  const line = (x) => `<b class="${cls(x.final - A.capital)}">${tlFinal(x.final)}</b> (yıllık <span class="${cls(x.cagr)}">${fmt.pct(x.cagr)}</span>, en büyük düşüş <span class="down">−%${Math.round(x.mdd * 100)}</span>)`;
  return `<div class="sigacct"><b>${fmt.big(A.capital)} ₺ bakiyeyle ne olurdu?</b> ${esc(tierSel)}, ${tfSel === '4H' ? '4 saatlik mumlar' : 'günlük mumlar'}, ${esc(u.variants[u.defaultV]).toLocaleLowerCase('tr')};
    her işlemde güncel bakiyenin %${r}'i risk (bakiye kazandıkça büyür, kaybettikçe küçülür), ${a.years} yıl:
    <ul class="acct2">
      <li><span class="muted">Nakitle sınırlı:</span> ${line(lim)} · ${lim.taken} işlem${lim.missed ? `, ${lim.missed} sinyal nakit yetmediği için kaçtı` : ', kaçan sinyal yok'}</li>
      ${un ? `<li><span class="muted">Sınırsız (bütün sinyaller):</span> ${line(un)} · ${un.taken} işlem, aynı anda açık pozisyonlar en çok bakiyenin ${F1.format(un.maxExp)} katı${un.maxExp > 1 ? ' (kaldıraç gerekirdi)' : ''}</li>` : ''}
    </ul>
    <span class="muted">Boşta kalan nakde faiz eklenmedi; para piyasası fonunda değerlendirilen nakit toplam getiriyi belirgin artırır.
    ${b ? `Aynı dönemde BIST 100 al-tut: yıllık ${fmt.pct(b.cagr)}, en büyük düşüş −%${Math.round(b.mdd * 100)}.` : ''}</span></div>`;
}

const curTier = S => S.tierSets.includes(state.sigTier) ? state.sigTier : S.defaultSet;
const curStrat = S => S.strategies.find(u => u.id === state.sigStrat) || null;
const testChip = () => '';

/* Strateji seçimi: Tümü + grup başlıkları (tarama sayfasındaki hazır taramalar gibi); başlığa dokununca stratejiler açılır */
let openGroup;
function stratBar(S, nAct) {
  const cur = curStrat(S);
  if (openGroup === undefined) openGroup = cur?.group ?? null;
  const groups = [...new Set(S.strategies.map(u => u.group))];
  const btn = (u) => `<button type="button" data-sigs="${u.id}" aria-pressed="${cur?.id === u.id}" title="${esc(u.short || u.summary || '')}">${esc(u.name)}<span class="n">${u.kind === 'portfolio' ? u.pf.holdings.length : nAct(u.id)}</span></button>`;
  return `<div class="presets" role="group" aria-label="Stratejiler">
      <button type="button" data-sigs="" aria-pressed="${!cur}">Tüm stratejiler<span class="n">${nAct(null)}</span></button>
      ${groups.map(g => { const sel = cur?.group === g, name = S.groups?.[g] || g;
        return `<button type="button" class="grp${sel ? ' sel' : ''}" data-siggrp="${esc(g)}" aria-expanded="${openGroup === g}">${esc(name)}${sel ? `: <b>${esc(cur.name)}</b>` : `<span class="n">${S.strategies.filter(u => u.group === g).length}</span>`} <span class="car" aria-hidden="true">▾</span></button>`; }).join('')}
    </div>
    ${openGroup ? `<div class="presets sub" role="group">${S.strategies.filter(u => u.group === openGroup).map(btn).join('')}</div>` : ''}`;
}

/* Tüm stratejiler: karşılaştırma tablosu (günlük test, seçili endeks grubu, her stratejinin varsayılan çıkışı) */
function overviewHtml(S) {
  const tier = curTier(S), A = S.account;
  const tfName = tf => tf === '4H' ? '4 saat' : 'Günlük';
  // Her strateji × periyot ayrı satır: veriler (test, hesap, açık sinyal) periyoda göre ayrışır
  const rows = S.strategies.flatMap(u => u.tfs.map(tf => ({ u, tf })));
  return `<section class="panel"><h2>Stratejiler <span class="muted" style="font-weight:400">· ${S.strategies.length} · test: ${esc(tier)}, varsayılan çıkış</span></h2>
    <div class="tablewrap flat"><table class="grid sigtable cards c-ov"><thead><tr><th class="tk">Strateji</th><th class="txt">Periyot</th><th title="Bu periyotta şu an açık sinyal">Açık</th>
      <th title="Testteki işlem sayısı">İşlem</th><th title="Kârla kapanan işlemlerin oranı">Kârlı</th><th title="İşlem başına ortalama sonuç">Ort.</th>
      <th title="Aynı hisselerde rastgele girişin ortalaması (aynı stop ve çıkış)">Rastgele</th><th class="txt" title="Sonuç birkaç büyük işleme mi bağlı? Altında en iyi ve en kötü %5 işlem hariç ortalama (BIST TÜM, varsayılan çıkış, son 4 yıl)">Sağlamlık</th><th title="${fmt.big(A.capital)} ₺ ile başlanır; her işlemde güncel bakiyenin stratejiye ait risk oranı kadar riske edilir. Pozisyon boştaki nakdi aşarsa işlem açılamaz, sinyal kaçar.">Bakiye<small class="sub2">nakitle sınırlı</small></th>
      <th title="Aynı hesap, ama nakitten bağımsız bütün sinyallere girilir (gerekirse kaldıraçla). Strateji sinyallerinin tamamının değerini gösterir.">Bakiye<small class="sub2">sınırsız</small></th></tr></thead><tbody>
      ${rows.map(({ u, tf }) => { if (u.kind === 'portfolio') return pfRow(u, A);
        const st = u.stats?.[tf]?.[tier]?.[u.defaultV] || {}, ac = u.accounts?.[tf]?.[tier]?.[u.defaultV];
        const nOpen = S.active.filter(a => (TIER_OF[tier] || []).includes(a.idx) && a.k === u.id && (a.tf || '1D') === tf).length;
        return `<tr data-sigs="${u.id}" data-sigrowtf="${tf}"><td class="tk"><b>${esc(u.name)}</b>${u.tfs.length > 1 ? ` <span class="muted">· ${tfName(tf)}</span>` : ''}${testChip(u)}<small class="sub2">${esc(u.short || '')} · <span title="Hesap simülasyonunda işlem başına güncel bakiyenin riske edilen oranı">%${F1.format((u.risk ?? A.risk) * 100)} risk</span></small></td>
          <td class="txt c-tf">${tfChip(tf)}</td><td data-l="Açık sinyal">${nOpen}</td><td data-l="Testteki işlem">${st.n ?? 0}</td><td data-l="Kârlı">${ok(st.win) ? '%' + Math.round(st.win * 100) : '—'}</td>
          <td class="${cls(st.avgR)}" data-l="İşlem başına">${rFmt(st.avgR)}</td><td class="muted" data-l="Rastgele giriş">${rFmt(st.randR)}</td>
          <td class="txt c-rob" data-l="Sağlamlık">${u.robust?.[tf] ? `${profChip(u.robust[tf])}<small class="sub2" title="En iyi ve en kötü %5 hariç ortalama · medyan">kırpılmış ${rFmt(u.robust[tf].tm)} · medyan ${rFmt(u.robust[tf].med)}</small>` : '—'}</td>
          ${acctCell(ac, A, ac ? missNote(ac) : '', 'Bakiye · nakitle sınırlı')}${acctCell(ac?.u, A, expNote(ac?.u), 'Bakiye · sınırsız')}</tr>`; }).join('')}
    </tbody></table></div>
    ${info(`Her strateji aynı motorla test edilir: 20 mn ₺ hacim filtresi, stop mesafesi %0,5–%15, gidiş-dönüş %0,2 maliyet, aynı hissede önceki işlem kapanmadan yeni işlem yok, rastgele giriş kıyası ve hesap simülasyonu.
      Bakiye sütunları: testin başında ${fmt.big(A.capital)} ₺ ile başlanır; her işlemde güncel bakiyenin stratejiye ait risk oranı kadar riske edilir, bakiye kazandıkça büyür, kaybettikçe küçülür (açık pozisyonlar maliyetle, boştaki nakde faiz yok).
      <b>Nakitle sınırlı</b>: pozisyon boştaki nakdi aşıyorsa işlem açılamaz ve sinyal kaçar; gerçek bir hesabın sonucu. <b>Sınırsız</b>: nakitten bağımsız bütün sinyallere girilir; "×" aynı anda açık pozisyonların toplamının bakiyeye oranının en yükseğidir (1'in üstü kaldıraç gerektirir). İkisi arasındaki fark kaçan sinyallerin etkisidir.
      4 saatlik test, verinin izin verdiği son ~2,8 yılı kapsar; günlükle süre farkına dikkat edin. Satıra dokununca stratejinin sinyalleri, kuralları ve ayrıntılı test sonuçları açılır.`, 'Nasıl karşılaştırılır?')}
  </section>`;
}

function strategyCard(S, u, open = cardOpen) {
  const tier = curTier(S);
  if (!u.tfs.includes(tfSel)) tfSel = u.tfs[0];
  const dst = u.stats?.['1D']?.[tier]?.[u.defaultV], dac = u.accounts?.['1D']?.[tier]?.[u.defaultV];
  const brief = dst ? `Günlük test (${esc(tier)}): %${Math.round(dst.win * 100)} kârlı · işlem başına ${rFmt(dst.avgR)}${dac ? ` · hesap yıllık ${fmt.pct(dac.cagr)}` : ''}` : '';
  return `<details class="panel sigcard"${open ? ' open' : ''}>
    <summary><h2>${esc(u.name)} · kurallar ve test sonuçları</h2><span class="muted">${brief}</span></summary>
    <p class="muted" style="margin:0 0 8px">${esc(u.summary || '')}</p>
    <ul class="sigrules">${(u.rules || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    <h3>Geriye dönük test</h3>
    ${u.tfs.length > 1 ? `<div class="seg" role="group" aria-label="Zaman dilimi" style="margin-bottom:8px">${u.tfs.map(k =>
      `<button type="button" data-sigtf="${k}" aria-pressed="${tfSel === k}">${esc(S.timeframes?.[k]?.name || k)}</button>`).join('')}</div>` : ''}
    <p class="muted" style="font-size:12px;margin:0 0 8px">${u.tfs.length === 1 && tfSel === '1D' ? 'Yalnızca günlük mumlar, son 4 yıl. En fazla 60 işlem günü.' : tfSel === '4H' ? '4 saatlik mumlar: günde iki mum (13:30 ve kapanış); saatlik veri son ~2 yıl için mevcut. En fazla 120 mum (≈60 işlem günü).' : 'Günlük mumlar, son 4 yıl. En fazla 60 işlem günü.'}</p>
    ${statsTable(S, u)}
    ${yearsTable(S, u)}
    ${accountHtml(S, u)}
    ${robustHtml(S, u)}
    ${u.notes?.length ? `<h3>Bilmeniz gerekenler</h3><ul class="sigrules">${u.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <p class="note-fx">Kurallar son 4 yılda aynı kodla geriye dönük test edildi. Geçmiş başarı geleceği garanti etmez (test bugünkü endeks bileşenleriyle yapıldı).
      Yatırım tavsiyesi değildir; testteki hesap işlem başına bakiyenin %${F1.format((u.risk ?? S.account.risk) * 100)}'ini riske eder.</p>
  </details>`;
}


/* Kurulum çizimi: hisse koduna gelince (fare) ya da basılı tutunca (dokunmatik) açılan pencere.
   Kayıt bir çözücüden gelir: sinyal sayfasında mevcut kayıtlar, trade arşivinde gerektiğinde yüklenen mumlar (bkz. archive.js). */
let PV = null, pvTimer = null, pvSuppress = false, pvToken = 0;
function pvRec(tr) { const [k, i] = (tr?.dataset.pv || '').split(':'); return PV?.[k]?.[+i] || null; }
function pvHtml(a, u) {
  const kind = ok(a.trig) ? 'Hazırlanan kurulum' : ok(a.x) ? 'Sonuçlanan sinyal' : 'Açık sinyal';
  return `<div class="pvhead"><b>${esc(a.t)}</b> ${tfChip(a.tf)} <span>${esc(u?.name || a.k)}</span> <span class="muted">· ${kind}</span>
      <button type="button" class="pvclose" aria-label="Kapat">✕</button></div>
    ${a.nobars ? `<p class="muted">${esc(a.nobars)}</p>` : setupSvg(a, u)}${setupFacts(a)}<p class="pvfoot muted">Sinyalden önceki 6 mum ve sonrası · ▲ sinyal mumu · ayrıntı için hisseye dokunun</p>`;
}
async function pvShow(tr, sheet, resolve) {
  const tok = ++pvToken;
  const res = await resolve(tr);
  if (!res || tok !== pvToken) return;               // bu arada fare ayrıldıysa ya da başka satıra geçildiyse gösterme
  let el = document.getElementById('pvPop');
  if (!el) { el = Object.assign(document.createElement('div'), { id: 'pvPop', className: 'pvpop' }); document.body.append(el);
    el.addEventListener('click', e => { if (e.target.closest('.pvclose')) pvHide(); }); }
  el.innerHTML = pvHtml(res.a, res.u);
  el.classList.toggle('sheet', !!sheet); el.hidden = false;
  if (sheet) window.getSelection()?.removeAllRanges();   // basılı tutarken oluşmuş metin seçimini temizle
  if (!sheet) {
    const r = tr.querySelector('td.tk').getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let x = r.right + 12, y = r.top - 20;
    if (x + w > innerWidth - 8) x = Math.max(8, r.left - w - 12);
    y = Math.max(8, Math.min(y, innerHeight - h - 8));
    el.style.left = `${x}px`; el.style.top = `${y}px`;
  } else { el.style.left = el.style.top = ''; }
}
function pvHide() { clearTimeout(pvTimer); pvToken++; const el = document.getElementById('pvPop'); if (el) el.hidden = true; }
/* root içindeki tr[data-pv] satırlarının hisse hücresine pencere bağlar. resolve(tr) → {a, u} ya da Promise (kayıt, strateji) */
export function bindPreview(root, resolve) {
  root.querySelectorAll('tr[data-pv] td.tk').forEach(td => {
    const tr = td.parentElement;
    td.classList.add('pvable');
    td.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches) { clearTimeout(pvTimer); pvTimer = setTimeout(() => pvShow(tr, false, resolve), 180); } });
    td.addEventListener('mouseleave', () => { if (matchMedia('(hover: hover)').matches) pvHide(); });
    td.addEventListener('touchstart', () => { clearTimeout(pvTimer); pvTimer = setTimeout(() => { pvSuppress = true; pvShow(tr, true, resolve); navigator.vibrate?.(15); }, 450); }, { passive: true });
    td.addEventListener('touchend', () => clearTimeout(pvTimer), { passive: true });
    td.addEventListener('touchmove', () => clearTimeout(pvTimer), { passive: true });
    td.addEventListener('contextmenu', e => { if (pvSuppress) e.preventDefault(); });
  });
}
const sigResolve = tr => { const a = pvRec(tr); return a ? { a, u: PV.S.strategies.find(x => x.id === a.k) } : null; };
// Basılı tutma ardından gelen dokunuş hisse sayfasına gitmesin
view.addEventListener('click', e => { if (pvSuppress) { pvSuppress = false; e.preventDefault(); e.stopPropagation(); } }, { capture: true });
addEventListener('hashchange', pvHide);
addEventListener('scroll', () => { const el = document.getElementById('pvPop'); if (el && !el.hidden && !el.classList.contains('sheet')) pvHide(); }, { passive: true });
document.addEventListener('click', e => { const el = document.getElementById('pvPop'); if (el?.classList.contains('sheet') && !el.hidden && !e.target.closest('#pvPop') && !pvSuppress) pvHide(); });

function bindCommon(S) {
  bindPreview(view, sigResolve);
  view.querySelector('.sigcard')?.addEventListener('toggle', e => { cardOpen = e.target.open; });
  view.querySelectorAll('[data-sigt]').forEach(b => b.addEventListener('click', () => { state.sigTier = b.dataset.sigt; persist(); renderSignals(); }));
  view.querySelectorAll('[data-sigtf]').forEach(b => b.addEventListener('click', () => { tfSel = b.dataset.sigtf; renderSignals(); }));
  view.querySelectorAll('[data-stab]').forEach(b => b.addEventListener('click', () => {
    sigTab = b.dataset.stab;
    view.querySelectorAll('[data-stab]').forEach(x => x.setAttribute('aria-selected', x === b));
    view.querySelectorAll('[data-spane]').forEach(x => { x.hidden = x.dataset.spane !== sigTab; });
  }));
  view.querySelectorAll('[data-siggrp]').forEach(b => b.addEventListener('click', () => { openGroup = openGroup === b.dataset.siggrp ? null : b.dataset.siggrp; renderSignals(); }));
  view.querySelectorAll('[data-sigs]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    state.sigStrat = b.dataset.sigs || null; persist();
    if (b.dataset.sigrowtf) { tfSel = b.dataset.sigrowtf; cardOpen = true; sigTab = 'perf'; }
    const nu = curStrat(S); if (!nu) openGroup = null; else openGroup = nu.group;
    renderSignals(); window.scrollTo(0, 0);
  }));
}

export async function renderSignals() {
  destroyCharts();
  if (location.hash.startsWith('#/sinyal/arsiv')) return renderArchive();
  document.title = 'Sinyaller · Tahta';
  if (!SIG) view.innerHTML = '<p class="empty">Yükleniyor…</p>';
  let S;
  try { S = await loadSignals(); } catch { view.innerHTML = '<p class="empty">Sinyal verisi henüz yok; bir sonraki güncellemede oluşacak.</p>'; return; }
  if (!location.hash.startsWith('#/sinyal')) return;
  if (!S.strategies?.length) { view.innerHTML = '<p class="empty">Sinyal verisi yenileniyor; bir sonraki güncellemede gelecek.</p>'; return; }
  const tierSel = curTier(S), u = curStrat(S), P = S.params;
  const sigStrats = S.strategies.filter(x => x.kind !== 'portfolio');
  const inSet = a => (TIER_OF[tierSel] || []).includes(a.idx) && (!u || a.k === u.id);
  const nAct = id => S.active.filter(a => (TIER_OF[tierSel] || []).includes(a.idx) && (!id || a.k === id)).length;
  const act = S.active.filter(inSet), rec = S.recent.filter(inSet), cand = (S.candidates || []).filter(inSet);
  PV = { act, cand, rec, S };
  const name = id => S.strategies.find(x => x.id === id)?.name || id;
  const many = !u && sigStrats.length > 1;
  const stratCol = a => many ? `<td class="txt c-st">${esc(name(a.k))}</td>` : '';
  const stratTh = many ? '<th class="txt">Strateji</th>' : '';
  const hasCand = u ? u.candidates : sigStrats.some(x => x.candidates);
  if (sigTab === 'hazir' && !hasCand) sigTab = 'acik';
  const tab = sigTab;
  if (u?.kind === 'portfolio') {
    view.innerHTML = `<section class="dhead"><div><h1>Sinyaller</h1><p class="sub">${esc(u.name)}${testChip(u)}: ${esc(u.summary || '')}</p></div><a class="btn dhead-act" href="#/sinyal/arsiv" title="Stratejilerin geçmiş bütün işlemleri, filtrelenebilir">İşlem arşivi</a></section>
      ${stratBar(S, nAct)}${portfolioView(S, u)}`;
    bindCommon(S);
    return;
  }
  view.innerHTML = `
  <section class="dhead"><div><h1>Sinyaller</h1>
    <p class="sub">${u ? `${esc(u.name)}${testChip(u)}: ${esc(u.summary || '')}` : `${S.strategies.length} strateji · aynı motorla test edilir; bir stratejiyi seçerek yalnızca onun sinyallerini görün`}</p></div><a class="btn dhead-act" href="#/sinyal/arsiv" title="Stratejilerin geçmiş bütün işlemleri, filtrelenebilir">İşlem arşivi</a></section>
  ${S.strategies.length > 1 || Object.keys(S.groups || {}).length ? stratBar(S, nAct) : ''}
  <div class="presets tiers" role="group" aria-label="Endeks"><span class="lbl">Endeks</span>
    ${S.tierSets.map(n => `<button type="button" data-sigt="${esc(n)}" aria-pressed="${tierSel === n}">${esc(n)} <span class="n">${S.active.filter(a => TIER_OF[n].includes(a.idx) && (!u || a.k === u.id)).length}</span></button>`).join('')}
  </div>

  ${regimeHtml(S)}
  <nav class="dtabs stabs" role="tablist" aria-label="Sinyal bölümleri">${[['acik', 'Açık', act.length], ...(hasCand ? [['hazir', 'Hazırlanan', cand.length]] : []), ['sonuc', 'Sonuçlanan', rec.length], ['perf', u ? 'Kurallar ve test' : 'Performans', null]]
    .map(([k, l, n]) => `<button type="button" role="tab" data-stab="${k}" aria-selected="${tab === k}">${l}${n != null ? ` <span class="n">${n}</span>` : ''}</button>`).join('')}</nav>

  <section class="panel" data-spane="acik"${tab === 'acik' ? '' : ' hidden'}>
    <h2>Açık sinyaller <span class="muted" style="font-weight:400">· ${act.length} sinyal${act.length ? ` · ${new Set(act.map(a => a.t)).size} hisse` : ''}</span></h2>
    <div class="sigterms">${info(`<b>R</b> = giriş − stop (risk birimi). Örnek: bakiye 100.000 ₺, işlem başına %1 risk = 1R = 1.000 ₺; stop %5 aşağıdaysa pozisyon 20.000 ₺ olur. Testteki hesap morning star'da bakiyenin %1'ini, Donchian'da %0,5'ini riske eder. Giriş sinyal mumunun kapanışında yapılır. Takip eden stopta fiyat +1R'ye ulaşınca stop, o güne kadar görülen en yüksek fiyatın 1R altına çekilir ve yalnızca yukarı taşınır.
      Pozisyon en fazla ${P.hold} işlem günü (4 saatlikte 120 mum) tutulur; testte gidiş-dönüş %${F1.format(P.cost * 100)} maliyet düşülür; 20 günlük ortalama işlem hacmi
      ${fmt.big(P.minTurnover)} ₺ altındaki hisseler alınmaz. <b>Günlük</b> / <b>4 saat</b>: sinyalin oluştuğu mum periyodu (4 saatlik mumlar 13:30'da ve kapanışta biter). <b>Güncel</b>: girişten bu yana sonuç, R cinsinden (+1R = riske edilen tutar kadar kâr). <b>BIST 100 dışı</b>: BIST 100'e girmeyen, BIST TÜM'deki hisse. <b>Hacim</b>: sinyal mumunun hacminin 20 mumluk ortalamaya oranı.`, 'R, stop ve kısaltmalar')}</div>
    ${act.length ? `<div class="tablewrap flat"><table class="grid sigtable cards c-act"><thead><tr>
      <th class="tk" title="Günlük ya da 4 saatlik mumlarla">Hisse</th>${stratTh}<th title="Sinyal mumunun kapanışı (4 saatlikte mumun bitiş saati)">Sinyal</th><th title="Sinyal mumunun kapanışı">Giriş</th>
      <th title="Takip başlamadıysa başlangıç stopu ve altında takibin başlayacağı seviye; başladıysa güncel takip stopu">Stop</th>
      <th>Son fiyat</th><th title="Girişe göre güncel sonuç, R cinsinden">Güncel</th><th class="txt">Not</th></tr></thead><tbody>
      ${act.map((a, i) => `<tr data-t="${a.t}" data-pv="act:${i}">${tk(a)}${stratCol(a)}<td class="c-d" data-l="Sinyal">${dfmt(a.d)}</td><td class="c-e" data-l="Giriş">${fmt.price(a.e)}</td>
        <td class="c-s" data-l="Stop">${a.info?.ns ? `<span class="muted" title="Bu stratejide stop yok; işlem son gün kapanışında kapanır. 1R (pozisyon büyüklüğü için) = ${fmt.price(a.e - a.s0)} ₺">stop yok</span><small class="sub2">çıkış: ${dm(prevBday(a.info.exd))} kapanış</small>` : a.armed ? `<b>${fmt.price(a.s)}</b> <span class="chip up">takipte</span>`
          : `${fmt.price(a.s0)} <small class="down">${fmt.pct(pctFrom(a.s0, a.e))}</small>${a.info?.exd ? `<small class="sub2" title="Temettü hakkı olan son günün kapanışında çıkılır (hak kullanım ${fmt.date(a.info.exd)})">çıkış: ${dm(prevBday(a.info.exd))} kapanış</small>` : a.info?.hold && a.bars ? `<small class="sub2" title="Sinyalden sonraki ${a.info.hold}. işlem gününün kapanışında çıkılır">çıkış: ${Math.max(0, a.info.hold - (a.bars.d.length - 1 - a.bars.i))} işlem günü sonra kapanış</small>` : a.xl > a.s ? `<small class="sub2" title="Kanal çıkışı: kapanış bu seviyenin (son 10 günün en düşüğü) altına inerse çıkılır">çıkış: kapanış &lt; ${fmt.price(a.xl)}</small>` : a.xl ? '<small class="sub2" title="Kanal çıkış seviyesi (son 10 günün en düşüğü) şu an stopun altında; önce stop geçerli">kanal çıkışı stopun altında</small>' : a.a ? `<small class="sub2">+1R: ${fmt.price(a.a)} <span class="up">${fmt.pct(pctFrom(a.a, a.e))}</span></small>` : ''}`}</td>
        <td class="c-c" data-l="Son fiyat">${fmt.price(a.c)}</td><td class="c-r ${cls(a.r)}" data-l="Güncel">${rFmt(a.r)}</td>
        <td class="txt c-n">${a.tedbir ? '<span class="chip warn">⚠ Tedbir</span> ' : ''}${a.info?.fvg ? `<span class="chip" title="Geri çekilmenin tutunduğu yükseliş FVG'si">FVG ${fmt.price(a.info.fvg[0])}–${fmt.price(a.info.fvg[1])}</span> ` : ''}${a.info?.lock ? `<span class="chip" title="Sinyal günü tavanda kapandığı için beklendi; tavanda kapanmadığı ilk günün kapanışında girildi">tavan sonrası (${a.info.lock} gün)</span> ` : ''}${a.info?.re ? `<span class="chip warn" title="Yeniden giriş: ilk işlem stop olduktan sonra kapanış ilk girişin üstüne döndüğü için bir kez daha girildi; stop çıkıştan bu yana en düşük fiyatın altında">yeniden giriş</span> ` : ''}${a.info?.zone2 ? `<span class="chip" title="Kırılan kararsız bölge: düşüş yapısından sonraki daralmanın dibi–tepesi">Bölge ${fmt.price(a.info.zone2[0])}–${fmt.price(a.info.zone2[1])}</span> ` : ''}${a.info?.box ? `<span class="chip" title="Kırılan sıkışma kutusu (önceki 40 günün dibi–tepesi)">Kutu ${fmt.price(a.info.box[0])}–${fmt.price(a.info.box[1])}</span> ` : ''}${a.info?.avwap ? `<span class="chip" title="Tepeden çapalı VWAP: 1 yıllık tepe (${fmt.price(a.info.peak)}) gününden bu yana alanların ortalama maliyeti">Tepe VWAP ${fmt.price(a.info.avwap)}</span> ` : ''}${a.info?.sma200 ? `<span class="chip" title="Sinyal günündeki 200 günlük ortalama">SMA200 ${fmt.price(a.info.sma200)}</span> ` : ''}${a.info?.y ? `<span class="chip up" title="Brüt temettü / giriş fiyatı · hak kullanım ${fmt.date(a.info.exd)}">temettü %${F1.format(a.info.y * 100)}</span> ` : ''}<span class="muted" title="Sinyal mumunun hacmi / 20 mumluk ortalama (bilgi amaçlı)">${IDX_LABEL[a.idx] || ''}${ok(a.volx) ? ` · hacim ortalamanın ${F1.format(a.volx)} katı` : ''}</span></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu seçimde şu an açık sinyal yok.</p>'}
  </section>

  ${hasCand ? `<section class="panel" data-spane="hazir"${tab === 'hazir' ? '' : ' hidden'}>
    <h2>Hazırlanan kurulumlar <span class="muted" style="font-weight:400">· ${cand.length}</span></h2>
    <p class="muted" style="font-size:13px;margin:0 0 8px">Sinyal değildir: kurulumun son koşulu gerçekleşince (fiyat kurulumlarında bir sonraki mumun <b>tetiğin üstünde kapanması</b>, temettüde giriş gününün gelmesi) sinyal oluşur.</p>
    ${cand.length ? `<div class="tablewrap flat"><table class="grid sigtable cards c-cand"><thead><tr>
      <th class="tk" title="Günlük ya da 4 saatlik mumlarla">Hisse</th>${stratTh}<th title="Kurulumu oluşturan mumlar">Mumlar</th><th>Son kapanış</th>
      <th title="Bir sonraki mumun kapanışı bu seviyenin üstünde olmalı">Tetik (kapanış &gt;)</th><th title="Son kapanışa göre gereken yükseliş">Gereken</th>
      <th title="Tahmini stop; parantez içinde tetikten girişteki risk">Tahmini stop</th>
      <th class="txt">Not</th></tr></thead><tbody>
      ${cand.map((a, i) => a.info?.exd ? `<tr data-t="${a.t}" data-pv="cand:${i}">${tk(a)}${stratCol(a)}
        <td class="c-m" data-l="Hak kullanım" title="Hak kullanım (temettü düşülen) günü">hak kullanım ${dm(a.info.exd)}</td><td class="c-c" data-l="Son kapanış">${fmt.price(a.c)}</td>
        <td class="c-t" data-l="Giriş günü" title="Tahmini giriş günü (kapanışta)"><b>giriş ${dm(a.info.entry)}</b></td><td class="c-g" data-l="Kalan">${a.info.in} gün</td>
        <td class="c-s" data-l="Tahmini stop">${a.info.ns ? `<span class="muted" title="Stop yok; pozisyon büyüklüğü için 1R = %${F1.format(a.risk * 100)}">stop yok · 1R %${F1.format(a.risk * 100)}</span>` : `${fmt.price(a.s)} <small class="muted">(%${F1.format(a.risk * 100)})</small>`}</td>
        <td class="txt c-n"><span class="chip up" title="Brüt temettü / son kapanış">temettü %${F1.format(a.info.y * 100)}</span> <span class="muted">${IDX_LABEL[a.idx] || ''}</span></td></tr>`
      : `<tr data-t="${a.t}" data-pv="cand:${i}">${tk(a)}${stratCol(a)}
        <td class="c-m" data-l="Mumlar">${a.tf === '4H' ? `${dfmt(a.d1)} · ${dfmt(a.d2).slice(-5)}` : `${fmt.date(a.d1).slice(0, 5)} · ${fmt.date(a.d2).slice(0, 5)}`}</td><td class="c-c" data-l="Son kapanış">${fmt.price(a.c)}</td>
        <td class="c-t" data-l="Tetik (kapanış >)"><b>${fmt.price(a.eff)}</b></td><td class="c-g up" data-l="Gereken">${fmt.pct(a.dist)}</td>
        <td class="c-s" data-l="Tahmini stop">${fmt.price(a.s)} <small class="muted">(%${F1.format(a.risk * 100)})</small></td>
        <td class="txt c-n">${a.fvg ? `<span class="chip warn" title="Doldurulmamış düşüş FVG'si: ${fmt.price(a.fvg[0])}–${fmt.price(a.fvg[1])}. Kapanış bu boşluğun altında kalırsa sinyal oluşmaz.">FVG: tetik ${fmt.price(a.trig)} → ${fmt.price(a.eff)}</span> ` : ''}${a.info?.lock ? `<span class="chip warn" title="Sinyal oluştu ama hisse tavanda kapandı: tavanda kapanmadığı ilk günün kapanışında giriş; 3 gün üst üste tavanda kalırsa sinyal iptal">tavanda · ${a.info.lock}. gün</span> ` : ''}${a.info?.zone ? `<span class="chip" title="Fiyatın geri çekildiği yükseliş FVG'si (destek bölgesi)">FVG ${fmt.price(a.info.zone[0])}–${fmt.price(a.info.zone[1])}</span> ` : ''}<span class="muted">${IDX_LABEL[a.idx] || ''}</span></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu seçimde şu an hazırlanan kurulum yok.</p>'}
    ${info(`${S.strategies.filter(x => x.candidates && x.candNote && (!u || x.id === u.id)).map(x => `<b>${esc(x.name)}:</b> ${esc(x.candNote)}`).join('<br>')}
      ${u?.candMaxDist ? `<br>Tetiğe uzaklığı %${Math.round(u.candMaxDist * 100)}'ya kadar olanlar, yakından uzağa sıralı.` : ''} Kullanım: seansın son dakikalarında fiyat tetiğin üstündeyse kapanışta girilir.
      Kesin stop kapanıştan sonra belirlenir (açık sinyaller tablosunda görünür). Test sonuçları yalnızca tamamlanmış kurulumlar için geçerlidir.`, 'Nasıl kullanılır?')}
  </section>` : ''}

  <section class="panel" data-spane="sonuc"${tab === 'sonuc' ? '' : ' hidden'}>
    <h2>Son 60 günün sonuçlanan sinyalleri <span class="muted" style="font-weight:400">· ${rec.length}</span></h2>
    ${rec.length ? `<div class="tablewrap flat"><table class="grid sigtable cards c-rec"><thead><tr><th class="tk">Hisse</th>${stratTh}<th>Sinyal</th>
      <th>Giriş</th><th class="txt">Çıkış nedeni</th><th>Çıkış fiyatı</th><th>Çıkış</th><th>Sonuç</th></tr></thead><tbody>
      ${rec.map((a, i) => `<tr data-t="${a.t}" data-pv="rec:${i}">${tk(a)}${stratCol(a)}<td class="c-d" data-l="Sinyal">${dfmt(a.d)}</td>
        <td class="c-e" data-l="Giriş">${fmt.price(a.e)}</td><td class="txt c-w" data-l="Çıkış nedeni">${chip(a.st)}</td><td class="c-x" data-l="Çıkış fiyatı">${fmt.price(a.x)}</td>
        <td class="c-xd" data-l="Çıkış">${dfmt(a.xd)}</td><td class="c-r ${cls(a.r)}" data-l="Sonuç">${rFmt(a.r)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu seçimde son 60 günde sonuçlanan sinyal yok.</p>'}
    <p class="muted" style="font-size:12px;margin:10px 0 0">Daha eski işlemler için <a href="#/sinyal/arsiv">İşlem arşivi</a>.</p>
  </section>

  <div data-spane="perf"${tab === 'perf' ? '' : ' hidden'}>${u ? strategyCard(S, u, true) : overviewHtml(S)}</div>`;
  bindCommon(S);
}
