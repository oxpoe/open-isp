/* service-notice-badge.js — badge mode status layanan di topbar admin.
   SELALU tampil; yang berbeda hanya label & warna (Normal / Gamas / Perbaikan Sistem).
   Data disuntik server-side via window.__serviceNotice. Non-invasif: tidak mengubah view. */
(function () {
  var n = window.__serviceNotice;
  if (!n || !n.mode) return;

  function labelOf() {
    if (n.badgeLabel) return n.badgeLabel;
    if (n.mode === 'GANGGUAN_MASAL') return 'Gamas';
    if (n.mode === 'PERBAIKAN') return 'Perbaikan Sistem';
    return 'Normal';
  }
  function iconOf() {
    if (n.mode === 'GANGGUAN_MASAL') return 'bi-exclamation-triangle-fill';
    if (n.mode === 'PERBAIKAN') return 'bi-tools';
    return 'bi-check-circle-fill';
  }
  function clsOf() {
    if (n.mode === 'GANGGUAN_MASAL') return 'sn-badge-danger sn-badge-pulse';
    if (n.mode === 'PERBAIKAN') return 'sn-badge-primary';
    return 'sn-badge-normal';
  }
  function titleOf() {
    if (n.mode === 'GANGGUAN_MASAL') return 'Status layanan: Gangguan Masal' + (n.estimateText ? ' \u00b7 estimasi selesai ' + n.estimateText : '');
    if (n.mode === 'PERBAIKAN') return 'Status layanan: Perbaikan Sistem' + (n.estimateText ? ' \u00b7 estimasi selesai ' + n.estimateText : '');
    return 'Status layanan: Normal (tidak ada gangguan)';
  }

  function makeBadge() {
    var a = document.createElement('a');
    a.href = '/admin/service-notice';
    a.setAttribute('data-notice-badge', '1');
    a.className = 'sn-badge ' + clsOf();
    a.title = titleOf() + ' \u2014 klik untuk ubah';
    a.innerHTML = '<i class="bi ' + iconOf() + '"></i><span>' + labelOf() + '</span>';
    return a;
  }

  function place() {
    var existing = document.querySelector('[data-notice-badge]');
    if (existing) { existing.replaceWith(makeBadge()); return true; }
    var target = document.querySelector('.topbar .tb-right') || document.querySelector('.tb-right');
    if (!target) return false;
    target.insertBefore(makeBadge(), target.firstChild);
    return true;
  }

  function init() {
    if (place()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (place() || ++tries > 20) clearInterval(t);
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('pageshow', function () { setTimeout(place, 100); });
})();
