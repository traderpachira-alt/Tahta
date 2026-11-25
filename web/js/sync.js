import { DATA } from './data.js';
import { $ } from './dom.js';
import { route } from './main.js';
import { migratePortfolio } from './pfcore.js';
import { KEY, hooks, state, ui } from './store.js';
import { esc } from './util.js';

/* ============================================================
   Bulut senkronizasyonu: GitHub Gist (isteğe bağlı)
   Portföy, izleme listesi, kayıtlı taramalar ve karşılaştırma listesi kullanıcının KENDİ özel Gist'inde tutulur.
   Erişim anahtarı yalnızca bu cihazın tarayıcısında saklanır (ayrı anahtar: Aktar koduna ve siteye girmez).
   Çakışma: iki cihaz birbirinden habersiz değiştirdiyse hiçbir şey üzerine yazılmaz, kullanıcıya sorulur.
   ============================================================ */
export const SYNC_KEY = 'tahta:sync', SYNC_FILE = 'tahta-portfoy.json', GH_API = 'https://api.github.com';
export const syncCfg = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; } })();
export const saveSyncCfg = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg)); } catch { /* yok say */ } };
export let sync = { state: syncCfg.token ? 'idle' : 'off', msg: '', remote: null };
export let syncTimer = null, syncBusy = false;
export const syncOn = () => !!(syncCfg.token && syncCfg.gistId);
export const syncedData = () => ({ watch: state.watch, saved: state.saved, compare: state.compare, portfolio: state.portfolio });
export const syncSig = () => JSON.stringify(syncedData());
export const localEmpty = () => !state.portfolio.length && !state.watch.length && !state.saved.length;
export const deviceName = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'Cihaz'; };
export const when = iso => iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export async function gh(path, opts = {}, token = syncCfg.token) {
  const r = await fetch(GH_API + path, { ...opts, cache: 'no-store', headers: {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!r.ok) {
    const e = new Error(r.status === 401 ? 'Anahtar geçersiz ya da süresi dolmuş.' : r.status === 404 ? 'Gist bulunamadı ya da anahtarın Gist yetkisi yok.'
      : r.status === 403 ? 'GitHub isteği reddetti (yetki ya da istek sınırı).' : `GitHub hatası (${r.status}).`);
    e.status = r.status; throw e;
  }
  return r.status === 204 ? null : r.json();
}
export async function gistRead() {
  const g = await gh(`/gists/${syncCfg.gistId}`);
  const f = g.files?.[SYNC_FILE];
  if (!f) return null;
  const content = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
  const data = JSON.parse(content);
  return { data, updatedAt: data.updatedAt || null, device: data.device || '' };
}
export async function gistWrite() {
  const body = { v: 1, updatedAt: new Date().toISOString(), device: deviceName(), ...syncedData() };
  await gh(`/gists/${syncCfg.gistId}`, { method: 'PATCH', body: JSON.stringify({ files: { [SYNC_FILE]: { content: JSON.stringify(body) } } }) });
  syncCfg.sig = syncSig(); syncCfg.remoteAt = body.updatedAt; syncCfg.lastSync = new Date().toISOString(); saveSyncCfg();
}
export function applyRemote(remote) {
  const d = remote.data || {};
  state.watch = Array.isArray(d.watch) ? d.watch.filter(x => typeof x === 'string') : [];
  state.saved = Array.isArray(d.saved) ? d.saved.filter(x => x && x.name) : [];
  state.compare = Array.isArray(d.compare) ? d.compare : ['XU100'];
  state.portfolio = migratePortfolio(d.portfolio);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* yok say */ }
  syncCfg.sig = syncSig(); syncCfg.remoteAt = remote.updatedAt; syncCfg.lastSync = new Date().toISOString(); saveSyncCfg();
  ui.pfForm = null; ui.txForm = null;
  if (DATA) route();
}
export function setSync(st, msg = '') {
  sync.state = st; sync.msg = msg;
  const bar = $('#syncBar');
  if (st === 'conflict') {
    const r = sync.remote;
    bar.innerHTML = `<span>Bulutta bu cihazdan habersiz değişiklik var (${esc(r?.device || 'başka cihaz')}, ${when(r?.updatedAt)}); bu cihazda da kaydedilmemiş değişiklik var.</span>
      <button type="button" data-sync="takeremote">Buluttakini al</button><button type="button" data-sync="keeplocal">Bu cihazdakini koru</button>`;
    bar.hidden = false;
  } else bar.hidden = true;
  document.querySelectorAll('[data-syncstatus]').forEach(el => { el.innerHTML = syncStatusHtml(); });
}
export function syncStatusHtml() {
  if (!syncCfg.token) return location.hash.startsWith('#/aktar') ? '<span class="muted">☁ Senkronizasyon kapalı</span>' : '<span class="muted">☁ Senkronizasyon kapalı · <a href="#/aktar">⚙ Ayarlar</a>\'dan açabilirsiniz</span>';
  if (sync.state === 'busy') return '<span class="muted">☁ Eşitleniyor…</span>';
  if (sync.state === 'error') return `<span class="down">☁ Eşitlenemedi: ${esc(sync.msg)}</span>`;
  if (sync.state === 'conflict') return '<span class="down">☁ Çakışma: hangi sürümün kalacağını seçin</span>';
  return `<span class="up">☁ Senkronize</span> <span class="muted">· son eşitleme ${when(syncCfg.lastSync)}</span>`;
}
export async function syncNow(force) {
  if (!syncOn() || syncBusy) return;
  syncBusy = true; clearTimeout(syncTimer); setSync('busy');
  try {
    const remote = await gistRead();
    const localDirty = syncSig() !== syncCfg.sig;
    const remoteChanged = !!remote && remote.updatedAt !== syncCfg.remoteAt;
    if (force === 'local' || !remote) await gistWrite();
    else if (force === 'remote') applyRemote(remote);
    else if (remoteChanged && localDirty) {
      if (localEmpty()) applyRemote(remote); // boş cihaz: doğrudan buluttakini al
      else { sync.remote = remote; syncBusy = false; setSync('conflict'); return; }
    } else if (remoteChanged) applyRemote(remote);
    else if (localDirty) await gistWrite();
    else { syncCfg.lastSync = new Date().toISOString(); saveSyncCfg(); }
    sync.remote = null; setSync('idle');
  } catch (e) {
    setSync('error', navigator.onLine === false ? 'çevrimdışı' : e.message);
  } finally { syncBusy = false; }
}
hooks.afterPersist = () => scheduleSync();
export function scheduleSync() {
  if (!syncOn() || sync.state === 'conflict') return;
  if (syncSig() === syncCfg.sig) return;
  clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 1500);
}
export async function syncConnect(token, gistId) {
  token = token.trim(); gistId = (gistId || '').trim().replace(/^.*gist\.github\.com\/(?:[^/]+\/)?/, '').replace(/[^0-9a-f]/gi, '');
  await gh('/user', {}, token); // anahtar geçerli mi
  if (!gistId) { // bu anahtarla daha önce oluşturulmuş Tahta Gist'i var mı?
    const list = await gh('/gists?per_page=100', {}, token);
    gistId = list.find(g => g.files && g.files[SYNC_FILE])?.id || '';
  }
  if (!gistId) {
    const body = { v: 1, updatedAt: new Date().toISOString(), device: deviceName(), ...syncedData() };
    const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Tahta portföy yedeği (özel)', public: false,
      files: { [SYNC_FILE]: { content: JSON.stringify(body) } } }) }, token);
    Object.assign(syncCfg, { token, gistId: g.id, sig: syncSig(), remoteAt: body.updatedAt, lastSync: body.updatedAt });
    saveSyncCfg(); setSync('idle'); return 'created';
  }
  Object.assign(syncCfg, { token, gistId, sig: undefined, remoteAt: undefined });
  saveSyncCfg();
  await syncNow();
  return 'joined';
}
export function syncDisconnect() {
  for (const k of Object.keys(syncCfg)) delete syncCfg[k];
  saveSyncCfg(); sync = { state: 'off', msg: '', remote: null }; setSync('off');
}
export function syncPanelHtml() {
  const on = syncOn();
  return `<section class="panel syncpanel">
    <h2>Bulut senkronizasyonu (GitHub Gist)</h2>
    <p data-syncstatus>${syncStatusHtml()}</p>
    ${on ? `
      <p class="muted" style="font-size:12px;margin:0">Portföy, izleme listesi, kayıtlı taramalar ve karşılaştırma listesi kendi özel Gist'inizde tutuluyor
        (<a href="https://gist.github.com/${esc(syncCfg.gistId)}" target="_blank" rel="noopener">Gist'i aç</a>). Diğer cihazınızda aynı anahtarı girmeniz yeterli.</p>
      <div class="row"><button type="button" class="btn primary" data-sync="now">Şimdi eşitle</button>
        <button type="button" class="btn" data-sync="disconnect">Bu cihazda kapat</button></div>
      <p class="muted" style="font-size:12px;margin:0">"Bu cihazda kapat" anahtarı yalnızca bu cihazdan siler; Gist ve verileriniz yerinde kalır.</p>`
    : `
      <p class="muted" style="font-size:13px;margin:0">Verilerinizi birden fazla cihazda otomatik eşitlemek için kendi GitHub hesabınızdaki özel bir Gist kullanılır.</p>
      <details class="info syncsetup"><summary>Kurulum adımları</summary><div>
      <ol class="steps">
        <li>GitHub'da <a href="https://github.com/settings/tokens/new?scopes=gist&description=Tahta%20senkronizasyon" target="_blank" rel="noopener">yeni bir erişim anahtarı oluşturun</a>:
          yalnızca <b>gist</b> kutusu işaretli olsun, süre olarak "No expiration" ya da uzun bir süre seçin, "Generate token" deyin.</li>
        <li>Oluşan anahtarı (ghp_ ile başlar) aşağıya yapıştırıp <b>Bağlan</b>'a basın. İlk cihazda özel bir Gist oluşturulur.</li>
        <li>Diğer cihazınızda aynı anahtarı girin; Gist kendiliğinden bulunur ve verileriniz gelir.</li>
      </ol>
      <div class="pfgrid">
        <label class="wide">Erişim anahtarı<input id="syncToken" type="password" autocomplete="off" spellcheck="false" placeholder="ghp_…"></label>
        <label class="wide">Gist kimliği <small class="muted">(isteğe bağlı; boşsa otomatik bulunur ya da oluşturulur)</small><input id="syncGist" autocomplete="off" spellcheck="false"></label>
      </div>
      <div class="row"><button type="button" class="btn primary" data-sync="connect">Bağlan</button><span id="syncMsg" role="status"></span></div>
      <p class="muted" style="font-size:12px;margin:0">Anahtar yalnızca bu cihazın tarayıcısında saklanır; taşıma koduna ve siteye girmez. Bu anahtar depolarınıza erişemez, yalnızca Gist'lerinizi yönetebilir.
        Gist'in adresini kimseyle paylaşmayın.</p></div></details>`}
  </section>`;
}
// Uygulamaya geri dönüldüğünde (sekme/uygulama tekrar görünür olunca) eşitle
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && syncOn() && Date.now() - new Date(syncCfg.lastSync || 0) > 20000) syncNow();
});
