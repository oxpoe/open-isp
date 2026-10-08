/* admin-theme-sync.js — Menjaga konsistensi tema admin (dark/light).
   PENTING: observer TIDAK boleh menulis ulang `data-theme` (bisa memicu loop). */
(function () {
  var KEY = 'app-theme';
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  // Sinkronkan atribut turunan berdasarkan data-theme saat ini (tanpa menulis data-theme).
  function syncAttrs() {
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var bs = isLight ? 'light' : 'dark';
    if (document.documentElement.getAttribute('data-bs-theme') !== bs) document.documentElement.setAttribute('data-bs-theme', bs);
    if (document.documentElement.classList.contains('light-theme') !== isLight) document.documentElement.classList.toggle('light-theme', isLight);
    if (document.body && document.body.classList.contains('light-theme') !== isLight) document.body.classList.toggle('light-theme', isLight);
    try { if (document.documentElement.style.colorScheme !== bs) document.documentElement.style.colorScheme = bs; } catch (e) {}
  }

  function applyTheme(t) {
    t = t || read() || 'dark';
    if (document.documentElement.getAttribute('data-theme') !== t) document.documentElement.setAttribute('data-theme', t);
    syncAttrs();
    return t;
  }

  window.__applyAdminTheme = applyTheme;
  applyTheme();

  // Observer hanya menyinkronkan atribut turunan (AMAN, tanpa loop).
  try { new MutationObserver(syncAttrs).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] }); } catch (e) {}

  window.addEventListener('DOMContentLoaded', function () { applyTheme(); });
  window.addEventListener('pageshow', function () { applyTheme(); });

  if (typeof window.toggleAppTheme !== 'function') {
    window.toggleAppTheme = function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(KEY, cur); } catch (e) {}
      applyTheme(cur);
      if (typeof window.updateThemeToggleIcons === 'function') window.updateThemeToggleIcons(cur);
    };
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.theme-toggle-btn') : null;
    if (!btn) return;
    if (btn.dataset.themeDelegate === '1') return;
    btn.dataset.themeDelegate = '1';
    if (!btn.hasAttribute('onclick')) { e.preventDefault(); window.toggleAppTheme(); }
  }, true);
})();

// ── Dropdown Aksi (kebab menu) ──
// Menu di-"portal" ke <body> saat terbuka, lalu diposisikan fixed relatif tombol.
// Ini menghilangkan SEMUA pengaruh ancestor (overflow tabel/kartu, stacking, dsb)
// sehingga menu selalu solid & tampil utuh di mana pun (termasuk baris Lunas).
var _actOpen = null, _actMenu = null, _actHome = null;
function actCloseAll() {
  if (_actMenu) {
    try { _actMenu.classList.remove('fixed', 'up'); _actMenu.style.left = ''; _actMenu.style.top = ''; } catch (e) {}
    try {
      if (_actHome && _actHome.parent) _actHome.parent.insertBefore(_actMenu, _actHome.next);
      else document.body.appendChild(_actMenu);
    } catch (e) {}
  }
  document.querySelectorAll('.act.open').forEach(function (x) { x.classList.remove('open'); });
  _actOpen = null; _actMenu = null; _actHome = null;
}
function actPlace(btn, menu) {
  menu.style.left = '0px'; menu.style.top = '0px';
  var w = menu.offsetWidth, h = menu.offsetHeight;
  var br = btn.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight, pad = 8, gap = 6;
  var left = br.right - w;                          // rata kanan ke tombol
  if (left + w > vw - pad) left = vw - pad - w;
  if (left < pad) left = pad;
  var top = br.bottom + gap;                        // default: di bawah
  if (top + h > vh - pad) top = br.top - gap - h;   // tak cukup -> ke atas
  if (top < pad) top = pad;
  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
}
window.actToggle = function (e, btn) {
  try { if (e) { e.preventDefault(); e.stopPropagation(); } } catch (_) {}
  var a = btn && btn.closest ? btn.closest('.act') : null; if (!a) return;
  var wasOpen = a.classList.contains('open');
  actCloseAll();
  if (!wasOpen) {
    a.classList.add('open');
    var menu = a.querySelector('.act-menu');
    if (!menu) return;
    _actOpen = a; _actMenu = menu;
    _actHome = { parent: menu.parentNode, next: menu.nextSibling };
    document.body.appendChild(menu);   // pindah ke body
    menu.classList.add('fixed');
    actPlace(btn, menu);
  }
};
// klik di luar menu -> tutup; klik di dalam menu -> biarkan aksi jalan dulu, tutup setelahnya
document.addEventListener('click', function (ev) {
  if (_actMenu && ev.target && _actMenu.contains(ev.target)) { setTimeout(actCloseAll, 0); return; }
  actCloseAll();
});
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') actCloseAll(); });
window.addEventListener('scroll', actCloseAll, true);
window.addEventListener('resize', actCloseAll);
