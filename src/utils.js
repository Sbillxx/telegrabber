import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validasi link Telegram
 * @param {string} link - Link untuk divalidasi
 * @returns {boolean}
 */
export function isValidTelegramLink(link) {
  if (!link || typeof link !== "string") {
    return false;
  }

  const telegramPattern = /^https?:\/\/(www\.)?t\.me\//;
  return telegramPattern.test(link);
}

/**
 * Normalize link Telegram (menghapus trailing slash, dll)
 * @param {string} link - Link untuk dinormalisasi
 * @returns {string}
 */
export function normalizeTelegramLink(link) {
  if (!link) return "";

  return link.trim().replace(/\/$/, "");
}

/**
 * Get path absolut untuk folder downloads
 * @returns {string}
 */
export function getDownloadsPath() {
  return path.join(__dirname, "..", "downloads");
}

/**
 * Format error untuk response API
 * @param {Error} error - Error object
 * @returns {object}
 */
export function formatErrorResponse(error) {
  const errorMessages = {
    "Link tidak valid": 400,
    "Format link tidak valid": 400,
    "Tidak dapat mengakses channel": 403,
    "Channel tidak ditemukan": 404,
    "Pesan tidak ditemukan": 404,
    "Pesan tidak mengandung media": 400,
    "Gagal download media": 500,
    "Telegram client belum terhubung": 503,
  };

  const message = error.message || "Internal server error";
  const statusCode = errorMessages[message] || 500;

  return {
    statusCode,
    message,
    error: error.message,
  };
}

/**
 * Validasi request body
 * @param {object} body - Request body
 * @returns {object} - { valid: boolean, error?: string }
 */
export function validateDownloadRequest(body) {
  if (!body) {
    return { valid: false, error: "Request body tidak boleh kosong" };
  }

  if (!body.link) {
    return { valid: false, error: "Field 'link' wajib diisi" };
  }

  if (typeof body.link !== "string") {
    return { valid: false, error: "Field 'link' harus berupa string" };
  }

  if (!isValidTelegramLink(body.link)) {
    return { valid: false, error: "Link Telegram tidak valid" };
  }

  return { valid: true };
}

