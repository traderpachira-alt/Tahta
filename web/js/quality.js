import { DATA } from './data.js';
import { $ } from './dom.js';
import { F1, F2, esc, fmt, ok, info } from './util.js';

/* ============================================================
   Hisse sayfası: temettü güvenliği, F-skoru, verim bandı ve mali tablolar
   Veri: data/fin/KOD.json → {st: mali tablo özeti, f: F-skoru dökümü, ds: güvenlik skoru bileşenleri, payout}
   ============================================================ */
const FIN = new Map();
export async function loadFin(t) {
  if (FIN.has(t)) return FIN.get(t);
  const r = await fetch(`data/fin/${encodeURIComponent(t)}.json`, { cache: 'no-cache' });
  const j = r.ok ? await r.json() : null;
  FIN.set(t, j);
  return j;
}

const DS_LABELS = {
  payout: ['Dağıtma oranı (kâra göre)', 'Son 12 ayda ödenen temettü / son 12 ay ana ortaklık net kârı. ≤%40: 20 · ≤%60: 15 · ≤%80: 8 · ≤%100: 3 · üstü ya da zarar: 0'],
  fcfCover: ['Serbest nakit akışı karşılama', '(Faaliyet nakit akışı − yatırım harcaması) / ödenen temettü, son 12 ay. ≥2x: 20 · ≥1,5x: 16 · ≥1x: 10 · ≥0,5x: 4 · altı: 0. Son 12 ayda temettü yoksa nakit akışı pozitifse 10'],
  leverage: ['Net borç / FAVÖK', 'Net nakit: 15 · ≤1x: 13 · ≤2x: 9 · ≤3x: 4 · üstü ya da FAVÖK negatif: 0'],
  continuity: ['Süreklilik', 'Son 5 takvim yılının ödeme yapılan her biri 2 puan; 5+ yıl kesintisiz ödemeye +5'],
  cuts: ['Kesinti geçmişi', 'Tamamlanmış son 3 yılda yıllık temettünün bir önceki yılın %90\'ının altına düştüğü yıl sayısı. 0: 10 · 1: 5 · 2+: 0'],
  roe: ['Özkaynak kârlılığı', '≥%25: 10 · ≥%15: 6 · ≥%5: 3 · altı: 0. Yüksek enflasyonda düşük özkaynak kârlılığı reel olarak sermaye eritir'],
  fscore: ['F-skoru', 'Piotroski F-skoru / 9 × 10'],
};
const dsVal = (k, v) => !ok(v) ? (k === 'fcfCover' ? 'temettü yok' : '—')
  : k === 'payout' || k === 'roe' ? fmt.pctPlain(v)
  : k === 'fcfCover' ? F1.format(v) + 'x'
  : k === 'leverage' ? (v <= 0 ? 'net nakit' : F1.format(v) + 'x')
  : k === 'continuity' ? `${v}/5 yıl`
  : k === 'cuts' ? `${v} kesinti`
  : k === 'fscore' ? `${v}/9` : String(v);

const F_ITEMS = [
  ['Varlık kârlılığı pozitif', 'Son 12 ay net kâr / bir yıl önceki toplam varlıklar > 0', 'pct'],
  ['Faaliyet nakit akışı pozitif', 'Son 12 ay işletme faaliyetlerinden nakit > 0', 'big'],
  ['Varlık kârlılığı arttı', 'Bu yılın son 12 ay varlık kârlılığı > bir önceki yılınki', 'pct'],
  ['Nakit akışı > net kâr', 'Kârın nakde dönüşmesi (tahakkuk kalitesi)', 'big'],
  ['Uzun vadeli borç/varlık azaldı', 'Uzun vadeli finansal borç / ortalama varlıklar, bir yıl öncesine göre', 'pct'],
  ['Cari oran arttı', 'Dönen varlıklar / kısa vadeli yükümlülükler, bir yıl öncesine göre', 'x'],
  ['Bedelli sermaye artırımı yok', 'Son 12 ayda nakit sermaye artırımı yapılmadı (bedelsiz sayılmaz)', 'big'],
  ['Brüt marj arttı', 'Son 12 ay brüt kâr / satışlar, bir yıl öncesine göre', 'pct'],
  ['Varlık devir hızı arttı', 'Son 12 ay satışlar / dönem başı varlıklar, bir yıl öncesine göre', 'x'],
];
const fv = (v, kind) => !ok(v) ? '—' : kind === 'pct' ? fmt.pctPlain(v) : kind === 'x' ? F2.format(v) : fmt.big(v);
const scoreCls = (x, hi, mid) => x >= hi ? 'hi' : x >= mid ? 'mid' : 'lo';

function bandHtml(s) {
  if (!ok(s.yieldPctAbs) || !ok(s.yieldMax) || s.yieldMax <= 0) {
    return `<p class="muted" style="font-size:13px">Verim bandı hesaplanamadı${ok(s.ttmYield) && s.ttmYield === 0 ? ' (son 12 ayda temettü yok)' : ' (en az 2 yıl temettü ve 1 yıldan uzun fiyat geçmişi gerekir)'}.</p>`;
  }
  const pos = v => Math.max(0, Math.min(100, (v - s.yieldMin) / (s.yieldMax - s.yieldMin || 1) * 100));
  const mk = DATA.mktYield, mkp = DATA.mktYieldPct;
  const rel = ok(s.yieldRel);
  return `<div class="band">
      <div class="band-head"><span>Son 12 ay verim <b class="num">${fmt.pctPlain(s.ttmYield)}</b>${rel ? ` <span class="muted">· piyasanın ${F2.format(s.yieldRel)} katı</span>` : ''}</span>
        <span class="score ${scoreCls(s.yieldPct, 0.8, 0.4)}" title="Piyasaya göre verimin kendi geçmişindeki dilimi">%${Math.round(s.yieldPct * 100)}. dilim</span></div>
      <div class="bar"><span class="med" style="left:${pos(s.yieldMed)}%" title="Medyan ${fmt.pctPlain(s.yieldMed)}"></span><span class="dot" style="left:${pos(s.ttmYield)}%"></span></div>
      <div class="ends"><span>en düşük ${fmt.pctPlain(s.yieldMin)}</span><span>medyan ${fmt.pctPlain(s.yieldMed)}</span><span>en yüksek ${fmt.pctPlain(s.yieldMax)}</span></div>
      <dl class="kv bandkv">
        <dt>Piyasaya göre (ana ölçü)</dt><dd>${rel ? `%${Math.round(s.yieldPct * 100)}. dilim` : '—'}</dd><dd class="note">hisse verimi / piyasa verimi, kendi 4 yılına göre</dd>
        <dt>Mutlak</dt><dd>%${Math.round(s.yieldPctAbs * 100)}. dilim</dd><dd class="note">çubuktaki konum</dd>
        ${ok(mk) ? `<dt>Piyasa verimi</dt><dd>${fmt.pctPlain(mk)}</dd><dd class="note">${ok(mkp) ? `4 yılın %${Math.round(mkp * 100)}. diliminde` : ''}</dd>` : ''}
      </dl>
      ${info(`Piyasa genelinde verim yükseldiğinde (ör. 2022'de ~%1, bugün ~%3) her hisse kendi geçmişine göre "ucuz" görünür. Bu yüzden ana ölçü,
        hissenin piyasaya göre veriminin kendi geçmişindeki yeridir: üst dilimler hissenin piyasaya göre her zamankinden ucuz olduğunu gösterir. Temettü kesilecekse yanıltıcıdır; güvenlik skoruyla birlikte okuyun.`, 'Neden piyasaya göre?')}
    </div>`;
}

export function renderQualityPanel(s, j) {
  const el = $('#qualPanel');
  if (!el) return;
  const ds = j?.ds, f = j?.f;
  // Hiçbir bölüm hesaplanamadıysa kartı gösterme
  el.hidden = !ds && !f?.fItems && !(ok(s.yieldPctAbs) && ok(s.yieldMax) && s.yieldMax > 0);
  if (el.hidden) return;
  const dsHtml = !ds ? `<p class="muted">${(s.divCur || s.divPrev) ? 'Skor için yeterli mali tablo verisi yok.' : 'Son iki takvim yılında temettü ödemediği için temettü güvenlik skoru hesaplanmaz.'}</p>` : `
    <div class="bigscore"><span class="score ${ok(s.dsScore) ? scoreCls(s.dsScore, 70, 50) : ''}">${ok(s.dsScore) ? s.dsScore : '—'}</span><span class="muted">/ 100</span>
      ${ok(s.dsScore) ? '' : '<span class="muted" style="font-size:12px">bileşenlerin çoğu eksik</span>'}</div>
    <table class="grid parts"><tbody>${ds.map(([k, pts, mx, v]) => {
      const [label, hint] = DS_LABELS[k] || [k, ''];
      return `<tr title="${esc(hint)}"><td class="tk">${label}</td><td class="num">${pts == null ? '—' : dsVal(k, v)}</td>
        <td class="pbar">${pts == null ? '<span class="muted">uygulanmaz</span>' : `<span class="meter"><i style="width:${pts / mx * 100}%"></i></span>`}</td>
        <td class="num">${pts == null ? '' : `${F1.format(pts).replace(',0', '')}/${mx}`}</td></tr>`;
    }).join('')}</tbody></table>
    ${info(`Satırın üzerine gelince (telefonda dokununca) puanlama eşikleri görünür. Uygulanamayan ya da verisi olmayan bileşenler hesaba katılmaz; puan kalanların toplamına göre 100'e ölçeklenir.`)}`;
  const fHtml = !f?.fItems ? `<p class="muted">${s.finGroup === 'UFRS' ? 'Bankalarda kalem yapısı farklı olduğu için hesaplanmaz.' : 'Mali tablo verisi yetersiz.'}</p>` : `
    <div class="bigscore"><span class="score ${ok(s.fScore) ? scoreCls(s.fScore, 7, 4) : ''}">${ok(s.fScore) ? s.fScore : '—'}</span><span class="muted">/ 9</span></div>
    <table class="grid parts"><thead><tr><th class="tk"></th><th>Şimdi</th><th>Bir yıl önce</th></tr></thead><tbody>${F_ITEMS.map(([label, hint, kind], i) => {
      const it = f.fItems[i], [a, b] = f.fVals?.[i] || [];
      const mark = it == null ? '<span class="muted">?</span>' : it ? '<span class="up">✓</span>' : '<span class="down">✗</span>';
      const prevShown = [2, 4, 5, 7, 8].includes(i) ? fv(b, kind) : i === 3 ? `net kâr ${fv(b, kind)}` : '';
      return `<tr title="${esc(hint)}"><td class="tk">${mark} ${label}</td><td class="num">${fv(a, kind)}</td><td class="num muted">${prevShown}</td></tr>`;
    }).join('')}</tbody></table>
    ${info(`Son 12 ay, bir yıl önceki son 12 ayla karşılaştırılır. Enflasyon muhasebesi (TMS 29) nedeniyle tutarlar yaklaşıktır; kriterlerin çoğu oran olduğu için daha az etkilenir.`)}`;
  el.innerHTML = `<h2>Temettü güvenliği ve finansal kalite</h2>
    <div class="qualgrid">
      <div><h3>Temettü güvenlik skoru</h3>${dsHtml}</div>
      <div><h3>Verim bandı</h3>${bandHtml(s)}<h3 style="margin-top:16px">Piotroski F-skoru</h3>${fHtml}</div>
    </div>`;
}

/* --- Mali tablolar --- */
let finMode = 'q';
const qLabel = p => { const [y, m] = p.split('/'); return `${{ 3: 'Ç1', 6: 'Ç2', 9: 'Ç3', 12: 'Ç4' }[m]} ${y.slice(2)}`; };
export function renderFinPanel(s, j) {
  const el = $('#finPanel');
  if (!el) return;
  const st = j?.st;
  el.hidden = !st;
  if (!st) return;
  const q = finMode === 'q';
  const heads = q ? st.q.map(qLabel) : st.y.map(String);
  const rows = st.rows.map(([k, label, kind, qv, yv]) => {
    const vals = q ? qv : yv;
    const nums = vals.filter(ok), mx = Math.max(...nums.map(Math.abs), 0);
    const cell = v => kind === 'r' ? (k === 'cr' || k === 'ldr' ? (ok(v) ? F2.format(v) : '—') : fmt.pctPlain(v)) : fmt.big(v);
    const spark = kind === 'r' || !mx ? '' : `<span class="spark">${vals.map(v => `<i class="${ok(v) && v < 0 ? 'neg' : ''}" style="height:${ok(v) ? Math.max(4, Math.abs(v) / mx * 100) : 0}%"></i>`).join('')}</span>`;
    return `<tr class="${kind === 'r' ? 'ratio' : ''}"><td class="tk">${label}</td><td class="sp">${spark}</td>${vals.map(v => `<td class="${ok(v) && v < 0 ? 'down' : ''}">${cell(v)}</td>`).join('')}</tr>`;
  }).join('');
  el.innerHTML = `<h2>Mali tablolar <span class="muted" style="font-weight:400">· ₺</span></h2>
    <div class="seg" role="group" aria-label="Dönem">
      <button type="button" data-finmode="q" aria-pressed="${q}">Çeyreklik</button>
      <button type="button" data-finmode="y" aria-pressed="${!q}">Yıllık</button>
    </div>
    <div class="tablewrap flat"><table class="grid fintable"><thead><tr><th class="tk">Kalem</th><th></th>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    ${info(`Kaynak: İş Yatırım mali tabloları (konsolide). Çeyreklik: yalnızca o çeyreğin tutarı (bilanço kalemleri dönem sonu).${st.group === 'XI_29' ? ` FAVÖK = faaliyet kârı + amortisman;
      serbest nakit akışı = faaliyet nakit akışı − yatırım harcaması.` : ''} Enflasyon muhasebesi (TMS 29) nedeniyle her rapor kendi dönem sonu satın alma gücüyle yayımlanır; dönemler arası tutar karşılaştırmaları yaklaşıktır.`, 'Kaynak ve notlar')}`;
  el.querySelectorAll('[data-finmode]').forEach(b => b.addEventListener('click', () => { finMode = b.dataset.finmode; renderFinPanel(s, j); }));
}
