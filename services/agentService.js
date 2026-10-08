/**
 * Catatan: modul PPOB/pulsa sudah dihapus dari fork ini. Layanan agent (saldo, komisi, voucher) tetap aktif.
 * File ini hanya stub agar require lama tidak crash.
 */
const noop = async () => null;
const noop0 = () => null;
module.exports = new Proxy({}, {
  get: () => (async () => null)
});
