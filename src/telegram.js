import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let client = null;
let keepAliveInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Setup connection handlers untuk auto-reconnect dan keep-alive
 * @param {TelegramClient} clientInstance - Telegram client instance
 */
function setupConnectionHandlers(clientInstance) {
  if (!clientInstance) return;

  // Handle disconnect event
  clientInstance.addEventHandler(
    async (update) => {
      // Handler untuk update events (untuk keep connection alive)
    },
    { raw: true }
  );

  // Keep-alive mechanism: ping setiap 3 menit untuk menjaga koneksi
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  keepAliveInterval = setInterval(async () => {
    try {
      if (clientInstance && clientInstance.connected) {
        // Ping ke Telegram untuk keep connection alive (menggunakan getMe yang ringan)
        await clientInstance.getMe();
        reconnectAttempts = 0; // Reset reconnect attempts jika berhasil
        // Log hanya di development untuk mengurangi noise
        if (process.env.NODE_ENV !== "production") {
          console.log("✅ Keep-alive ping successful");
        }
      } else {
        console.log("⚠️  Connection lost, attempting to reconnect...");
        await reconnectClient(clientInstance);
      }
    } catch (error) {
      // Hanya log error yang signifikan
      if (!error.message.includes("AUTH_KEY_UNREGISTERED") && !error.message.includes("SESSION_REVOKED")) {
        console.error("⚠️  Keep-alive ping failed:", error.message);
      }
      // Coba reconnect jika ping gagal dan client tidak connected
      if (clientInstance && !clientInstance.connected) {
        await reconnectClient(clientInstance);
      }
    }
  }, 3 * 60 * 1000); // Ping setiap 3 menit (lebih sering untuk mencegah timeout)

  // Handle error events
  clientInstance.addEventHandler(
    async (update) => {
      if (update && update.error) {
        console.error("⚠️  Telegram client error:", update.error);
        if (!clientInstance.connected) {
          await reconnectClient(clientInstance);
        }
      }
    },
    { raw: true }
  );
}

/**
 * Reconnect client jika disconnect
 * @param {TelegramClient} clientInstance - Telegram client instance
 */
async function reconnectClient(clientInstance) {
  if (!clientInstance) return;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`❌ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Please restart the server.`);
    return;
  }

  reconnectAttempts++;
  console.log(`🔌 Attempting to reconnect... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  try {
    if (!clientInstance.connected) {
      await clientInstance.connect();
      console.log("✅ Reconnected successfully!");
      reconnectAttempts = 0; // Reset on success
    }
  } catch (error) {
    console.error(`⚠️  Reconnect attempt ${reconnectAttempts} failed:`, error.message);

    // Wait before next attempt (exponential backoff)
    const waitTime = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000); // Max 30 seconds
    console.log(`⏳ Waiting ${waitTime / 1000} seconds before next reconnect attempt...`);

    setTimeout(async () => {
      await reconnectClient(clientInstance);
    }, waitTime);
  }
}

/**
 * Helper untuk input dari console
 */
function input(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Inisialisasi Telegram Client (Userbot)
 * @param {string} apiId - API ID dari my.telegram.org
 * @param {string} apiHash - API Hash dari my.telegram.org
 * @param {string} sessionString - String session (opsional, akan dibuat otomatis jika belum ada)
 * @returns {Promise<TelegramClient>}
 */
export async function initTelegramClient(apiId, apiHash, sessionString = "") {
  // Reset reconnect attempts saat init baru
  reconnectAttempts = 0;

  if (client && client.connected) {
    return client;
  }

  // Jika sessionString kosong, coba load dari file
  let finalSessionString = sessionString;
  if (!finalSessionString) {
    finalSessionString = await loadSessionFromFile();
  }

  const session = new StringSession(finalSessionString);

  client = new TelegramClient(session, parseInt(apiId), apiHash, {
    connectionRetries: 10, // Increase retry untuk file besar
    timeout: 300000, // 5 minutes timeout (untuk file besar)
    retryDelay: 1000, // 1 second delay antar retry (lebih cepat)
    autoReconnect: true, // Auto reconnect saat disconnect
    useWSS: false, // Gunakan TCP untuk stabilitas lebih baik
  });

  // Setup event listeners untuk handle disconnect
  setupConnectionHandlers(client);

  await client.connect();

  // Jika belum login, akan meminta kode OTP
  if (!(await client.checkAuthorization())) {
    console.log("\n=== Login Telegram Userbot ===");
    console.log("Belum terautentikasi. Silakan login...\n");

    // Validasi PHONE_NUMBER
    const phoneNumber = process.env.PHONE_NUMBER;
    if (!phoneNumber || phoneNumber === "+6281234567890") {
      console.error("❌ ERROR: PHONE_NUMBER harus diisi di file .env");
      console.error("Contoh: PHONE_NUMBER=+6281234567890");
      throw new Error("PHONE_NUMBER tidak diisi di .env");
    }

    console.log(`📱 Menggunakan nomor: ${phoneNumber}`);
    console.log("📨 Kode OTP akan dikirim ke Telegram Anda...\n");

    await client.start({
      phoneNumber: async () => {
        return phoneNumber.trim();
      },
      password: async () => {
        const password = process.env.PASSWORD;
        if (!password) {
          // Di production (Railway), tidak bisa input manual
          if (process.env.RAILWAY_ENVIRONMENT || !process.stdin.isTTY) {
            throw new Error("PASSWORD harus diisi di environment variables untuk production. Jika tidak menggunakan 2FA, biarkan kosong.");
          }
          return (await input("Masukkan password 2FA (jika ada): ")).trim();
        }
        return password.trim();
      },
      phoneCode: async () => {
        // Di production (Render.com, Railway, dll), tidak bisa input manual
        if (process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || !process.stdin.isTTY) {
          throw new Error(
            "❌ Login pertama kali tidak bisa dilakukan di production environment (Render.com/Railway).\n\n" +
              "💡 SOLUSI:\n" +
              "1. Login di local machine terlebih dahulu\n" +
              "2. Copy SESSION_STRING yang muncul di console\n" +
              "3. Paste SESSION_STRING ke environment variables di Render.com/Railway\n" +
              "4. Restart service\n\n" +
              "SESSION_STRING tidak akan expire selama akun tidak diubah."
          );
        }
        console.log("⏰ Kode OTP berlaku selama beberapa menit. Masukkan kode dengan cepat!");
        const code = await input("Masukkan kode OTP yang dikirim ke Telegram: ");
        return code.trim();
      },
      onError: (err) => {
        console.error("\n❌ Error during login:", err.message);
        if (err.errorMessage === "PHONE_CODE_EXPIRED") {
          console.error("\n⚠️  Kode OTP sudah expired!");
          console.error("💡 Solusi: Restart server (Ctrl+C lalu npm start) dan masukkan kode OTP baru dengan cepat.");
        }
        throw err;
      },
    });

    // Simpan session string setelah login berhasil
    const newSessionString = client.session.save();
    if (newSessionString) {
      console.log("\n✅ Login berhasil!");

      // Simpan session ke file
      await saveSessionToFile(newSessionString);

      console.log("\n📋 SESSION_STRING (sudah disimpan ke file session.txt):");
      console.log("SESSION_STRING=" + newSessionString);
      console.log("\n⚠️  Jangan share SESSION_STRING dengan siapapun!\n");
    }
  } else {
    console.log("✅ Telegram client sudah terautentikasi");
  }

  console.log("Telegram client initialized and connected");
  return client;
}

/**
 * Parse link Telegram menjadi peer dan message_id
 * @param {string} link - Link Telegram (t.me/...)
 * @returns {Promise<{peer: any, messageId: number}>}
 */
export async function parseTelegramLink(link) {
  if (!link || typeof link !== "string") {
    throw new Error("Link tidak valid");
  }

  // Normalize link (remove https://, trailing slash, query parameters, etc)
  link = link
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("?")[0]; // Remove query parameters seperti ?single, ?embed, dll

  console.log(`🔗 Parsing link: ${link}`);

  // Format yang didukung:
  // - t.me/channelName/123
  // - t.me/channelName/123?single
  // - t.me/c/channelId/messageId
  // - t.me/c/channelId/1/messageId (dengan thread ID)
  // - t.me/c/channelId/1/messageId?single
  let match = null;
  let channelIdentifier = null;
  let messageId = null;
  let isPrivateChannel = false;

  // Cek format channel privat dulu
  // Pattern 1: t.me/c/channelId/1/messageId (dengan thread ID di tengah)
  let privatePattern = /^t\.me\/c\/(\d+)\/(\d+)\/(\d+)/;
  match = link.match(privatePattern);

  if (match && match.length >= 4) {
    // Format: t.me/c/channelId/threadId/messageId
    isPrivateChannel = true;
    channelIdentifier = match[1]; // Channel ID
    messageId = parseInt(match[3]); // Message ID (yang terakhir)
    console.log(`✅ Link channel privat terdeteksi (dengan thread ID) - Channel ID: ${channelIdentifier}, Thread ID: ${match[2]}, Message ID: ${messageId}`);
  } else {
    // Pattern 2: t.me/c/channelId/messageId (tanpa thread ID)
    privatePattern = /^t\.me\/c\/(\d+)\/(\d+)/;
    match = link.match(privatePattern);

    if (match && match.length >= 3) {
      // Format: t.me/c/channelId/messageId
      isPrivateChannel = true;
      channelIdentifier = match[1]; // Channel ID
      messageId = parseInt(match[2]); // Message ID
      console.log(`✅ Link channel privat terdeteksi - Channel ID: ${channelIdentifier}, Message ID: ${messageId}`);
    } else {
      // Cek format channel publik (t.me/channelName/messageId)
      // Support username atau ID numerik
      const publicPattern = /^t\.me\/([^\/]+)\/(\d+)/;
      match = link.match(publicPattern);

      if (match && match.length >= 3) {
        isPrivateChannel = false;
        channelIdentifier = match[1]; // Username atau ID
        messageId = parseInt(match[2]); // Message ID
        console.log(`✅ Link channel publik terdeteksi - Identifier: ${channelIdentifier}, Message ID: ${messageId}`);
      }
    }
  }

  if (!match || !messageId || !channelIdentifier) {
    console.error(`❌ Format link tidak valid: ${link}`);
    throw new Error(
      "Format link tidak valid.\n\n" +
        "Format yang didukung:\n" +
        "• t.me/channelName/123\n" +
        "• t.me/channelName/123?single\n" +
        "• t.me/c/channelId/123\n" +
        "• t.me/c/channelId/1/123 (dengan thread ID)\n\n" +
        "Link yang diberikan: " +
        link
    );
  }

  // Validasi channelIdentifier tidak boleh "c"
  if (channelIdentifier === "c") {
    throw new Error("Format link tidak valid. Pastikan link menggunakan format: t.me/c/channelId/messageId (bukan t.me/c/c/...)");
  }

  if (!client || !client.connected) {
    throw new Error("Telegram client belum terhubung");
  }

  // Resolve channel/chat
  let peer = null;

  try {
    if (isPrivateChannel) {
      // Format t.me/c/channelId/messageId - channel privat
      // Channel ID perlu dikonversi ke format -100XXXXXXXXXX
      const channelId = channelIdentifier;
      const channelIdNum = BigInt(channelId);
      const fullChannelId = `-100${channelId}`;
      const negativeChannelId = `-${channelId}`;

      console.log(`🔍 Mencoba mengakses channel privat dengan ID: ${channelId}`);

      try {
        // Metode 1: Coba dengan getDialogs untuk mencari channel yang sudah di-join (paling reliable)
        // Ini akan menemukan channel jika userbot sudah join, bahkan tanpa access hash
        console.log(`📋 Mencari channel di dialogs...`);
        const dialogs = await client.getDialogs({ limit: 500 }); // Increase limit untuk lebih banyak channel
        const foundDialog = dialogs.find((d) => {
          if (d.entity && d.entity.id) {
            const entityId = d.entity.id.toString();
            const entityIdValue = d.entity.id.value ? d.entity.id.value.toString() : null;

            // Cek berbagai format ID
            return (
              entityId === channelId ||
              entityId === fullChannelId ||
              entityId === negativeChannelId ||
              entityIdValue === channelId ||
              entityIdValue === fullChannelId ||
              entityIdValue === negativeChannelId ||
              (typeof d.entity.id === "bigint" && d.entity.id.toString() === channelIdNum.toString())
            );
          }
          return false;
        });

        if (foundDialog && foundDialog.entity) {
          peer = foundDialog.entity;
          console.log(`✅ Channel ditemukan dari dialogs: ${peer.title || peer.id || peer.username || "Unknown"}`);
        } else {
          throw new Error("Channel tidak ditemukan di dialogs");
        }
      } catch (err1) {
        console.log(`⚠️  Mencari di dialogs gagal: ${err1.message}`);

        try {
          // Metode 2: Coba dengan format -100XXXXXXXXXX (format standar untuk channel/supergroup)
          console.log(`🔍 Mencoba dengan format -100...`);
          peer = await client.getEntity(fullChannelId);
          console.log(`✅ Channel ditemukan dengan format -100: ${peer.title || peer.id || peer.username || "Unknown"}`);
        } catch (err2) {
          console.log(`⚠️  Format -100 gagal: ${err2.message}`);

          try {
            // Metode 3: Coba dengan format negatif biasa
            console.log(`🔍 Mencoba dengan format negatif...`);
            peer = await client.getEntity(negativeChannelId);
            console.log(`✅ Channel ditemukan dengan format negatif: ${peer.title || peer.id || peer.username || "Unknown"}`);
          } catch (err3) {
            console.log(`⚠️  Format negatif gagal: ${err3.message}`);

            try {
              // Metode 4: Coba dengan resolveUsername atau getEntity menggunakan berbagai format
              // Skip metode ini karena memerlukan access hash yang tidak kita punya
              // Langsung ke metode 5
              throw new Error("Skip resolvePeer, langsung ke metode berikutnya");
            } catch (err4) {
              console.log(`⚠️  ResolvePeer gagal: ${err4.message}`);

              // Metode 5: Coba langsung dengan ID numerik (last resort)
              try {
                console.log(`🔍 Mencoba dengan ID numerik langsung...`);
                peer = await client.getEntity(parseInt(channelId));
                console.log(`✅ Channel ditemukan dengan ID numerik: ${peer.title || peer.id || peer.username || "Unknown"}`);
              } catch (err5) {
                console.log(`⚠️  Semua metode gagal`);
                throw new Error(
                  `Tidak dapat mengakses channel privat dengan ID ${channelId}.\n\n` +
                    `Pastikan:\n` +
                    `1. Userbot adalah member dari channel tersebut\n` +
                    `2. Channel ID benar: ${channelId}\n` +
                    `3. Userbot sudah pernah membuka channel di aplikasi Telegram (setidaknya sekali)\n` +
                    `4. Userbot memiliki akses untuk melihat pesan di channel tersebut\n\n` +
                    `💡 Tips:\n` +
                    `- Buka channel tersebut di aplikasi Telegram dengan akun userbot terlebih dahulu\n` +
                    `- Pastikan userbot sudah join ke channel/grup tersebut\n` +
                    `- Jika channel adalah grup privat, pastikan userbot adalah member aktif`
                );
              }
            }
          }
        }
      }
    } else {
      // Format t.me/channelName/messageId - bisa username atau ID
      if (channelIdentifier.match(/^-?\d+$/)) {
        // ID numerik
        try {
          peer = await client.getEntity(channelIdentifier);
        } catch (err) {
          // Coba dengan format -100
          try {
            peer = await client.getEntity(`-100${channelIdentifier}`);
          } catch (err2) {
            throw new Error(`Tidak dapat mengakses channel dengan ID ${channelIdentifier}`);
          }
        }
      } else {
        // Username
        peer = await client.getEntity(channelIdentifier);
      }
    }
  } catch (error) {
    if (error.message.includes("Tidak dapat mengakses") || error.message.includes("member dari channel")) {
      throw error;
    }
    throw new Error(`Tidak dapat mengakses channel: ${error.message}`);
  }

  if (!peer) {
    throw new Error("Channel tidak ditemukan atau tidak memiliki akses");
  }

  return { peer, messageId };
}

/**
 * Mengambil pesan dari Telegram
 * @param {any} peer - Peer object (channel/chat)
 * @param {number} messageId - ID pesan
 * @returns {Promise<any>}
 */
export async function getMessage(peer, messageId) {
  if (!client || !client.connected) {
    throw new Error("Telegram client belum terhubung");
  }

  try {
    console.log(`🔍 Mencari pesan dengan ID: ${messageId} di peer: ${peer.title || peer.id || peer.username || "Unknown"}`);

    // Coba ambil pesan dengan ID spesifik
    let messages = await client.getMessages(peer, {
      ids: [messageId],
    });

    // Jika tidak ditemukan, coba dengan limit dan cari manual
    if (!messages || messages.length === 0) {
      console.log(`⚠️  Pesan tidak ditemukan dengan ID langsung, mencoba dengan limit...`);
      messages = await client.getMessages(peer, {
        limit: 100,
      });

      if (messages && messages.length > 0) {
        const foundMessage = messages.find((m) => m.id === messageId);
        if (foundMessage) {
          console.log(`✅ Pesan ditemukan dengan pencarian manual`);
          return foundMessage;
        }
      }
    }

    if (!messages || messages.length === 0) {
      throw new Error(`Pesan dengan ID ${messageId} tidak ditemukan`);
    }

    const message = messages[0];
    console.log(`✅ Pesan ditemukan - ID: ${message.id}, Text: ${message.text ? message.text.substring(0, 30) : "No text"}...`);
    return message;
  } catch (error) {
    console.error(`❌ Error mengambil pesan:`, error);
    if (error.message.includes("tidak ditemukan")) {
      throw error;
    }
    throw new Error(`Gagal mengambil pesan: ${error.message}`);
  }
}

/**
 * Helper untuk menampilkan progress bar di terminal
 * @param {number} current - Bytes yang sudah didownload
 * @param {number} total - Total bytes
 */
function showProgressBar(current, total) {
  if (!total || total === 0) {
    process.stdout.write(`\r📥 Downloading... ${formatBytes(current)}`);
    return;
  }

  const percentage = Math.min(100, Math.round((current / total) * 100));
  const barLength = 30;
  const filledLength = Math.round((barLength * percentage) / 100);
  const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

  const currentFormatted = formatBytes(current);
  const totalFormatted = formatBytes(total);

  process.stdout.write(`\r📥 [${bar}] ${percentage}% (${currentFormatted}/${totalFormatted})`);
}

/**
 * Format bytes ke format yang readable
 * @param {number} bytes - Bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Get file size dari message media
 * @param {any} message - Objek pesan
 * @returns {number} - File size dalam bytes, atau 0 jika tidak diketahui
 */
function getFileSize(message) {
  if (!message.media) return 0;

  // Untuk document
  if (message.media.document && message.media.document.size) {
    return message.media.document.size;
  }

  // Untuk photo (biasanya ada sizes array)
  if (message.media.photo && message.media.photo.sizes) {
    const sizes = message.media.photo.sizes;
    if (Array.isArray(sizes) && sizes.length > 0) {
      // Ambil size terbesar
      const largest = sizes.reduce((prev, curr) => {
        return (curr.size || 0) > (prev.size || 0) ? curr : prev;
      });
      return largest.size || 0;
    }
  }

  return 0;
}

/**
 * Download media dari pesan Telegram
 * @param {any} message - Objek pesan dari Telegram
 * @param {string} outputPath - Path untuk menyimpan file
 * @returns {Promise<string>} - Path file yang berhasil didownload
 */
export async function downloadMedia(message, outputPath) {
  if (!client || !client.connected) {
    throw new Error("Telegram client belum terhubung");
  }

  // Cek apakah pesan memiliki media
  if (!message.media) {
    throw new Error("Pesan tidak mengandung media");
  }

  // Cek jenis media - lebih komprehensif
  const mediaTypes = [
    "MessageMediaPhoto",
    "MessageMediaDocument",
    "MessageMediaVideo",
    "MessageMediaAudio",
    "MessageMediaVoice",
    "MessageMediaVideoNote",
    "MessageMediaSticker",
    "MessageMediaGif",
    "photo",
    "document",
    "video",
    "audio",
    "voice",
    "videoNote",
    "sticker",
    "gif",
  ];

  const className = message.media.className || "";
  const classNameLower = className.toLowerCase();

  // Cek berdasarkan className
  let hasMedia = mediaTypes.some((type) => {
    return classNameLower.includes(type.toLowerCase());
  });

  // Jika tidak match dengan className, cek berdasarkan property
  if (!hasMedia) {
    hasMedia = !!(message.media.photo || message.media.document || message.media.video || message.media.audio || message.media.voice || message.media.videoNote || message.media.sticker || message.media.gif);
  }

  if (!hasMedia) {
    console.log(`⚠️  Media tidak didukung untuk download`);
    console.log(`⚠️  Media className: ${className}`);
    console.log(`⚠️  Media properties:`, Object.keys(message.media).join(", "));
    throw new Error(`Pesan tidak mengandung media yang dapat didownload. Media type: ${className || "Unknown"}`);
  }

  try {
    // Pastikan folder downloads ada
    const downloadsDir = path.join(__dirname, "..", "downloads");
    await fs.mkdir(downloadsDir, { recursive: true });

    // Get file size untuk progress bar
    const fileSize = getFileSize(message);
    const fileSizeMB = fileSize / (1024 * 1024);

    if (fileSize > 0) {
      console.log(`\n📊 File size: ${formatBytes(fileSize)} (${fileSizeMB.toFixed(2)} MB)`);
    } else {
      console.log(`\n📊 File size: Unknown (akan ditampilkan saat download)`);
    }

    console.log(`📥 Starting download...\n`);

    let lastProgress = 0;
    let lastUpdateTime = Date.now();
    let downloadAttempts = 0;
    const maxDownloadAttempts = 5; // Maksimal 5 kali retry

    // Download file dengan retry mechanism untuk file besar
    let buffer;
    let downloadSuccess = false;

    while (!downloadSuccess && downloadAttempts < maxDownloadAttempts) {
      try {
        downloadAttempts++;
        if (downloadAttempts > 1) {
          console.log(`\n🔄 Retry download (attempt ${downloadAttempts}/${maxDownloadAttempts})...\n`);
          // Tunggu sebentar sebelum retry
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Kurangi dari 3s ke 2s
        }

        // Optimize progress callback - update lebih jarang untuk performa lebih baik
        // Untuk file besar, update setiap 1 detik atau setiap 5MB
        const progressUpdateInterval = fileSize > 100 * 1024 * 1024 ? 1000 : 500; // 1s untuk file > 100MB, 500ms untuk file kecil
        const progressUpdateBytes = 5 * 1024 * 1024; // Update setiap 5MB

        // Download file dengan progress callback yang dioptimasi
        buffer = await client.downloadMedia(message, {
          outputFile: outputPath,
          progressCallback: (received, total) => {
            const now = Date.now();
            const bytesDiff = received - lastProgress;

            // Update jika:
            // 1. Sudah lewat interval waktu (1s untuk file besar, 500ms untuk kecil)
            // 2. Sudah download 5MB lebih
            // 3. Download selesai
            if (now - lastUpdateTime >= progressUpdateInterval || bytesDiff >= progressUpdateBytes || received === total) {
              showProgressBar(received, total);
              lastProgress = received;
              lastUpdateTime = now;
            }
          },
        });

        downloadSuccess = true;
      } catch (error) {
        console.log(`\n⚠️  Download attempt ${downloadAttempts} failed: ${error.message}`);

        // Cek apakah error karena connection issue
        const isConnectionError = error.message.includes("disconnect") || error.message.includes("connection") || error.message.includes("timeout") || error.message.includes("ECONNRESET") || error.message.includes("ETIMEDOUT");

        if (isConnectionError && downloadAttempts < maxDownloadAttempts) {
          console.log(`💡 Connection error detected, will retry...`);

          // Cek apakah file sudah ada dan tidak kosong (resume capability)
          try {
            const existingStats = await fs.stat(outputPath);
            if (existingStats.size > 0) {
              console.log(`📊 Existing file found: ${formatBytes(existingStats.size)}`);
              console.log(`💡 Will resume from existing file...`);
            }
          } catch (e) {
            // File tidak ada, akan download dari awal
          }

          // Reconnect client jika perlu
          if (!client.connected) {
            console.log(`🔌 Reconnecting to Telegram...`);
            try {
              await client.connect();
              console.log(`✅ Reconnected successfully`);
            } catch (reconnectError) {
              console.log(`⚠️  Reconnect failed: ${reconnectError.message}`);
            }
          }
        } else {
          // Bukan connection error atau sudah max attempts
          throw error;
        }
      }
    }

    if (!downloadSuccess) {
      throw new Error(`Download failed after ${maxDownloadAttempts} attempts`);
    }

    // New line setelah progress bar selesai
    console.log(`\n`);

    // Jika buffer dikembalikan (tidak langsung ke file), simpan manual
    if (buffer) {
      const fileExists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);

      if (!fileExists) {
        await fs.writeFile(outputPath, buffer);
      }
    }

    // Verifikasi file berhasil dibuat
    const stats = await fs.stat(outputPath);
    if (stats.size === 0) {
      throw new Error("File yang didownload kosong");
    }

    console.log(`✅ Download completed: ${formatBytes(stats.size)}`);
    return outputPath;
  } catch (error) {
    // New line untuk memastikan progress bar tidak mengganggu error message
    console.log(`\n`);

    // Cek apakah file sudah ada dan tidak kosong (untuk resume capability)
    let shouldDeleteFile = true;
    try {
      const existingStats = await fs.stat(outputPath);
      if (existingStats.size > 0) {
        console.log(`⚠️  Download failed, but partial file exists: ${formatBytes(existingStats.size)}`);
        console.log(`💡 File tidak dihapus, bisa digunakan untuk resume di download berikutnya`);
        shouldDeleteFile = false;
      }
    } catch (e) {
      // File tidak ada, akan dihapus
    }

    // Hapus file hanya jika kosong atau tidak ada
    if (shouldDeleteFile) {
      try {
        await fs.unlink(outputPath);
      } catch (unlinkError) {
        // Ignore jika file tidak ada
      }
    }

    throw new Error(`Gagal download media: ${error.message}`);
  }
}

/**
 * Get file size dari message (untuk notifikasi)
 * @param {any} message - Objek pesan
 * @returns {number} - File size dalam bytes
 */
export function getMessageFileSize(message) {
  return getFileSize(message);
}

/**
 * Generate nama file untuk media
 * @param {any} message - Objek pesan
 * @param {string} extension - Ekstensi file (opsional)
 * @returns {string}
 */
export function generateFileName(message, extension = null) {
  const timestamp = Date.now();
  const messageId = message.id || timestamp;

  if (!extension) {
    // Coba dapatkan extension dari media
    if (message.media) {
      if (message.media.className === "MessageMediaPhoto") {
        extension = "jpg";
      } else if (message.media.className === "MessageMediaDocument") {
        const document = message.media.document;
        if (document && document.mimeType) {
          const mimeParts = document.mimeType.split("/");
          extension = mimeParts[1] || "bin";
          // Normalize extension
          if (extension === "x-matroska") extension = "mkv";
          if (extension === "quicktime") extension = "mov";
        } else {
          extension = "bin";
        }
      } else {
        extension = "bin";
      }
    } else {
      extension = "bin";
    }
  }

  return `media_${messageId}_${timestamp}.${extension}`;
}

/**
 * Get Telegram client instance
 * @returns {TelegramClient|null}
 */
export function getClient() {
  return client;
}

/**
 * Cleanup resources (clear intervals, disconnect, etc)
 */
export function cleanup() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  if (client) {
    client.disconnect().catch(() => {
      // Ignore disconnect errors
    });
  }
}

/**
 * Load session from file
 * @returns {Promise<string>}
 */
export async function loadSessionFromFile() {
  try {
    const sessionPath = path.join(__dirname, "..", "session.txt");
    const sessionString = await fs.readFile(sessionPath, "utf-8");
    return sessionString.trim();
  } catch (error) {
    // File tidak ada atau error, return empty string
    return "";
  }
}

/**
 * Save session to file
 * @param {string} sessionString - Session string
 */
export async function saveSessionToFile(sessionString) {
  try {
    const sessionPath = path.join(__dirname, "..", "session.txt");
    await fs.writeFile(sessionPath, sessionString, "utf-8");
    console.log("💾 Session disimpan ke: session.txt");
  } catch (error) {
    console.error("⚠️  Gagal menyimpan session ke file:", error.message);
  }
}
