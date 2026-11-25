import { destroyCharts } from './detail.js';
import { view } from './dom.js';
import { normalize } from './backup.js';
import { state, ui } from './store.js';
import { syncPanelHtml } from './sync.js';
import { esc, fmt } from './util.js';

/* ============================================================
   Aktarma: izleme listesi ve kayıtlı taramaları kodla taşı
   ============================================================ */
export const b64e = str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
export const exportCode = () => 'T1.' + b64e(JSON.stringify({ w: state.watch, s: state.saved, c: state.compare, p: state.portfolio }));
export function parseCode(code) {
  const m = String(code).trim().match(/(?:#\/aktar\/)?(T1\.[A-Za-z0-9_-]+)\s*$/);
  if (!m) throw new Error('Kod tanınmadı. "T1." ile başlayan kodun tamamını yapıştırın.');
  return normalize(JSON.parse(b64d(m[1].slice(3))));
}
export function renderTransfer(incoming) {
  destroyCharts();
  document.title = 'Ayarlar ve yedek · Tahta';
  const code = exportCode();
  const link = `${location.origin}${location.pathname}#/aktar/${code}`;
  let preview = '';
  if (incoming) {
    try {
      const d = parseCode(incoming);
      preview = `<p class="note-ok">Bu bağlantıda <b>${d.w.length}</b> izleme listesi hissesi, <b>${d.s.length}</b> kayıtlı tarama ve <b>${d.p.length}</b> portföy varlığı var. Eklemek için aşağıdaki <b>İçe aktar</b> düğmesine basın.</p>`;
    } catch (e) { preview = `<p class="note-fx">${esc(e.message)}</p>`; }
  }
  view.innerHTML = `
  <section class="dhead"><div><h1>Ayarlar ve yedek</h1><p class="sub">Portföyünüz, izleme listeniz ve kayıtlı taramalarınız yalnızca bu cihazda saklanır. Kaybolmaması için yedekleyin ya da başka bir cihaza taşıyın.</p></div></section>
  ${backupPanelHtml()}
  ${syncPanelHtml()}
  <h2 class="sechead">Başka bir cihaza tek seferlik taşıma</h2>
  <div class="panels two">
    <section class="panel">
      <h2>Bu cihazdan gönder</h2>
      <p>İzleme listesi: <b>${state.watch.length}</b> hisse · Kayıtlı tarama: <b>${state.saved.length}</b> · Portföy: <b>${state.portfolio.length}</b> varlık</p>
      <label class="muted" for="exportLink" style="font-size:12px">Bağlantı (diğer cihazda açınca kod hazır gelir)</label>
      <textarea id="exportLink" class="code" rows="3" readonly>${esc(link)}</textarea>
      <div class="row"><button type="button" class="btn" data-copy="exportLink">Bağlantıyı kopyala</button><button type="button" class="btn" data-copy="exportCode">Yalnızca kodu kopyala</button><span class="muted" id="copyMsg" role="status"></span></div>
      <textarea id="exportCode" class="code" rows="2" readonly hidden>${esc(code)}</textarea>
    </section>
    <section class="panel">
      <h2>Bu cihaza ekle</h2>
      ${preview}
      <label class="muted" for="importCode" style="font-size:12px">Kodu ya da bağlantıyı yapıştırın</label>
      <textarea id="importCode" class="code" rows="3" placeholder="T1.…">${esc(incoming || '')}</textarea>
      <div class="row"><button type="button" class="btn primary" id="importBtn">İçe aktar</button><span id="importMsg" role="status"></span></div>
      <p class="muted" style="font-size:12px">Mevcut listeniz silinmez; yeni hisseler eklenir, aynı adlı taramalar güncellenir.</p>
    </section>
  </div>`;
}
// Yedek dosyası paneli
export function backupPanelHtml() {
  const b = ui.backup;
  const when = iso => iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : 'tarihi bilinmiyor';
  const loaded = b?.data ? `
      <div class="note-ok" style="color:inherit">
        <b>${esc(b.file)}</b> (${when(b.data.created)}): ${b.data.p.length} portföy varlığı
        (${b.data.p.reduce((a, p) => a + p.txs.length, 0)} işlem), ${b.data.w.length} izleme hissesi, ${b.data.s.length} kayıtlı tarama.
      </div>
      <div class="row">
        <button type="button" class="btn primary" data-backup="merge">Birleştir</button>
        <button type="button" class="btn${b.armed ? ' danger' : ''}" data-backup="replace">${b.armed ? 'Eminim, tümünü değiştir' : 'Tümünü değiştir'}</button>
        <button type="button" class="btn" data-backup="cancel">Vazgeç</button>
      </div>
      ${b.armed ? `<p class="down" style="font-size:13px;margin:0">Bu cihazdaki ${state.portfolio.length} portföy varlığı, ${state.watch.length} izleme hissesi ve ${state.saved.length} tarama silinip yedektekiyle değiştirilecek${b.sync ? ' (Gist\'e de yansır)' : ''}. Onaylamak için tekrar basın.</p>` : ''}
      <p class="muted" style="font-size:12px;margin:0"><b>Birleştir</b>: mevcut kayıtlar korunur, yedekteki yeni kayıtlar eklenir, aynı kayıtlar yedektekiyle güncellenir.
        <b>Tümünü değiştir</b>: bu cihazdaki veriler yedekteki hâline döner (yedekten sonra eklenenler silinir).</p>` : '';
  return `<section class="panel backuppanel">
    <h2>Yedek dosyası</h2>
    <p class="muted" style="font-size:13px;margin:0">Portföyünüzü, izleme listenizi ve kayıtlı taramalarınızı bir dosyaya indirin; gerektiğinde geri yükleyin.
      Dosya yalnızca sizde kalır.${state.lastBackup ? ` Son yedek: <b>${fmt.date(state.lastBackup.slice(0, 10))}</b>.` : ''}</p>
    <div class="row">
      <button type="button" class="btn primary" data-backup="download">Yedeği indir</button>
      <label class="btn" for="backupFile">Yedekten yükle…</label>
      <input type="file" id="backupFile" accept=".json,application/json" hidden>
      <span id="backupMsg" role="status" class="${b?.err ? 'down' : b?.done ? 'up' : 'muted'}">${esc(b?.err || b?.done || '')}</span>
    </div>
    ${loaded}
  </section>`;
}
