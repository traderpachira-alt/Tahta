import { $ } from './dom.js';
import { F1, F2, cls, esc, fmt, ok, info } from './util.js';

/* ============================================================
   DCF hesaplayıcı (dolar bazında) — scripts/dcf.py ile aynı model.
   Varsayılanlar veri derlemesinden gelir; kullanıcı büyüme, marj, risk primleri ve uç büyümeyi değiştirebilir.
   ============================================================ */
export function equityValue(fcf0, g1, gt, wacc, nd, minority, years = 10) {
  let pv = 0, f = fcf0;
  for (let t = 1; t <= years; t++) {
    const g = g1 + (gt - g1) * (t - 1) / (years - 1);
    f *= 1 + g;
    pv += f / (1 + wacc) ** t;
  }
  const tv = f * (1 + gt) / (wacc - gt) / (1 + wacc) ** years;
  const ev = pv + tv;
  return { ev, eq: ev - nd - minority, tvShare: ev ? tv / ev : null };
}
export function waccOf(d, a) {
  const coe = d.rf + d.beta * a.erp + a.crp, cod = d.rf + a.crp + d.spread;
  return { coe, cod, wacc: d.we * coe + (1 - d.we) * cod * (1 - d.tax) };
}
export function impliedGrowth(target, fcf0, gt, wacc, nd, minority) {
  let lo = -0.2, hi = 0.6;
  const f = g => equityValue(fcf0, g, gt, wacc, nd, minority).eq - target;
  if (f(lo) > 0) return { g: lo, clip: 'low' };
  if (f(hi) < 0) return { g: hi, clip: 'high' };
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  return { g: (lo + hi) / 2, clip: null };
}
export const igFmt = (g, clip) => !ok(g) ? '—' : clip === 'low' || g <= -0.2 + 1e-9 ? '≤ −%20' : clip === 'high' || g >= 0.6 - 1e-9 ? '≥ %60' : fmt.pct(g);

const pctIn = (id, label, val, min, max, step, hint) => `<label title="${esc(hint)}">${label}
  <span class="dcfin"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${(val * 100).toFixed(2)}"><output id="${id}O">%${F1.format(val * 100)}</output></span></label>`;

let A = null; // kullanıcı varsayımları (hisse başına sıfırlanır)
export function renderDcfPanel(s, j) {
  const el = $('#dcfPanel');
  if (!el) return;
  const d = j?.dcf;
  el.hidden = !d;
  if (!d) return;
  if (!d.ok && !ok(d.margin)) { el.innerHTML = `<h2>DCF · indirgenmiş nakit akışı</h2><p class="muted">${esc(d.why || 'Hesaplanamadı.')}</p>`; return; }
  A = { g1: d.g1, gt: d.gt, margin: d.margin, erp: d.erp, crp: d.crp };
  el.innerHTML = `<h2>DCF · indirgenmiş nakit akışı <span class="muted" style="font-weight:400">· dolar bazında</span></h2>
    ${d.ok ? '' : `<p class="note-fx" style="margin:0 0 10px">${esc(d.why)} Aşağıda marjı kendi varsayımınızla deneyebilirsiniz.</p>`}
    <div class="dcfgrid">
      <div class="dcfout" id="dcfOut"></div>
      <div class="dcfctl">
        ${pctIn('dG1', 'Büyüme, ilk yıl ($)', A.g1, -10, 40, 0.5, 'Serbest nakit akışının ilk yılki dolar bazında büyümesi; 10. yıla kadar doğrusal olarak uç büyümeye iner. Varsayılan: son yılların $ satış büyümesi (%0–10 arasına sınırlı).')}
        ${pctIn('dMargin', 'Serbest nakit akışı marjı', A.margin, -10, 40, 0.5, 'Serbest nakit akışı / satışlar. Varsayılan: son yılların ortalaması.')}
        ${pctIn('dGt', 'Uç büyüme ($)', A.gt, 0, 5, 0.25, '10. yıldan sonra sonsuza kadar yıllık büyüme (dolar). Uzun vadede dünya ekonomisinin nominal büyümesini aşmamalı.')}
        ${pctIn('dCrp', 'Ülke risk primi', A.crp, 0, 10, 0.25, 'Türkiye için ek risk primi (varsayılan %4).')}
        ${pctIn('dErp', 'Piyasa risk primi', A.erp, 2, 8, 0.25, 'Olgun piyasa hisse risk primi (varsayılan %4,5).')}
        <div class="row"><button type="button" class="btn" id="dReset">Varsayılanlara dön</button></div>
      </div>
    </div>
    <div class="tablewrap flat"><table class="grid dcfsens" id="dcfSens"></table></div>
    ${info(`Duyarlılık: hisse başı eder fiyat (₺); satırlar iskonto oranı, sütunlar ilk yıl büyümesi. Yeşil: bugünkü fiyatın üstünde; çerçeveli hücre seçili varsayımlar.`, 'Tablo nasıl okunur?')}
    <details class="dcfmore"><summary>Girdiler ve yöntem</summary>
      <table class="grid"><thead><tr><th class="tk">Dönem</th><th>Satış ($)</th><th>Serbest nakit akışı ($)</th><th>Marj</th></tr></thead><tbody>
        ${d.pts.map(p => `<tr><td class="tk">${esc(p.p)}</td><td>${fmt.big(p.rev)}</td><td class="${cls(p.fcf)}">${fmt.big(p.fcf)}</td><td>${fmt.pctPlain(p.fcf / p.rev)}</td></tr>`).join('')}
      </tbody></table>
      <dl class="kv" style="margin-top:8px">
        <dt>ABD 10 yıllık faiz</dt><dd>${fmt.pctPlain(d.rf)}</dd><dd class="note">her güncellemede</dd>
        <dt>Beta (ayarlı)</dt><dd>${F2.format(d.beta)}</dd><dd class="note">0,67 × tarihsel beta + 0,33</dd>
        <dt>Net borç</dt><dd>${fmt.big(d.nd)} $</dd><dd class="note">${d.period} bilançosu, güncel kurla</dd>
        <dt>Azınlık payları</dt><dd>${fmt.big(d.minority)} $</dd><dd class="note">özsermaye değerinden düşülür</dd>
        <dt>Özkaynak ağırlığı</dt><dd>%${Math.round(d.we * 100)}</dd><dd class="note">piyasa değeri / (piyasa değeri + finansal borç)</dd>
        <dt>Borç maliyeti</dt><dd>${fmt.pctPlain(d.rf + d.crp + d.spread)}</dd><dd class="note">ABD 10Y + ülke primi + %${F1.format(d.spread * 100)}; vergi %${Math.round(d.tax * 100)}</dd>
        <dt>USD/TRY</dt><dd>${F2.format(d.fx)}</dd><dd class="note">geçmiş dönemler kendi dönem sonu kuruyla</dd>
      </dl>
      <p class="muted" style="font-size:12px">Nakit akışları dolara çevrilip dolar iskonto oranıyla indirgenir (TL bazında %40+ iskonto ve enflasyon tahmini gerekmesin diye).
        Serbest nakit akışı = faaliyet nakit akışı − yatırım harcaması; başlangıç değeri = marj × son 12 ay satış. 1–10. yıllarda büyüme ilk yıl değerinden uç büyümeye doğrusal iner, sonrası sabit büyüyen uç değerdir.
        Özsermaye = firma değeri − net borç − azınlık payları. Sonuç varsayımlara çok duyarlıdır; tek bir sayı yerine aralığa ve fiyatın ima ettiği büyümeye bakın. Yatırım tavsiyesi değildir.</p>
    </details>`;
  const upd = () => updateDcf(s, d);
  for (const [id, k] of [['dG1', 'g1'], ['dMargin', 'margin'], ['dGt', 'gt'], ['dCrp', 'crp'], ['dErp', 'erp']]) {
    $('#' + id).addEventListener('input', e => { A[k] = +e.target.value / 100; $(`#${id}O`).textContent = '%' + F1.format(A[k] * 100); upd(); });
  }
  $('#dReset').addEventListener('click', () => renderDcfPanel(s, j));
  upd();
}

function updateDcf(s, d) {
  const w = waccOf(d, A), fcf0 = A.margin * d.rev0;
  const out = $('#dcfOut'), sens = $('#dcfSens');
  if (w.wacc <= A.gt + 0.005) { out.innerHTML = '<p class="down">İskonto oranı uç büyümeden büyük olmalı.</p>'; sens.innerHTML = ''; return; }
  if (fcf0 <= 0) { out.innerHTML = '<p class="muted">Serbest nakit akışı marjı pozitif olmalı.</p>'; sens.innerHTML = ''; return; }
  const per = v => v.eq * d.fx / d.shares;
  const v = equityValue(fcf0, A.g1, A.gt, w.wacc, d.nd, d.minority), fair = per(v);
  const ig = impliedGrowth(d.mcapUsd, fcf0, A.gt, w.wacc, d.nd, d.minority);
  out.innerHTML = `
    <div class="dcfbig"><span>Eder fiyat</span><b>${fair > 0 ? fmt.price(fair) + ' ₺' : 'negatif'}</b>
      <span class="${cls(fair / s.last - 1)}">${fair > 0 ? fmt.pct(fair / s.last - 1) + ' (fiyat ' + fmt.price(s.last) + ')' : ''}</span></div>
    <div class="dcfbig"><span title="Diğer varsayımlar sabitken bugünkü fiyatı veren ilk yıl büyümesi">Fiyatın ima ettiği büyüme</span><b>${igFmt(ig.g, ig.clip)}</b>
      <span class="muted">dolar bazında, ilk yıl; 10. yıla kadar %${F1.format(A.gt * 100).replace(',0', '')} düzeyine iner</span></div>
    <dl class="kv"><dt>İskonto oranı (WACC)</dt><dd>${fmt.pctPlain(w.wacc)}</dd><dd class="note">özkaynak maliyeti ${fmt.pctPlain(w.coe)}</dd>
      <dt>Uç değerin payı</dt><dd>%${Math.round(v.tvShare * 100)}</dd><dd class="note">değerin 10. yıldan sonrasından gelen kısmı</dd>
      <dt>Başlangıç serbest nakit akışı</dt><dd>${fmt.big(fcf0)} $</dd><dd class="note">marj × son 12 ay satış</dd></dl>`;
  // Duyarlılık: satırlar iskonto oranı, sütunlar ilk yıl büyümesi
  const ws = [-0.02, -0.01, 0, 0.01, 0.02].map(x => w.wacc + x), gs = [-0.05, -0.025, 0, 0.025, 0.05].map(x => A.g1 + x);
  sens.innerHTML = `<thead><tr><th class="tk">WACC \\ büyüme</th>${gs.map(g => `<th>${fmt.pctPlain(g)}</th>`).join('')}</tr></thead><tbody>
    ${ws.map(wc => `<tr><td class="tk">${fmt.pctPlain(wc)}</td>${gs.map(g => {
      if (wc <= A.gt + 0.005) return '<td>—</td>';
      const f = per(equityValue(fcf0, g, A.gt, wc, d.nd, d.minority));
      const base = Math.abs(wc - w.wacc) < 1e-9 && Math.abs(g - A.g1) < 1e-9;
      return `<td class="${f >= s.last ? 'up' : 'down'}${base ? ' base' : ''}">${f > 0 ? fmt.price(f) : '<0'}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
}
