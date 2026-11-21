import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { F1, F2, cls, esc, fmt, ok } from './util.js';

/* ============================================================
   Sinyaller: morning star kurulumu (giriş / stop / hedef) ve geriye dönük test
   Veri: data/signals.json (scripts/signals.py, her güncellemede yeniden üretilir)
   ============================================================ */
let SIG = null, tierSel = null;
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
    ${S.tierSets.map(name => vs.map((v, i) => { const st = S.stats[name]?.[v] || {}, ac = S.accounts?.[name]?.[v]; return `<tr class="${name === tierSel ? 'sel' : ''}">
      ${i === 0 ? `<td class="tk" rowspan="${vs.length}">${esc(name)}</td>` : ''}<td class="txt">${esc(S.variants[v])}${v === S.defaultV ? ' <small class="muted">(varsayılan)</small>' : ''}</td>
      <td>${st.n ?? 0}</td><td>${ok(st.win) ? '%' + Math.round(st.win * 100) : '—'}</td><td>${v === 'trail' ? '—' : ok(st.tp) ? '%' + Math.round(st.tp * 100) : '—'}</td>
      <td class="${cls(st.avgR)}">${rFmt(st.avgR)}</td><td class="muted">${rFmt(st.randR)}</td>
      <td class="${cls(st.sumR)}">${usd(ok(st.sumR) ? st.sumR * 100 : null)}</td><td>${st.streak ?? '—'}</td>
      <td>${ac ? `<span class="${cls(ac.cagr)}">${fmt.pct(ac.cagr)}</span> / <span class="down">−%${Math.round(ac.mdd * 100)}</span>` : '—'}</td></tr>`; }).join('')).join('')}
  </tbody></table></div>`;
}

function yearsTable(S) {
  const st = S.stats[tierSel]?.[S.defaultV], st3 = S.stats[tierSel]?.['3'];
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
  const a = S.accounts?.[tierSel]?.[S.defaultV], A = S.account, b = S.bench;
  if (!a || !A) return '';
  return `<div class="sigacct"><b>${fmt.big(A.capital)} ₺ hesapla ne olurdu?</b> ${esc(tierSel)}, takip eden stop, işlem başına sermayenin
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
  const act = S.active.filter(inSet), rec = S.recent.filter(inSet), u = S.strategy, P = S.params;
  view.innerHTML = `
  <section class="dhead"><div><h1>Sinyaller</h1>
    <p class="sub">${esc(u.name)}: ${esc(u.summary)}</p></div></section>
  <p class="note-fx" style="margin:0 0 12px">Kurallar son 4 yılda aynı kodla geriye dönük test edildi; sonuçlar aşağıda. Geçmiş başarı geleceği garanti etmez
    (test bugünkü endeks bileşenleriyle yapıldı). Yatırım tavsiyesi değildir; işlem başına sermayenin en fazla %${F1.format(S.account.risk * 100)}'ini riske etmeniz önerilir.</p>
  <div class="presets" role="group" aria-label="Endeks" style="margin-bottom:12px">
    ${S.tierSets.map(n => `<button type="button" data-sigt="${esc(n)}" aria-pressed="${tierSel === n}">${esc(n)} <span class="n">${S.active.filter(a => TIER_OF[n].includes(a.idx)).length}</span></button>`).join('')}
  </div>

  <section class="panel">
    <h2>Açık sinyaller <span class="muted" style="font-weight:400">· ${esc(tierSel)} · ${act.length}</span></h2>
    ${act.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr>
      <th class="tk">Hisse</th><th class="txt">Endeks</th><th>Sinyal</th><th title="3. mumun kapanışı">Giriş</th>
      <th title="Üç mumun en düşüğünün %0,1 altı (−1R)">Başlangıç stopu</th><th title="Bugünkü stop seviyesi: takip başladıysa en yüksek fiyatın 1R altı">Güncel stop</th>
      <th title="Fiyat bu seviyeye (+1R) ulaşınca stop takibe başlar">Takip başlar</th><th>Son fiyat</th><th title="Girişe göre güncel sonuç">Güncel</th>
      <th title="3. mumun hacmi / 20 günlük ortalama (bilgi amaçlı)">Hacim</th><th class="txt">Not</th></tr></thead><tbody>
      ${act.map(a => `<tr data-t="${a.t}"><td class="tk"><a class="code" href="#/h/${a.t}">${a.t}</a></td><td class="txt">${IDX_LABEL[a.idx] || ''}</td>
        <td>${fmt.date(a.d)}</td><td>${fmt.price(a.e)}</td>
        <td>${fmt.price(a.s0)} <small class="down">${fmt.pct(pctFrom(a.s0, a.e))}</small></td>
        <td>${a.armed ? `<b>${fmt.price(a.s)}</b> <small class="${cls(pctFrom(a.s, a.e))}">${fmt.pct(pctFrom(a.s, a.e))}</small>` : '<span class="muted">başlangıç stopu</span>'}</td>
        <td>${a.armed ? '<span class="chip up">başladı</span>' : `${fmt.price(a.a)} <small class="up">${fmt.pct(pctFrom(a.a, a.e))}</small>`}</td>
        <td>${fmt.price(a.c)}</td><td class="${cls(a.r)}">${rFmt(a.r)}</td>
        <td>${ok(a.volx) ? F1.format(a.volx) + 'x' : '—'}</td>
        <td class="txt">${a.tedbir ? '<span class="chip warn">⚠ Tedbir</span>' : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu evrende şu an açık sinyal yok.</p>'}
    <p class="muted" style="font-size:12px;margin:8px 0 0"><b>R</b> = giriş − stop (risk birimi). Örnek: sermaye 1.000.000 ₺, işlem başına %0,5 risk = 5.000 ₺;
      stop %5 aşağıdaysa pozisyon 100.000 ₺ olur. Giriş 3. mumun kapanışında yapılır. Fiyat +1R'ye ulaşınca stop, o güne kadar görülen en yüksek fiyatın 1R altına çekilir ve yalnızca yukarı taşınır; sabit hedef yoktur.
      Pozisyon en fazla ${P.hold} işlem günü tutulur; testte gidiş-dönüş %${F1.format(P.cost * 100)} maliyet düşülür; 20 günlük ortalama işlem hacmi
      ${fmt.big(P.minTurnover)} ₺ altındaki hisseler alınmaz.</p>
  </section>

  <section class="panel sigcard">
    <h2>${esc(u.name)} · kurallar ve test sonuçları</h2>
    <ul class="sigrules">${u.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    <h3>Geriye dönük test (son 4 yıl)</h3>
    ${statsTable(S)}
    ${yearsTable(S)}
    ${accountHtml(S)}
    <h3>Bilmeniz gerekenler</h3>
    <ul class="sigrules">${u.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
  </section>

  <section class="panel">
    <h2>Son 60 günün sonuçlanan sinyalleri <span class="muted" style="font-weight:400">· ${esc(tierSel)} · ${rec.length}</span></h2>
    ${rec.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr><th class="tk">Hisse</th><th class="txt">Endeks</th><th>Sinyal</th>
      <th>Giriş</th><th>Başlangıç stopu</th><th class="txt">Çıkış nedeni</th><th>Çıkış fiyatı</th><th>Çıkış</th><th>Sonuç (R)</th></tr></thead><tbody>
      ${rec.map(a => `<tr data-t="${a.t}"><td class="tk"><a class="code" href="#/h/${a.t}">${a.t}</a></td><td class="txt">${IDX_LABEL[a.idx] || ''}</td><td>${fmt.date(a.d)}</td>
        <td>${fmt.price(a.e)}</td><td>${fmt.price(a.s0)}</td><td class="txt">${chip(a.st)}</td><td>${fmt.price(a.x)}</td>
        <td>${a.xd ? fmt.date(a.xd) : '—'}</td><td class="${cls(a.r)}">${rFmt(a.r)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu evrende son 60 günde sonuçlanan sinyal yok.</p>'}
  </section>`;
  view.querySelectorAll('[data-sigt]').forEach(b => b.addEventListener('click', () => { tierSel = b.dataset.sigt; renderSignals(); }));
}
