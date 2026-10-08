/* admin-toast.js — Notifikasi bertema untuk seluruh admin.
 *  - toast(...)         : popup kecil (opsional, untuk info ringan)
 *  - notify(...)        : OVERLAY layar blur + ikon + teks (untuk hasil aksi)
 *  - notifyLoading(...) : OVERLAY blur + spinner (proses berjalan)
 *  Otomatis:
 *    - banner flash (.alert[data-flash]) -> overlay notify
 *    - window.alert() -> overlay notify
 *    - submit form POST -> notifyLoading (blur + spinner)
 */
(function () {
  if (window.__adminNotify) return;
  window.__adminNotify = true;

  var CSS = [
    /* ---- overlay ---- */
    '.nf-ov{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(4,7,12,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:0;transition:opacity .25s ease}',
    '.nf-ov.show{display:flex;opacity:1}',
    '.nf-card{background:var(--bg2,#161b22);border:1px solid var(--border,rgba(255,255,255,.14));border-radius:18px;padding:32px 26px;max-width:min(92vw,410px);width:100%;text-align:center;box-shadow:0 26px 70px rgba(0,0,0,.6);transform:scale(.9);transition:transform .3s cubic-bezier(.2,.9,.3,1.25)}',
    '.nf-ov.show .nf-card{transform:scale(1)}',
    '.nf-spin{width:56px;height:56px;margin:0 auto 16px;border:4px solid var(--pdim,rgba(173,255,47,.2));border-top-color:var(--primary,#ADFF2F);border-radius:50%;animation:nfspin .8s linear infinite}',
    '@keyframes nfspin{to{transform:rotate(360deg)}}',
    '.nf-ic{font-size:60px;line-height:1;display:block;margin:0 auto 12px;animation:nfpop .35s cubic-bezier(.2,.9,.3,1.4)}',
    '@keyframes nfpop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}',
    '.nf-success{color:var(--success,#3fb950)} .nf-error{color:var(--danger,#f85149)} .nf-warning{color:var(--warning,#d29922)} .nf-info{color:var(--info,#58a6ff)}',
    '.nf-title{font-size:17px;font-weight:800;margin-bottom:7px;color:var(--text,#e6edf3)}',
    '.nf-msg{font-size:13.5px;color:var(--muted,#7d8590);line-height:1.55;max-height:46vh;overflow:auto;word-break:break-word}',
    '.nf-msg b,.nf-msg code{color:var(--text,#e6edf3)}',
    '.nf-close{margin-top:18px;background:var(--pdim,rgba(173,255,47,.14));color:var(--primary,#ADFF2F);border:1px solid var(--primary,#ADFF2F);border-radius:10px;padding:8px 18px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}',
    '.nf-close:hover{filter:brightness(1.1)}',
    'html[data-theme="light"] .nf-card,html.light-theme .nf-card{background:#fff;border-color:#e2e8f0}',
    'html[data-theme="light"] .nf-title,html.light-theme .nf-title{color:#0f172a}',
    'html[data-theme="light"] .nf-msg,html.light-theme .nf-msg{color:#475569}',
    'html[data-theme="light"] .nf-ov,html.light-theme .nf-ov{background:rgba(226,232,240,.55)}',
    /* ---- toast kecil ---- */
    '.toast-wrap{position:fixed;top:16px;right:16px;z-index:2147482900;display:flex;flex-direction:column;gap:10px;max-width:min(92vw,430px);pointer-events:none}',
    '.toast{pointer-events:auto;display:flex;gap:11px;align-items:flex-start;background:var(--bg2,#161b22);border:1px solid var(--border,rgba(255,255,255,.14));border-left:4px solid var(--info,#58a6ff);border-radius:12px;padding:12px 14px;box-shadow:0 16px 44px rgba(0,0,0,.5);color:var(--text,#e6edf3);transform:translateX(120%);opacity:0;transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .28s;font-size:13px;line-height:1.4}',
    '.toast.show{transform:translateX(0);opacity:1}',
    '.toast-ic{font-size:18px;line-height:1.15;margin-top:1px;flex:0 0 auto}',
    '.toast-body{flex:1;min-width:0}.toast-title{font-weight:700;margin-bottom:2px}.toast-msg{opacity:.94;word-break:break-word}',
    '.toast-x{margin-left:6px;background:transparent;border:none;color:var(--muted,#7d8590);font-size:19px;line-height:1;cursor:pointer;padding:0 2px}',
    '.toast-success{border-left-color:var(--success,#3fb950)} .toast-success .toast-ic{color:var(--success,#3fb950)}',
    '.toast-error{border-left-color:var(--danger,#f85149)} .toast-error .toast-ic{color:var(--danger,#f85149)}',
    '.toast-warning{border-left-color:var(--warning,#d29922)} .toast-warning .toast-ic{color:var(--warning,#d29922)}',
    '.toast-info{border-left-color:var(--info,#58a6ff)} .toast-info .toast-ic{color:var(--info,#58a6ff)}',
    /* ---- mobile ---- */
    '@media(max-width:520px){.nf-ov{padding:14px;align-items:center}.nf-card{padding:26px 18px;border-radius:16px;max-width:100%}.nf-ic{font-size:50px}.nf-title{font-size:15.5px}.nf-msg{font-size:13px;max-height:52vh}.toast-wrap{top:10px;right:10px;left:10px;max-width:none}}'
  ].join('\n');

  function ensureCss() {
    if (document.getElementById('adminNotifyCss')) return;
    var st = document.createElement('style'); st.id = 'adminNotifyCss'; st.textContent = CSS; document.head.appendChild(st);
  }

  var ICONS = { success: 'bi-check-circle-fill', error: 'bi-x-octagon-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };

  function autoDur(type, text, base) {
    var len = String(text || '').length;
    var b = base || (type === 'error' ? 2800 : type === 'warning' ? 2400 : 2000);
    return Math.min(b + Math.floor(len / 60) * 900, 12000);
  }

  /* ================= TOAST (kecil) ================= */
  function toastWrap() {
    ensureCss();
    var w = document.getElementById('adminToastWrap');
    if (!w) { w = document.createElement('div'); w.id = 'adminToastWrap'; w.className = 'toast-wrap'; document.body.appendChild(w); }
    return w;
  }
  window.toast = function (type, title, message, opts) {
    try {
      if (type && typeof type === 'object') { opts = type; type = opts.type; title = opts.title; message = opts.message || opts.text; }
      type = String(type || 'info'); if (!ICONS[type]) type = 'info';
      opts = opts || {};
      var w = toastWrap();
      var el = document.createElement('div');
      el.className = 'toast toast-' + type;
      el.innerHTML = '<i class="bi ' + ICONS[type] + ' toast-ic"></i><div class="toast-body">' + (title ? '<div class="toast-title">' + title + '</div>' : '') + '<div class="toast-msg">' + (message == null ? '' : message) + '</div></div><button class="toast-x">&times;</button>';
      w.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('show'); });
      var dur = opts.duration || autoDur(type, (title || '') + ' ' + (message || ''));
      var t = setTimeout(close, dur);
      function close() { el.classList.remove('show'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 280); }
      el.querySelector('.toast-x').addEventListener('click', function () { clearTimeout(t); close(); });
      el.addEventListener('mouseenter', function () { clearTimeout(t); });
      el.addEventListener('mouseleave', function () { t = setTimeout(close, 2200); });
    } catch (e) { }
  };

  /* ================= OVERLAY (blur + ikon) ================= */
  var _ovTimer = null;
  function ov() {
    ensureCss();
    var el = document.getElementById('nfOv');
    if (!el) {
      el = document.createElement('div'); el.id = 'nfOv'; el.className = 'nf-ov';
      el.innerHTML = '<div class="nf-card" role="alertdialog" aria-live="assertive"><div class="nf-spin"></div><i class="bi nf-ic"></i><div class="nf-title"></div><div class="nf-msg"></div><button type="button" class="nf-close">Tutup</button></div>';
      document.body.appendChild(el);
      el.querySelector('.nf-close').addEventListener('click', hideOv);
      el.addEventListener('click', function (e) { if (e.target === el) hideOv(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideOv(); });
    }
    return el;
  }
  function hideOv() { var el = document.getElementById('nfOv'); if (!el) return; clearTimeout(_ovTimer); el.classList.remove('show'); }
  window.closeNotify = hideOv;

  window.notifyLoading = function (text, title) {
    var el = ov();
    el.querySelector('.nf-spin').style.display = '';
    var ic = el.querySelector('.nf-ic'); ic.style.display = 'none'; ic.className = 'bi nf-ic';
    var t = el.querySelector('.nf-title'); if (title) { t.style.display = ''; t.textContent = title; } else { t.style.display = 'none'; t.textContent = ''; }
    el.querySelector('.nf-msg').innerHTML = text || '';
    el.querySelector('.nf-close').style.display = 'none';
    clearTimeout(_ovTimer);
    el.classList.add('show');
    return { loading: window.notifyLoading, done: function (ty, ti, ms) { window.notify(ty, ti, ms); }, close: hideOv };
  };

  window.notify = function (type, title, message, opts) {
    if (type && typeof type === 'object') { opts = type; type = opts.type; title = opts.title; message = opts.message || opts.text; }
    type = String(type || 'info'); if (!ICONS[type]) type = 'info';
    opts = opts || {};
    var el = ov();
    el.querySelector('.nf-spin').style.display = 'none';
    var ic = el.querySelector('.nf-ic'); ic.style.display = ''; ic.className = 'bi ' + ICONS[type] + ' nf-ic nf-' + type;
    var t = el.querySelector('.nf-title'); if (title) { t.style.display = ''; t.textContent = title; } else { t.style.display = 'none'; t.textContent = ''; }
    el.querySelector('.nf-msg').innerHTML = (message == null ? '' : message);
    el.querySelector('.nf-close').style.display = '';
    clearTimeout(_ovTimer);
    el.classList.add('show');
    var dur = opts.duration != null ? opts.duration : autoDur(type, (title || '') + ' ' + (message || ''));
    if (dur > 0) _ovTimer = setTimeout(hideOv, dur);
    return el;
  };

  /* ================= integrasi otomatis ================= */
  function flashType(cls) {
    if (cls.indexOf('alert-s') !== -1) return 'success';
    if (cls.indexOf('alert-d') !== -1) return 'error';
    if (cls.indexOf('alert-w') !== -1) return 'warning';
    return 'info';
  }
  function convertFlash() {
    var list = document.querySelectorAll('.alert[data-flash]');
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var type = flashType(a.className || '');
      var html = a.innerHTML.replace(/^\s*<i[^>]*>\s*<\/i>\s*/i, '').trim();
      a.style.display = 'none';
      (function (tp, h) {
        var title = tp === 'success' ? 'Berhasil' : tp === 'error' ? 'Gagal' : tp === 'warning' ? 'Perhatian' : 'Info';
        // tampilkan overlay langsung (aksi sudah selesai setelah redirect)
        window.notify(tp, title, h);
      })(type, html);
    }
  }
  window.__adminFlashToNotify = convertFlash;

  var _nativeAlert = window.alert;
  window.alert = function (msg) {
    try {
      var t = String(msg == null ? '' : msg);
      var low = t.toLowerCase();
      var isErr = /gagal|error|tidak |invalid|tidak valid|kosong|forbidden|ditolak|harus|wajib|salah|exception|kedaluwarsa|tidak ditemukan|not found|401|403|500/.test(low);
      var type = isErr ? 'error' : 'success';
      window.notify(type, isErr ? 'Gagal' : 'Berhasil', t.replace(/\n/g, '<br>'));
    } catch (e) { try { _nativeAlert(msg); } catch (_) { } }
  };

  // form POST → tampilkan loading blur
  document.addEventListener('submit', function (e) {
    try {
      var f = e.target;
      if (!f || f.tagName !== 'FORM') return;
      if ((f.getAttribute('method') || 'get').toLowerCase() !== 'post') return;
      if (f.getAttribute('target') === '_blank') return;
      if (f.hasAttribute('data-no-loading')) return;
      if (e.defaultPrevented) return;
      window.notifyLoading(f.getAttribute('data-loading') || 'Menyimpan perubahan…', 'Mohon tunggu');
    } catch (_) { }
  }, false);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', convertFlash);
  else convertFlash();
})();
