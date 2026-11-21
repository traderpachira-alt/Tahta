import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { F1, F2, cls, esc, fmt, info, ok } from './util.js';

/* ============================================================
   Sinyaller: morning star kurulumu (giriş / stop / hedef) ve geriye dönük test
   Veri: data/signals.json (scripts/signals.py, her güncellemede yeniden üretilir)
   ============================================================ */
let SIG = null, tierSel = null, tfSel = '1D', cardOpen = false;
// Tarih: günlük 'YYYY-MM-DD', 4 saatlik 'YYYY-MM-DD HH:MM'
const dfmt = d => { if (!d) return '—'; const [day, time] = d.split(' '); return time ? `${fmt.date(day).slice(0, 5)} ${time}` : fmt.date(day); };
const tk = a => `<td class="tk"><a class="code" href="#/h/${a.t}">${a.t}</a> ${tfChip(a.tf)}</td>`;
const tfChip = tf => tf === '4H' ? '<span class="chip tf4" title="4 saatlik mumlar">4S</span>' : '<span class="chip" title="Günlük mumlar">1G</span>';
const STATS = (S, tf) => S.timeframes ? S.stats?.[tf] : S.stats;           // eski veri biçimiyle uyumlu
const ACCTS = (S, tf) => S.timeframes ? S.accounts?.[tf] : S.accounts;
export async function loadSignals() {
  if (SIG) return SIG;
  const r = await fetch('data/signals.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  SIG = await r.json();
  return SIG;
}
const TIER_OF = { 'BIST 30': ['30'], 'BIST 50': ['30', '50'], 'BIST 100': ['30', '50', '100'], 'BIST TÜM': ['30', '50', '100', 'TÜM'] };
const IDX_LABEL = { 30: 'BIST 30', 50: 'BIST 50', 100: 'BIST 100', TÜM: 'TÜM' };
const rFmt = x => !ok(x) ? '—' : (x > 0 ? '+' : '') + F2.format(x) + 'R';
const usd = x => !ok(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + fmt.big(Math.abs(x)) + ' $';
const pctFrom = (a, b) => ok(a) && ok(b) && b ? a / b - 1 : null;
const STATUS = {
  open: ['Açık', '', 'Giriş sinyal günü kapanışında yapıldı; pozisyon sürüyor'],
  trail: ['Takip stopu', '', 'Fiyat +1R\'yi gördükten sonra takip eden stop çalıştı'],
  tp: ['Hedef', 'up', 'Hedefe ulaştı'],
  stop: ['Stop', 'down', 'Başlangıç stopuna indi (−1R)'],
  time: ['Süre doldu', 'warn', '60 işlem günü doldu, kapanıştan çıkıldı'],
};
const chip = st => { const [l, c, t] = STATUS[st] || [st, '', '']; return `<span class="chip ${c}" title="${esc(t)}">${l}</span>`; };

const VKEYS = S => Object.keys(S.variants);
function statsTable(S) {
  const vs = VKEYS(S);
  return `<div class="tablewrap flat"><table class="grid sigstat"><thead><tr><th class="tk">Evren</th><th class="txt">Çıkış kuralı</th><th>İşlem</th>
    <th title="Kârla kapanan işlemlerin oranı">Kârlı</th><th title="Sabit hedefe ulaşan işlemlerin oranı">Hedefe ulaşan</th>
    <th title="İşlem başına ortalama sonuç (komisyon ve kayma dahil)">Ort.</th><th title="Aynı hisselerde rastgele günlerde, aynı stop yapısı ve çıkış kuralıyla girişin ortalaması">Rastgele giriş</th>
    <th title="1R = 100 $ kabulüyle tüm işlemlerin toplamı">Kümülatif (1R=100 $)</th><th title="Art arda en uzun kayıp serisi">Art arda kayıp</th>
    <th title="1.000.000 ₺, işlem başına %0,5 risk, en fazla 20 pozisyon">Hesap: yıllık / düşüş</th></tr></thead><tbody>
    ${S.tierSets.map(name => vs.map((v, i) => { const st = STATS(S, tfSel)?.[name]?.[v] || {}, ac = ACCTS(S, tfSel)?.[name]?.[v]; return `<tr class="${name === tierSel ? 'sel' : ''}">
      ${i === 0 ? `<td class="tk" rowspan="${vs.length}">${esc(name)}</td>` : ''}<td class="txt">${esc(S.variants[v])}${v === S.defaultV ? ' <small class="muted">(varsayılan)</small>' : ''}</td>
      <td>${st.n ?? 0}</td><td>${ok(st.win) ? '%' + Math.round(st.win * 100) : '—'}</td><td>${v === 'trail' ? '—' : ok(st.tp) ? '%' + Math.round(st.tp * 100) : '—'}</td>
      <td class="${cls(st.avgR)}">${rFmt(st.avgR)}</td><td class="muted">${rFmt(st.randR)}</td>
      <td class="${cls(st.sumR)}">${usd(ok(st.sumR) ? st.sumR * 100 : null)}</td><td>${st.streak ?? '—'}</td>
      <td>${ac ? `<span class="${cls(ac.cagr)}">${fmt.pct(ac.cagr)}</span> / <span class="down">−%${Math.round(ac.mdd * 100)}</span>` : '—'}</td></tr>`; }).join('')).join('')}
  </tbody></table></div>`;
}

function yearsTable(S) {
  const st = STATS(S, tfSel)?.[tierSel]?.[S.defaultV], st3 = STATS(S, tfSel)?.[tierSel]?.['3'];
  const ys = Object.keys(st?.byYear || {});
  if (!ys.length) return '';
  const row = (lab, s, f) => `<tr><td class="tk">${lab}</td>${ys.map(y => { const d = s?.byYear?.[y]; return d ? f(d) : '<td>—</td>'; }).join('')}</tr>`;
  return `<h3>Yıllara göre · ${esc(tierSel)}</h3><div class="sigyearwrap"><table class="grid sigyears"><thead><tr><th class="tk"></th>${ys.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>
    ${row('İşlem', st, d => `<td>${d.n}</td>`)}
    ${row('Kârlı', st, d => `<td>%${Math.round(d.win * 100)}</td>`)}
    ${row('Ort. (takip eden stop)', st, d => `<td class="${cls(d.avgR)}">${rFmt(d.avgR)}</td>`)}
    ${row('Toplam (takip eden stop)', st, d => `<td class="${cls(d.sumR)}">${usd(d.sumR * 100)}</td>`)}
    ${row('Toplam (sabit 3R)', st3, d => `<td class="${cls(d.sumR)}">${usd(d.sumR * 100)}</td>`)}
  </tbody></table></div>`;
}

function accountHtml(S) {
  const a = ACCTS(S, tfSel)?.[tierSel]?.[S.defaultV], A = S.account, b = S.bench;
  if (!a || !A) return '';
  return `<div class="sigacct"><b>${fmt.big(A.capital)} ₺ hesapla ne olurdu?</b> ${esc(tierSel)}, ${tfSel === '4H' ? '4 saatlik mumlar' : 'günlük mumlar'}, takip eden stop, işlem başına sermayenin
    %${F1.format(A.risk * 100)}'i risk, en fazla ${A.maxPos} pozisyon, kaldıraç yok: ${a.years} yılda ${a.taken} işlem, yıllık
    <b class="${cls(a.cagr)}">${fmt.pct(a.cagr)}</b>, en büyük düşüş <b class="down">−%${Math.round(a.mdd * 100)}</b>.
    <br><span class="muted">Boşta kalan nakde faiz eklenmedi; para piyasası fonunda değerlendirilen nakit toplam getiriyi belirgin artırır.
    ${b ? `Aynı dönemde BIST 100 al-tut: yıllık ${fmt.pct(b.cagr)}, en büyük düşüş −%${Math.round(b.mdd * 100)}.` : ''}</span></div>`;
}

export async function renderSignals() {
  destroyCharts();
  document.title = 'Sinyaller · Tahta';
  view.innerHTML = '<p class="empty">Yükleniyor…</p>';
  let S;
  try { S = await loadSignals(); } catch { view.innerHTML = '<p class="empty">Sinyal verisi henüz yok; bir sonraki güncellemede oluşacak.</p>'; return; }
  if (!location.hash.startsWith('#/sinyal')) return;
  if (!S.strategy) { view.innerHTML = '<p class="empty">Sinyal verisi yenileniyor; bir sonraki güncellemede gelecek.</p>'; return; }
  tierSel ??= S.defaultSet;
  const inSet = a => (TIER_OF[tierSel] || []).includes(a.idx);
  const act = S.active.filter(inSet), rec = S.recent.filter(inSet), cand = (S.candidates || []).filter(inSet), u = S.strategy, P = S.params;
  const dst = STATS(S, '1D')?.[tierSel]?.[S.defaultV], dac = ACCTS(S, '1D')?.[tierSel]?.[S.defaultV];
  const brief = dst ? `Günlük test (${esc(tierSel)}): %${Math.round(dst.win * 100)} kârlı · işlem başına ${rFmt(dst.avgR)}${dac ? ` · hesap yıllık ${fmt.pct(dac.cagr)}` : ''}` : '';
  view.innerHTML = `
  <section class="dhead"><div><h1>Sinyaller</h1>
    <p class="sub">${esc(u.name)}: ${esc(u.summary)}</p></div></section>
  <div class="presets" role="group" aria-label="Endeks">
    ${S.tierSets.map(n => `<button type="button" data-sigt="${esc(n)}" aria-pressed="${tierSel === n}">${esc(n)} <span class="n">${S.active.filter(a => TIER_OF[n].includes(a.idx)).length}</span></button>`).join('')}
  </div>

  <section class="panel">
    <h2>Açık sinyaller <span class="muted" style="font-weight:400">· ${act.length}</span></h2>
    ${act.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr>
      <th class="tk" title="1G: günlük mum · 4S: 4 saatlik mum">Hisse</th><th title="3. mumun kapanışı (4S'de mumun bitiş saati)">Sinyal</th><th title="3. mumun kapanışı">Giriş</th>
      <th title="Takip başlamadıysa başlangıç stopu (üç mumun en düşüğünün %0,1 altı) ve altında takibin başlayacağı +1R seviyesi; başladıysa en yüksek fiyatın 1R altı">Stop</th>
      <th>Son fiyat</th><th title="Girişe göre güncel sonuç, R cinsinden">Güncel</th><th class="txt">Not</th></tr></thead><tbody>
      ${act.map(a => `<tr data-t="${a.t}">${tk(a)}<td>${dfmt(a.d)}</td><td>${fmt.price(a.e)}</td>
        <td>${a.armed ? `<b>${fmt.price(a.s)}</b> <span class="chip up">takipte</span>`
          : `${fmt.price(a.s0)} <small class="down">${fmt.pct(pctFrom(a.s0, a.e))}</small><small class="sub2">+1R: ${fmt.price(a.a)} <span class="up">${fmt.pct(pctFrom(a.a, a.e))}</span></small>`}</td>
        <td>${fmt.price(a.c)}</td><td class="${cls(a.r)}">${rFmt(a.r)}</td>
        <td class="txt">${a.tedbir ? '<span class="chip warn">⚠ Tedbir</span> ' : ''}<span class="muted" title="3. mumun hacmi / 20 günlük ortalama (bilgi amaçlı)">${IDX_LABEL[a.idx] || ''}${ok(a.volx) ? ` · hacim ${F1.format(a.volx)}x` : ''}</span></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu evrende şu an açık sinyal yok.</p>'}
    ${info(`<b>R</b> = giriş − stop (risk birimi). Örnek: sermaye 1.000.000 ₺, işlem başına %0,5 risk = 5.000 ₺;
      stop %5 aşağıdaysa pozisyon 100.000 ₺ olur. Giriş 3. mumun kapanışında yapılır. Fiyat +1R'ye ulaşınca stop, o güne kadar görülen en yüksek fiyatın 1R altına çekilir ve yalnızca yukarı taşınır; sabit hedef yoktur.
      Pozisyon en fazla ${P.hold} işlem günü (4S'de 120 mum) tutulur; testte gidiş-dönüş %${F1.format(P.cost * 100)} maliyet düşülür; 20 günlük ortalama işlem hacmi
      ${fmt.big(P.minTurnover)} ₺ altındaki hisseler alınmaz. <b>1G</b>: günlük mum, <b>4S</b>: 4 saatlik mum (13:30 ve kapanışta biter).`, 'R ve stop nasıl işler?')}
  </section>

  <section class="panel">
    <h2>Hazırlanan formasyonlar <span class="muted" style="font-weight:400">· ilk iki mum hazır · ${cand.length}</span></h2>
    <p class="muted" style="font-size:13px;margin:0 0 8px">Sinyal değildir: bir sonraki mum <b>yeşil ve tetiğin üstünde kapanırsa</b> morning star tamamlanır.</p>
    ${cand.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr>
      <th class="tk" title="1G: günlük mum · 4S: 4 saatlik mum">Hisse</th><th title="1. mum (sert kırmızı) · 2. mum (doji)">Mumlar</th><th>Son kapanış</th>
      <th title="Bir sonraki mumun kapanışı bu seviyenin üstünde olmalı ve mum yeşil kapanmalı">Tetik (kapanış &gt;)</th><th title="Son kapanışa göre gereken yükseliş">Gereken</th>
      <th title="İlk iki mumun en düşüğünün %0,1 altı; 3. mum daha aşağı inerse stop da iner. Parantez içinde tetikten girişteki risk.">Tahmini stop</th>
      <th class="txt">Not</th></tr></thead><tbody>
      ${cand.map(a => `<tr data-t="${a.t}">${tk(a)}
        <td>${a.tf === '4H' ? `${dfmt(a.d1)} · ${dfmt(a.d2).slice(-5)}` : `${fmt.date(a.d1).slice(0, 5)} · ${fmt.date(a.d2).slice(0, 5)}`}</td><td>${fmt.price(a.c)}</td>
        <td><b>${fmt.price(a.eff)}</b></td><td class="up">${fmt.pct(a.dist)}</td>
        <td>${fmt.price(a.s)} <small class="muted">(%${F1.format(a.risk * 100)})</small></td>
        <td class="txt">${a.fvg ? `<span class="chip warn" title="Doldurulmamış düşüş FVG'si: ${fmt.price(a.fvg[0])}–${fmt.price(a.fvg[1])}. Kapanış bu boşluğun altında kalırsa sinyal oluşmaz.">FVG: tetik ${fmt.price(a.trig)} → ${fmt.price(a.eff)}</span> ` : ''}<span class="muted">${IDX_LABEL[a.idx] || ''}</span></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu evrende şu an hazırlanan formasyon yok.</p>'}
    ${info(`Sert kırmızı mum ve ardından doji oluşmuş hisseler. Bir sonraki mum (1G: ertesi seans, 4S: bir sonraki 4 saatlik mum) yeşil kapanır ve kapanış tetiğin üstünde olursa
      morning star tamamlanır. Geçmişte bu adayların yalnızca ~%3'ü sinyale dönüştü (tetiğe yakın olanlarda daha sık). Tetiğe uzaklığı %${Math.round((S.candMaxDist || 0.06) * 100)}'ya kadar olanlar,
      yakından uzağa sıralı. Kullanım: seansın son dakikalarında fiyat tetiğin üstünde ve gün yeşilse kapanışta girilir. Kesin stop, 3. mumun en düşüğü de hesaba katılarak kapanıştan sonra
      belirlenir (açık sinyaller tablosunda görünür). Test sonuçları yalnızca tamamlanmış formasyonlar için geçerlidir.`, 'Nasıl kullanılır?')}
  </section>

  <section class="panel">
    <h2>Son 60 günün sonuçlanan sinyalleri <span class="muted" style="font-weight:400">· ${rec.length}</span></h2>
    ${rec.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr><th class="tk">Hisse</th><th>Sinyal</th>
      <th>Giriş</th><th class="txt">Çıkış nedeni</th><th>Çıkış fiyatı</th><th>Çıkış</th><th>Sonuç</th></tr></thead><tbody>
      ${rec.map(a => `<tr data-t="${a.t}">${tk(a)}<td>${dfmt(a.d)}</td>
        <td>${fmt.price(a.e)}</td><td class="txt">${chip(a.st)}</td><td>${fmt.price(a.x)}</td>
        <td>${dfmt(a.xd)}</td><td class="${cls(a.r)}">${rFmt(a.r)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu evrende son 60 günde sonuçlanan sinyal yok.</p>'}
  </section>

  <details class="panel sigcard"${cardOpen ? ' open' : ''}>
    <summary><h2>${esc(u.name)} · kurallar ve test sonuçları</h2><span class="muted">${brief}</span></summary>
    <ul class="sigrules">${u.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    <h3>Geriye dönük test</h3>
    ${S.timeframes ? `<div class="seg" role="group" aria-label="Zaman dilimi" style="margin-bottom:8px">${Object.entries(S.timeframes).map(([k, v]) =>
      `<button type="button" data-sigtf="${k}" aria-pressed="${tfSel === k}">${esc(v.name)}</button>`).join('')}</div>
      <p class="muted" style="font-size:12px;margin:0 0 8px">${tfSel === '4H' ? '4 saatlik mumlar: günde iki mum (13:30 ve kapanış); saatlik veri son ~2 yıl için mevcut. En fazla 120 mum (≈60 işlem günü).' : 'Günlük mumlar, son 4 yıl. En fazla 60 işlem günü.'}</p>` : ''}
    ${statsTable(S)}
    ${yearsTable(S)}
    ${accountHtml(S)}
    <h3>Bilmeniz gerekenler</h3>
    <ul class="sigrules">${u.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    <p class="note-fx">Kurallar son 4 yılda aynı kodla geriye dönük test edildi. Geçmiş başarı geleceği garanti etmez (test bugünkü endeks bileşenleriyle yapıldı).
      Yatırım tavsiyesi değildir; işlem başına sermayenin en fazla %${F1.format(S.account.risk * 100)}'ini riske etmeniz önerilir.</p>
  </details>`;
  view.querySelector('.sigcard').addEventListener('toggle', e => { cardOpen = e.target.open; });
  view.querySelectorAll('[data-sigt]').forEach(b => b.addEventListener('click', () => { tierSel = b.dataset.sigt; renderSignals(); }));
  view.querySelectorAll('[data-sigtf]').forEach(b => b.addEventListener('click', () => { tfSel = b.dataset.sigtf; renderSignals(); }));
}
