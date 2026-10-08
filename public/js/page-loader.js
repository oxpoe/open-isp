/* page-loader.js — Animasi saat berpindah halaman.
   - Muncul saat klik link (navigasi same-origin) / submit form.
   - Sembunyi saat halaman baru selesai dimuat atau saat PWA resume (bfcache).
   - Fallback timer: bila tak jadi navigasi (mis. AJAX), loader otomatis disembunyikan. */
(function () {
  var bar = null, ov = null, tShow = null, tBar = null, tFallback = null, w = 0;

  function build() {
    if (bar || !document.body) return;
    bar = document.createElement('div'); bar.id = 'pgbar';
    ov = document.createElement('div'); ov.id = 'pgload';
    ov.innerHTML = '<div class="pgbox"><div class="pgspin"></div><div class="pgtxt">Memuat…</div></div>';
    document.body.appendChild(bar);
    document.body.appendChild(ov);
  }

  function startBar() {
    build(); if (!bar) return;
    w = 8; bar.classList.add('on'); bar.style.width = '8%';
    clearInterval(tBar);
    tBar = setInterval(function () { w = Math.min(w + Math.max(2, (90 - w) * 0.12), 90); bar.style.width = w.toFixed(1) + '%'; }, 220);
  }

  function show(delay, fallbackMs) {
    build();
    clearTimeout(tShow); clearTimeout(tFallback);
    tShow = setTimeout(function () { startBar(); if (ov) ov.classList.add('on'); }, delay == null ? 150 : delay);
    if (fallbackMs) tFallback = setTimeout(hide, fallbackMs);
  }

  function hide() {
    clearTimeout(tShow); clearTimeout(tFallback); clearInterval(tBar);
    if (bar) { bar.style.width = '100%'; bar.classList.remove('on'); }
    if (ov) ov.classList.remove('on');
    setTimeout(function () { if (bar) bar.style.width = '0'; }, 300);
  }

  function samePage(u) {
    try { return u.origin === location.origin && u.pathname === location.pathname && u.search === location.search; } catch (e) { return false; }
  }
  function eligible(a) {
    if (!a) return false;
    if (a.hasAttribute('download') || a.target === '_blank' || a.hasAttribute('data-no-loader')) return false;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;
    if (/^(mailto:|tel:|javascript:|blob:|data:)/i.test(href)) return false;
    var u; try { u = new URL(a.href, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) return false;
    if (samePage(u) && !u.hash) return false;
    return true;
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (eligible(a)) show(150, 12000); // navigasi nyata → fallback lama
  }, true);

  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented) return;
    var f = e.target;
    if (!f || f.hasAttribute('data-no-loader') || f.target === '_blank') return;
    // Bisa jadi AJAX → fallback lebih pendek; bila navigasi nyata, dokumen berganti & timer hilang
    show(120, 2500);
  }, true);

  window.addEventListener('pageshow', hide);
  window.addEventListener('load', hide);
  document.addEventListener('DOMContentLoaded', function () { if (bar) hide(); });
})();
