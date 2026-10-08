const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDir = path.join(__dirname, '../public/uploads/attendance');

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureUploadDir();
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `attendance-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadAttendance = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Hanya file gambar yang diperbolehkan (JPEG, PNG, WebP)'));
  }
});

function removeAttendanceFile(file) {
  if (!file) return;
  const targetPath = typeof file === 'string' ? file : file.path;
  if (!targetPath) return;

  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  } catch (err) {
    // Ignore cleanup failures so the main request can finish.
  }
}

module.exports = {
  uploadAttendance,
  removeAttendanceFile
};
