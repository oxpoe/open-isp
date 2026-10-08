/* Membersihkan Service Worker yang salah terdaftar untuk area /admin.
   Service Worker yang benar HANYA untuk portal pelanggan (scope /customer/).
   File ini di-inject otomatis ke setiap halaman admin. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) {
      if (!r.scope || r.scope.indexOf('/customer/') === -1) {
        r.unregister().catch(function () {});
      }
    });
  }).catch(function () {});
}
