import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { persist, state } from './store.js';
import { F1, F2, cls, esc, fmt, info, ok } from './util.js';

/* ============================================================
   Sinyaller: strateji modülleri (scripts/strategies/), açık sinyaller, hazırlanan kurulumlar, geriye dönük test
   Veri: data/signals.json (scripts/signals.py, her güncellemede yeniden üretilir)
   ============================================================ */
let SIG = null, tfSel = '1D', cardOpen = false;
// Tarih: günlük 'YYYY-MM-DD', 4 saatlik 'YYYY-MM-DD HH:MM'
const dfmt = d => { if (!d) return '—'; const [day, time] = d.split(' '); return time ? `${fmt.date(day).slice(0, 5)} ${time}` : fmt.date(day); };
// Hak kullanımdan önceki iş günü (temettü hakkı olan son gün)
const prevBday = d => { const x = new Date(d + 'T12:00:00Z'); do x.setUTCDate(x.getUTCDate() - 1); while ([0, 6].includes(x.getUTCDay())); return x.toISOString().slice(0, 10); };
const dm = d => fmt.date(d).slice(0, 5);
const tk = a => `<td class="tk"><a class="code" href="#/h/${a.t}">${a.t}</a> ${tfChip(a.tf)}</td>`;
const tfChip = tf => tf === '4H' ? '<span class="chip tf4" title="4 saatlik mumlar">4S</span>' : '<span class="chip" title="Günlük mumlar">1G</span>';
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
const IDX_LABEL = { 30: 'BIST 30', 50: 'BIST 50', 100: 'BIST 100', TÜM: 'TÜM' };
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

function statsTable(S, u) {
  const vs = Object.keys(u.variants), tierSel = curTier(S);
  return `<div class="tablewrap flat"><table class="grid sigstat"><thead><tr><th class="tk">Evren</th><th class="txt">Çıkış kuralı</th><th>İşlem</th>
    <th title="Kârla kapanan işlemlerin oranı">Kârlı</th><th title="Sabit hedefe ulaşan işlemlerin oranı">Hedefe ulaşan</th>
    <th title="İşlem başına ortalama sonuç (komisyon ve kayma dahil)">Ort.</th><th title="Aynı hisselerde rastgele günlerde, aynı stop yapısı ve çıkış kuralıyla girişin ortalaması">Rastgele giriş</th>
    <th title="Her işlemde sabit 1.000 ₺ riske edilseydi (1R = 1.000 ₺) tüm işlemlerin toplam sonucu; bileşik değildir, pozisyon sınırı yoktur">Kümülatif (1R = 1.000 ₺)</th><th title="Art arda en uzun kayıp serisi">Art arda kayıp</th>
    <th title="${fmt.big(S.account.capital)} ₺ bakiye, işlem başına bakiyenin %${F1.format((u.risk ?? S.account.risk) * 100)}'i risk, en fazla ${S.account.maxPos} pozisyon">Hesap: yıllık / düşüş</th></tr></thead><tbody>
    ${S.tierSets.map(name => vs.map((v, i) => { const st = u.stats?.[tfSel]?.[name]?.[v] || {}, ac = u.accounts?.[tfSel]?.[name]?.[v]; return `<tr class="${name === tierSel ? 'sel' : ''}">
      ${i === 0 ? `<td class="tk" rowspan="${vs.length}">${esc(name)}</td>` : ''}<td class="txt">${esc(u.variants[v])}${v === u.defaultV ? ' <small class="muted">(varsayılan)</small>' : ''}</td>
      <td>${st.n ?? 0}</td><td>${ok(st.win) ? '%' + Math.round(st.win * 100) : '—'}</td><td>${isNaN(+v) ? '—' : ok(st.tp) ? '%' + Math.round(st.tp * 100) : '—'}</td>
      <td class="${cls(st.avgR)}">${rFmt(st.avgR)}</td><td class="muted">${rFmt(st.randR)}</td>
      <td class="${cls(st.sumR)}">${tl(ok(st.sumR) ? st.sumR * R_TL : null)}</td><td>${st.streak ?? '—'}</td>
      <td>${ac ? `<span class="${cls(ac.cagr)}">${fmt.pct(ac.cagr)}</span> / <span class="down">−%${Math.round(ac.mdd * 100)}</span>` : '—'}</td></tr>`; }).join('')).join('')}
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
  return `<div class="sigacct"><b>${fmt.big(A.capital)} ₺ bakiyeyle ne olurdu?</b> ${esc(tierSel)}, ${tfSel === '4H' ? '4 saatlik mumlar' : 'günlük mumlar'}, ${esc(u.variants[u.defaultV]).toLocaleLowerCase('tr')}, işlem başına sermayenin
    %${F1.format((u.risk ?? A.risk) * 100)}'i risk (bakiye büyüdükçe 1R de büyür), en fazla ${A.maxPos} pozisyon, kaldıraç yok: ${a.years} yılda ${a.taken} işlem, yıllık
    <b class="${cls(a.cagr)}">${fmt.pct(a.cagr)}</b>, en büyük düşüş <b class="down">−%${Math.round(a.mdd * 100)}</b>.
    <br><span class="muted">Boşta kalan nakde faiz eklenmedi; para piyasası fonunda değerlendirilen nakit toplam getiriyi belirgin artırır.
    ${b ? `Aynı dönemde BIST 100 al-tut: yıllık ${fmt.pct(b.cagr)}, en büyük düşüş −%${Math.round(b.mdd * 100)}.` : ''}</span></div>`;
}

const curTier = S => S.tierSets.includes(state.sigTier) ? state.sigTier : S.defaultSet;
const curStrat = S => S.strategies.find(u => u.id === state.sigStrat) || null;
const testChip = u => u.status === 'test' ? ' <span class="chip warn" title="Deneme aşamasında: kurallar değişebilir">deneme</span>' : '';

/* Strateji seçimi: Tümü + grup başlıkları (tarama sayfasındaki hazır taramalar gibi); başlığa dokununca stratejiler açılır */
let openGroup;
function stratBar(S, nAct) {
  const cur = curStrat(S);
  if (openGroup === undefined) openGroup = cur?.group ?? null;
  const groups = [...new Set(S.strategies.map(u => u.group))];
  const btn = (u) => `<button type="button" data-sigs="${u.id}" aria-pressed="${cur?.id === u.id}" title="${esc(u.short || u.summary || '')}">${esc(u.name)}${u.status === 'test' ? ' <small>deneme</small>' : ''}<span class="n">${nAct(u.id)}</span></button>`;
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
    <div class="tablewrap flat"><table class="grid sigtable"><thead><tr><th class="tk">Strateji</th><th class="txt">Grup</th><th class="txt">Periyot</th><th title="Bu periyotta şu an açık sinyal">Açık</th>
      <th title="Testteki işlem sayısı">İşlem</th><th title="Kârla kapanan işlemlerin oranı">Kârlı</th><th title="İşlem başına ortalama sonuç">Ort.</th>
      <th title="Aynı hisselerde rastgele girişin ortalaması (aynı stop ve çıkış)">Rastgele</th><th title="${fmt.big(A.capital)} ₺ bakiye, her stratejinin kendi risk oranıyla, en fazla ${A.maxPos} pozisyon">Hesap: yıllık / düşüş</th>
      <th title="Testin başında ${fmt.big(A.capital)} ₺ ile başlanıp bu stratejinin bütün sinyalleri hesap kurallarıyla izlenseydi bugünkü bakiye (açık pozisyonlar maliyetle)">${fmt.big(A.capital)} ₺ → bugün</th></tr></thead><tbody>
      ${rows.map(({ u, tf }) => { const st = u.stats?.[tf]?.[tier]?.[u.defaultV] || {}, ac = u.accounts?.[tf]?.[tier]?.[u.defaultV];
        const nOpen = S.active.filter(a => (TIER_OF[tier] || []).includes(a.idx) && a.k === u.id && (a.tf || '1D') === tf).length;
        return `<tr data-sigs="${u.id}" data-sigrowtf="${tf}"><td class="tk"><b>${esc(u.name)}</b>${u.tfs.length > 1 ? ` <span class="muted">· ${tfName(tf)}</span>` : ''}${testChip(u)}<small class="sub2">${esc(u.short || '')}</small></td>
          <td class="txt">${esc(u.groupName || S.groups?.[u.group] || u.group)}</td>
          <td class="txt">${tfChip(tf)}</td><td>${nOpen}</td><td>${st.n ?? 0}</td><td>${ok(st.win) ? '%' + Math.round(st.win * 100) : '—'}</td>
          <td class="${cls(st.avgR)}">${rFmt(st.avgR)}</td><td class="muted">${rFmt(st.randR)}</td>
          <td>${ac ? `<span class="${cls(ac.cagr)}">${fmt.pct(ac.cagr)}</span> / <span class="down">−%${Math.round(ac.mdd * 100)}</span><small class="sub2">%${F1.format((u.risk ?? A.risk) * 100)} risk</small>` : '—'}</td>
          <td>${ac ? `<b class="${cls(ac.final - A.capital)}">${fmt.price(ac.final).replace(/,00$/, '')} ₺</b><small class="sub2">${F1.format(ac.years)} yılda · ${ac.taken} işlem</small>` : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>
    ${info(`Her strateji aynı motorla test edilir: 20 mn ₺ hacim filtresi, stop mesafesi %0,5–%15, gidiş-dönüş %0,2 maliyet, aynı hissede önceki işlem kapanmadan yeni işlem yok, rastgele giriş kıyası ve hesap simülasyonu.
      Bakiye sütunu: testin başında ${fmt.big(A.capital)} ₺ ile başlanıp her işlemde bakiyenin stratejiye ait risk oranı kadar riske edilseydi bugünkü bakiye (bileşik; en fazla ${A.maxPos} pozisyon, kaldıraç yok, boştaki nakde faiz yok).
      4 saatlik test, verinin izin verdiği son ~2,8 yılı kapsar; günlükle süre farkına dikkat edin. Satıra dokununca stratejinin sinyalleri, kuralları ve ayrıntılı test sonuçları açılır.`, 'Nasıl karşılaştırılır?')}
  </section>`;
}

function strategyCard(S, u) {
  const tier = curTier(S);
  if (!u.tfs.includes(tfSel)) tfSel = u.tfs[0];
  const dst = u.stats?.['1D']?.[tier]?.[u.defaultV], dac = u.accounts?.['1D']?.[tier]?.[u.defaultV];
  const brief = dst ? `Günlük test (${esc(tier)}): %${Math.round(dst.win * 100)} kârlı · işlem başına ${rFmt(dst.avgR)}${dac ? ` · hesap yıllık ${fmt.pct(dac.cagr)}` : ''}` : '';
  return `<details class="panel sigcard"${cardOpen ? ' open' : ''}>
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
    ${u.notes?.length ? `<h3>Bilmeniz gerekenler</h3><ul class="sigrules">${u.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <p class="note-fx">Kurallar son 4 yılda aynı kodla geriye dönük test edildi. Geçmiş başarı geleceği garanti etmez (test bugünkü endeks bileşenleriyle yapıldı).
      Yatırım tavsiyesi değildir; testteki hesap işlem başına bakiyenin %${F1.format((u.risk ?? S.account.risk) * 100)}'ini riske eder.</p>
  </details>`;
}

export async function renderSignals() {
  destroyCharts();
  document.title = 'Sinyaller · Tahta';
  if (!SIG) view.innerHTML = '<p class="empty">Yükleniyor…</p>';
  let S;
  try { S = await loadSignals(); } catch { view.innerHTML = '<p class="empty">Sinyal verisi henüz yok; bir sonraki güncellemede oluşacak.</p>'; return; }
  if (!location.hash.startsWith('#/sinyal')) return;
  if (!S.strategies?.length) { view.innerHTML = '<p class="empty">Sinyal verisi yenileniyor; bir sonraki güncellemede gelecek.</p>'; return; }
  const tierSel = curTier(S), u = curStrat(S), P = S.params;
  const inSet = a => (TIER_OF[tierSel] || []).includes(a.idx) && (!u || a.k === u.id);
  const nAct = id => S.active.filter(a => (TIER_OF[tierSel] || []).includes(a.idx) && (!id || a.k === id)).length;
  const act = S.active.filter(inSet), rec = S.recent.filter(inSet), cand = (S.candidates || []).filter(inSet);
  const name = id => S.strategies.find(x => x.id === id)?.name || id;
  const many = !u && S.strategies.length > 1;
  const stratCol = a => many ? `<td class="txt">${esc(name(a.k))}</td>` : '';
  const stratTh = many ? '<th class="txt">Strateji</th>' : '';
  const hasCand = u ? u.candidates : S.strategies.some(x => x.candidates);
  view.innerHTML = `
  <section class="dhead"><div><h1>Sinyaller</h1>
    <p class="sub">${u ? `${esc(u.name)}${testChip(u)}: ${esc(u.summary || '')}` : `${S.strategies.length} strateji · aynı motorla test edilir; bir stratejiyi seçerek yalnızca onun sinyallerini görün`}</p></div></section>
  ${S.strategies.length > 1 || Object.keys(S.groups || {}).length ? stratBar(S, nAct) : ''}
  <div class="presets tiers" role="group" aria-label="Endeks"><span class="lbl">Endeks</span>
    ${S.tierSets.map(n => `<button type="button" data-sigt="${esc(n)}" aria-pressed="${tierSel === n}">${esc(n)} <span class="n">${S.active.filter(a => TIER_OF[n].includes(a.idx) && (!u || a.k === u.id)).length}</span></button>`).join('')}
  </div>

  <section class="panel">
    <h2>Açık sinyaller <span class="muted" style="font-weight:400">· ${act.length}</span></h2>
    ${act.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr>
      <th class="tk" title="1G: günlük mum · 4S: 4 saatlik mum">Hisse</th>${stratTh}<th title="Sinyal mumunun kapanışı (4S'de mumun bitiş saati)">Sinyal</th><th title="Sinyal mumunun kapanışı">Giriş</th>
      <th title="Takip başlamadıysa başlangıç stopu ve altında takibin başlayacağı seviye; başladıysa güncel takip stopu">Stop</th>
      <th>Son fiyat</th><th title="Girişe göre güncel sonuç, R cinsinden">Güncel</th><th class="txt">Not</th></tr></thead><tbody>
      ${act.map(a => `<tr data-t="${a.t}">${tk(a)}${stratCol(a)}<td>${dfmt(a.d)}</td><td>${fmt.price(a.e)}</td>
        <td>${a.info?.ns ? `<span class="muted" title="Bu stratejide stop yok; işlem son gün kapanışında kapanır. 1R (pozisyon büyüklüğü için) = ${fmt.price(a.e - a.s0)} ₺">stop yok</span><small class="sub2">çıkış: ${dm(prevBday(a.info.exd))} kapanış</small>` : a.armed ? `<b>${fmt.price(a.s)}</b> <span class="chip up">takipte</span>`
          : `${fmt.price(a.s0)} <small class="down">${fmt.pct(pctFrom(a.s0, a.e))}</small>${a.info?.exd ? `<small class="sub2" title="Temettü hakkı olan son günün kapanışında çıkılır (hak kullanım ${fmt.date(a.info.exd)})">çıkış: ${dm(prevBday(a.info.exd))} kapanış</small>` : a.xl > a.s ? `<small class="sub2" title="Kanal çıkışı: kapanış bu seviyenin (son 10 günün en düşüğü) altına inerse çıkılır">çıkış: kapanış &lt; ${fmt.price(a.xl)}</small>` : a.xl ? '<small class="sub2" title="Kanal çıkış seviyesi (son 10 günün en düşüğü) şu an stopun altında; önce stop geçerli">kanal çıkışı stopun altında</small>' : a.a ? `<small class="sub2">+1R: ${fmt.price(a.a)} <span class="up">${fmt.pct(pctFrom(a.a, a.e))}</span></small>` : ''}`}</td>
        <td>${fmt.price(a.c)}</td><td class="${cls(a.r)}">${rFmt(a.r)}</td>
        <td class="txt">${a.tedbir ? '<span class="chip warn">⚠ Tedbir</span> ' : ''}${a.info?.y ? `<span class="chip up" title="Brüt temettü / giriş fiyatı · hak kullanım ${fmt.date(a.info.exd)}">temettü %${F1.format(a.info.y * 100)}</span> ` : ''}<span class="muted" title="Sinyal mumunun hacmi / 20 mumluk ortalama (bilgi amaçlı)">${IDX_LABEL[a.idx] || ''}${ok(a.volx) ? ` · hacim ${F1.format(a.volx)}x` : ''}</span></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu seçimde şu an açık sinyal yok.</p>'}
    ${info(`<b>R</b> = giriş − stop (risk birimi). Örnek: bakiye 100.000 ₺, işlem başına %1 risk = 1R = 1.000 ₺; stop %5 aşağıdaysa pozisyon 20.000 ₺ olur. Testteki hesap morning star'da bakiyenin %1'ini, Donchian'da %0,5'ini riske eder. Giriş sinyal mumunun kapanışında yapılır. Takip eden stopta fiyat +1R'ye ulaşınca stop, o güne kadar görülen en yüksek fiyatın 1R altına çekilir ve yalnızca yukarı taşınır.
      Pozisyon en fazla ${P.hold} işlem günü (4S'de 120 mum) tutulur; testte gidiş-dönüş %${F1.format(P.cost * 100)} maliyet düşülür; 20 günlük ortalama işlem hacmi
      ${fmt.big(P.minTurnover)} ₺ altındaki hisseler alınmaz. <b>1G</b>: günlük mum, <b>4S</b>: 4 saatlik mum (13:30 ve kapanışta biter).`, 'R ve stop nasıl işler?')}
  </section>

  ${hasCand ? `<section class="panel">
    <h2>Hazırlanan kurulumlar <span class="muted" style="font-weight:400">· ${cand.length}</span></h2>
    <p class="muted" style="font-size:13px;margin:0 0 8px">Sinyal değildir: kurulumun son koşulu gerçekleşince (fiyat kurulumlarında bir sonraki mumun <b>tetiğin üstünde kapanması</b>, temettüde giriş gününün gelmesi) sinyal oluşur.</p>
    ${cand.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr>
      <th class="tk" title="1G: günlük mum · 4S: 4 saatlik mum">Hisse</th>${stratTh}<th title="Kurulumu oluşturan mumlar">Mumlar</th><th>Son kapanış</th>
      <th title="Bir sonraki mumun kapanışı bu seviyenin üstünde olmalı">Tetik (kapanış &gt;)</th><th title="Son kapanışa göre gereken yükseliş">Gereken</th>
      <th title="Tahmini stop; parantez içinde tetikten girişteki risk">Tahmini stop</th>
      <th class="txt">Not</th></tr></thead><tbody>
      ${cand.map(a => a.info?.exd ? `<tr data-t="${a.t}">${tk(a)}${stratCol(a)}
        <td title="Hak kullanım (temettü düşülen) günü">hak kullanım ${dm(a.info.exd)}</td><td>${fmt.price(a.c)}</td>
        <td title="Tahmini giriş günü (kapanışta)"><b>giriş ${dm(a.info.entry)}</b></td><td>${a.info.in} gün</td>
        <td>${a.info.ns ? `<span class="muted" title="Stop yok; pozisyon büyüklüğü için 1R = %${F1.format(a.risk * 100)}">stop yok · 1R %${F1.format(a.risk * 100)}</span>` : `${fmt.price(a.s)} <small class="muted">(%${F1.format(a.risk * 100)})</small>`}</td>
        <td class="txt"><span class="chip up" title="Brüt temettü / son kapanış">temettü %${F1.format(a.info.y * 100)}</span> <span class="muted">${IDX_LABEL[a.idx] || ''}</span></td></tr>`
      : `<tr data-t="${a.t}">${tk(a)}${stratCol(a)}
        <td>${a.tf === '4H' ? `${dfmt(a.d1)} · ${dfmt(a.d2).slice(-5)}` : `${fmt.date(a.d1).slice(0, 5)} · ${fmt.date(a.d2).slice(0, 5)}`}</td><td>${fmt.price(a.c)}</td>
        <td><b>${fmt.price(a.eff)}</b></td><td class="up">${fmt.pct(a.dist)}</td>
        <td>${fmt.price(a.s)} <small class="muted">(%${F1.format(a.risk * 100)})</small></td>
        <td class="txt">${a.fvg ? `<span class="chip warn" title="Doldurulmamış düşüş FVG'si: ${fmt.price(a.fvg[0])}–${fmt.price(a.fvg[1])}. Kapanış bu boşluğun altında kalırsa sinyal oluşmaz.">FVG: tetik ${fmt.price(a.trig)} → ${fmt.price(a.eff)}</span> ` : ''}<span class="muted">${IDX_LABEL[a.idx] || ''}</span></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu seçimde şu an hazırlanan kurulum yok.</p>'}
    ${info(`${S.strategies.filter(x => x.candidates && x.candNote && (!u || x.id === u.id)).map(x => `<b>${esc(x.name)}:</b> ${esc(x.candNote)}`).join('<br>')}
      ${u?.candMaxDist ? `<br>Tetiğe uzaklığı %${Math.round(u.candMaxDist * 100)}'ya kadar olanlar, yakından uzağa sıralı.` : ''} Kullanım: seansın son dakikalarında fiyat tetiğin üstündeyse kapanışta girilir.
      Kesin stop kapanıştan sonra belirlenir (açık sinyaller tablosunda görünür). Test sonuçları yalnızca tamamlanmış kurulumlar için geçerlidir.`, 'Nasıl kullanılır?')}
  </section>` : ''}

  <section class="panel">
    <h2>Son 60 günün sonuçlanan sinyalleri <span class="muted" style="font-weight:400">· ${rec.length}</span></h2>
    ${rec.length ? `<div class="tablewrap flat"><table class="grid sigtable"><thead><tr><th class="tk">Hisse</th>${stratTh}<th>Sinyal</th>
      <th>Giriş</th><th class="txt">Çıkış nedeni</th><th>Çıkış fiyatı</th><th>Çıkış</th><th>Sonuç</th></tr></thead><tbody>
      ${rec.map(a => `<tr data-t="${a.t}">${tk(a)}${stratCol(a)}<td>${dfmt(a.d)}</td>
        <td>${fmt.price(a.e)}</td><td class="txt">${chip(a.st)}</td><td>${fmt.price(a.x)}</td>
        <td>${dfmt(a.xd)}</td><td class="${cls(a.r)}">${rFmt(a.r)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Bu seçimde son 60 günde sonuçlanan sinyal yok.</p>'}
  </section>

  ${u ? strategyCard(S, u) : overviewHtml(S)}`;
  view.querySelector('.sigcard')?.addEventListener('toggle', e => { cardOpen = e.target.open; });
  view.querySelectorAll('[data-sigt]').forEach(b => b.addEventListener('click', () => { state.sigTier = b.dataset.sigt; persist(); renderSignals(); }));
  view.querySelectorAll('[data-sigtf]').forEach(b => b.addEventListener('click', () => { tfSel = b.dataset.sigtf; renderSignals(); }));
  view.querySelectorAll('[data-siggrp]').forEach(b => b.addEventListener('click', () => { openGroup = openGroup === b.dataset.siggrp ? null : b.dataset.siggrp; renderSignals(); }));
  view.querySelectorAll('[data-sigs]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    state.sigStrat = b.dataset.sigs || null; persist();
    if (b.dataset.sigrowtf) { tfSel = b.dataset.sigrowtf; cardOpen = true; }
    const nu = curStrat(S); if (!nu) openGroup = null; else openGroup = nu.group;
    renderSignals(); window.scrollTo(0, 0);
  }));
}
