/* theme-toggle.js — switch tema global (portal & pelanggan).
   - Sinkronkan data-theme + data-bs-theme + class .light-theme + color-scheme
   - Pakai #topbarThemeBtn / .theme-fab yang sudah ada, jika tidak buat floating.
   - MutationObserver: bila skrip lain mengubah data-theme, atribut lain ikut sinkron (live).
   - pageshow/visibilitychange: menyegarkan saat PWA resume / bfcache. */
(function () {
  var KEY = 'landing-theme';
  function current() { return document.documentElement.getAttribute('data-theme') || 'dark'; }
  function syncIcon() {
    var isLight = current() === 'light';
    var btn = document.getElementById('topbarThemeBtn');
    if (btn) { var i = btn.querySelector('i'); if (i) i.className = isLight ? 'bi bi-moon-stars' : 'bi bi-sun'; }
  }
  function sync() {
    var isLight = current() === 'light';
    var bs = isLight ? 'light' : 'dark';
    if (document.documentElement.getAttribute('data-bs-theme') !== bs) document.documentElement.setAttribute('data-bs-theme', bs);
    if (document.documentElement.classList.contains('light-theme') !== isLight) document.documentElement.classList.toggle('light-theme', isLight);
    if (document.body && document.body.classList.contains('light-theme') !== isLight) document.body.classList.toggle('light-theme', isLight);
    try { if (document.documentElement.style.colorScheme !== bs) document.documentElement.style.colorScheme = bs; } catch (e) {}
    syncIcon();
  }
  function apply(t) {
    t = t || (function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } })() || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    sync();
    return t;
  }
  window.applyTheme = apply;
  window.toggleTheme = function () {
    var cur = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, cur); } catch (e) {}
    apply(cur);
    try { document.body && document.body.getBoundingClientRect(); } catch (e) {} // paksa repaint
  };
  apply();

  // Bila skrip lain (mis. toggleDashTheme) mengubah data-theme, sinkronkan atribut lain
  try { new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] }); } catch (e) {}

  function bind(el) {
    if (!el || el.dataset.themeBound || el.hasAttribute('onclick')) return;
    el.dataset.themeBound = '1';
    el.addEventListener('click', function (e) { e.preventDefault(); window.toggleTheme(); });
  }
  function mount() {
    var top = document.getElementById('topbarThemeBtn');
    if (top) { bind(top); syncIcon(); return; }
    var fab = document.querySelector('.theme-fab');
    if (fab) { bind(fab); return; }
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'theme-fab';
    b.setAttribute('aria-label', 'Ganti tema'); b.setAttribute('title', 'Mode Gelap / Terang');
    b.innerHTML = '<i class="bi bi-circle-half"></i>';
    b.addEventListener('click', window.toggleTheme);
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.addEventListener('pageshow', function () { apply(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
})();
