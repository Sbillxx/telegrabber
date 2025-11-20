import express from "express";
import dotenv from "dotenv";
import { initTelegramClient, loadSessionFromFile, parseTelegramLink, getMessage, downloadMedia, generateFileName } from "./telegram.js";
import { validateDownloadRequest, normalizeTelegramLink, formatErrorResponse, getDownloadsPath, generatePublicUrl } from "./utils.js";
import { initBot, startBot, stopBot } from "./bot.js";
import path from "path";
import fs from "fs/promises";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware (opsional, untuk development)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Telegram Downloader API",
    version: "1.0.0",
    endpoints: {
      "POST /api/download": "Download media dari link Telegram",
      "GET /health": "Health check",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Main download endpoint
app.post("/api/download", async (req, res) => {
  try {
    // Validasi request
    const validation = validateDownloadRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    // Normalize link
    const link = normalizeTelegramLink(req.body.link);

    // Parse link Telegram
    let peer, messageId;
    try {
      const parsed = await parseTelegramLink(link);
      peer = parsed.peer;
      messageId = parsed.messageId;
    } catch (error) {
      const errorResponse = formatErrorResponse(error);
      return res.status(errorResponse.statusCode).json({
        success: false,
        error: errorResponse.message,
        details: error.message,
      });
    }

    // Ambil pesan
    let message;
    try {
      message = await getMessage(peer, messageId);
    } catch (error) {
      const errorResponse = formatErrorResponse(error);
      return res.status(errorResponse.statusCode).json({
        success: false,
        error: errorResponse.message,
        details: error.message,
      });
    }

    // Generate nama file
    const fileName = generateFileName(message);
    const outputPath = path.join(getDownloadsPath(), fileName);

    // Download media
    let downloadedPath;
    try {
      downloadedPath = await downloadMedia(message, outputPath);
    } catch (error) {
      const errorResponse = formatErrorResponse(error);
      return res.status(errorResponse.statusCode).json({
        success: false,
        error: errorResponse.message,
        details: error.message,
      });
    }

    // Get relative path untuk response
    const relativePath = path.relative(process.cwd(), downloadedPath);

    // Generate public URL melalui tunnel
    const publicUrl = generatePublicUrl(downloadedPath);

    // Success response
    const response = {
      success: true,
      file: relativePath,
      absolutePath: downloadedPath,
      messageId: message.id,
      timestamp: new Date().toISOString(),
    };

    // Tambahkan publicUrl jika tunnel dikonfigurasi
    if (publicUrl) {
      response.publicUrl = publicUrl;
    }

    res.json(response);
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    details: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint tidak ditemukan",
  });
});

// Initialize Telegram client dan start server
async function startServer() {
  try {
    // Validasi environment variables
    const apiId = process.env.API_ID;
    const apiHash = process.env.API_HASH;
    const sessionString = process.env.SESSION_STRING || "";

    // Validasi API_ID dan API_HASH
    if (!apiId || !apiHash) {
      console.error("ERROR: API_ID dan API_HASH harus diisi di file .env");
      console.error("Dapatkan dari: https://my.telegram.org/apps");
      process.exit(1);
    }

    // Cek apakah masih menggunakan placeholder
    if (apiId === "your_api_id_here" || apiHash === "your_api_hash_here") {
      console.error("ERROR: API_ID dan API_HASH masih menggunakan placeholder!");
      console.error("Silakan edit file .env dan ganti dengan nilai yang sebenarnya.");
      console.error("Dapatkan API credentials dari: https://my.telegram.org/apps");
      process.exit(1);
    }

    // Validasi format API_ID (harus angka)
    if (isNaN(parseInt(apiId))) {
      console.error("ERROR: API_ID harus berupa angka!");
      console.error(`Nilai saat ini: ${apiId}`);
      process.exit(1);
    }

    // Validasi format API_HASH (harus string alphanumeric)
    if (apiHash.length < 32) {
      console.error("ERROR: API_HASH tidak valid!");
      console.error("API_HASH biasanya berupa string panjang (32+ karakter)");
      process.exit(1);
    }

    // Validasi PHONE_NUMBER (jika belum ada SESSION_STRING)
    if (!sessionString) {
      const phoneNumber = process.env.PHONE_NUMBER;
      if (!phoneNumber || phoneNumber === "+6281234567890") {
        console.error("ERROR: PHONE_NUMBER harus diisi di file .env untuk login pertama kali");
        console.error("Contoh: PHONE_NUMBER=+6281234567890");
        console.error("Atau jika sudah punya SESSION_STRING, isi SESSION_STRING di .env");
        process.exit(1);
      }
    }

    // Start Express server TERLEBIH DAHULU
    // Ini penting agar Render.com bisa detect port yang terbuka
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`\n🚀 Server berjalan di http://0.0.0.0:${PORT}`);
      console.log(`📥 Endpoint download: POST http://localhost:${PORT}/api/download`);
      console.log(`\nContoh request:`);
      console.log(`curl -X POST http://localhost:${PORT}/api/download \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"link": "https://t.me/channelName/123"}'`);
    });

    // Pastikan folder downloads ada
    const downloadsPath = getDownloadsPath();
    await fs.mkdir(downloadsPath, { recursive: true });
    console.log(`Downloads folder: ${downloadsPath}`);

    // Initialize Telegram client (userbot)
    console.log("Menginisialisasi Telegram client (userbot)...");

    // Load session from file jika ada, atau gunakan dari .env
    let finalSessionString = sessionString;
    if (!finalSessionString) {
      finalSessionString = await loadSessionFromFile();
    }

    try {
      await initTelegramClient(apiId, apiHash, finalSessionString);
      console.log("✅ Telegram client (userbot) berhasil diinisialisasi");
    } catch (error) {
      console.error("⚠️  Warning: Gagal menginisialisasi Telegram client:", error.message);
      console.error("⚠️  Server tetap berjalan, tapi fitur download tidak akan berfungsi.");
      console.error("⚠️  Pastikan API_ID, API_HASH, dan SESSION_STRING sudah benar.");
    }

    // Initialize Telegram Bot
    const botToken = process.env.BOT_TOKEN;
    if (!botToken || botToken === "your_bot_token_here") {
      console.error("❌ ERROR: BOT_TOKEN harus diisi di file .env");
      console.error("Dapatkan dari @BotFather di Telegram");
      console.error("⚠️  Server tetap berjalan, tapi bot tidak akan berfungsi.");
    } else {
      try {
        console.log("Menginisialisasi Telegram Bot...");
        initBot(botToken);
        await startBot();
        console.log("✅ Telegram Bot berhasil diinisialisasi");
      } catch (error) {
        console.error("⚠️  Warning: Gagal menginisialisasi Telegram Bot:", error.message);
        console.error("⚠️  Server tetap berjalan, tapi bot tidak akan berfungsi.");
      }
    }
  } catch (error) {
    console.error("Gagal memulai server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nMenghentikan server...");
  await stopBot();
  const { getClient } = await import("./telegram.js");
  const client = getClient();
  if (client) {
    await client.disconnect();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nMenghentikan server...");
  await stopBot();
  const { getClient } = await import("./telegram.js");
  const client = getClient();
  if (client) {
    await client.disconnect();
  }
  process.exit(0);
});

// Start server
startServer();
