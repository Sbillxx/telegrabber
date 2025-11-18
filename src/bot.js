import { Bot, Context, InputFile } from "grammy";
import { initTelegramClient, parseTelegramLink, getMessage, downloadMedia, generateFileName, getMessageFileSize } from "./telegram.js";
import { getDownloadsPath } from "./utils.js";
import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";

let bot = null;
const userStates = new Map(); // Store user state untuk conversation flow

/**
 * Initialize Telegram Bot
 * @param {string} botToken - Bot token dari BotFather
 * @returns {Bot}
 */
export function initBot(botToken) {
  if (bot) {
    return bot;
  }

  bot = new Bot(botToken);

  // Command: /start
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 Halo! Saya adalah bot untuk download media dari Telegram.\n\n" +
        "📥 Gunakan command /unduh untuk mulai download media.\n\n" +
        "💡 Bot ini bisa download media dari:\n" +
        "• Channel publik\n" +
        "• Channel privat (jika userbot adalah member)\n" +
        "• Group"
    );
  });

  // Command: /unduh
  bot.command("unduh", async (ctx) => {
    const userId = ctx.from.id;
    userStates.set(userId, { waitingForLink: true });

    await ctx.reply("📥 Silakan kirim link Telegram media yang ingin didownload.\n\n" + "Contoh:\n" + "• https://t.me/channelName/123\n" + "• https://t.me/c/channelId/messageId");
  });

  // Handle text messages (link)
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    const userState = userStates.get(userId);
    const text = ctx.message.text;

    // Cek apakah user sedang menunggu link
    if (userState && userState.waitingForLink) {
      // Validasi apakah ini link Telegram
      if (!text.includes("t.me/")) {
        await ctx.reply("❌ Link tidak valid. Pastikan link adalah link Telegram (t.me/...)\n\n" + "Contoh: https://t.me/channelName/123");
        return;
      }

      // Reset state
      userStates.delete(userId);

      // Process download
      await handleDownload(ctx, text);
    }
  });

  // Handle errors
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}

/**
 * Handle download request
 * @param {Context} ctx - Grammy context
 * @param {string} link - Telegram link
 */
async function handleDownload(ctx, link) {
  const chatId = ctx.chat.id;
  const messageId = ctx.message.message_id;

  try {
    // Send processing message
    const processingMsg = await ctx.reply("⏳ Memproses link...");

    // Parse link
    let peer, messageId_parsed;
    try {
      const parsed = await parseTelegramLink(link);
      peer = parsed.peer;
      messageId_parsed = parsed.messageId;
    } catch (error) {
      await ctx.api.editMessageText(chatId, processingMsg.message_id, `❌ Error: ${error.message}`);
      return;
    }

    // Update message
    await ctx.api.editMessageText(chatId, processingMsg.message_id, "📥 Mengambil pesan dari Telegram...");

    // Get message
    let message;
    try {
      message = await getMessage(peer, messageId_parsed);
    } catch (error) {
      await ctx.api.editMessageText(chatId, processingMsg.message_id, `❌ Error: ${error.message}`);
      return;
    }

    // Debug: Log message info - lebih detail
    console.log(`📨 Message ID: ${message.id}`);
    console.log(`📨 Message text: ${message.text ? message.text.substring(0, 50) : "No text"}...`);
    console.log(`📨 Has media: ${!!message.media}`);
    console.log(`📨 Message keys:`, Object.keys(message).join(", "));

    if (message.media) {
      console.log(`📨 Media className: ${message.media.className || "Unknown"}`);
      console.log(`📨 Media keys:`, Object.keys(message.media).join(", "));

      // Log struktur media lebih detail
      if (message.media.photo) {
        console.log(`📨 Media has photo property`);
      }
      if (message.media.document) {
        console.log(`📨 Media has document property`);
        if (message.media.document.mimeType) {
          console.log(`📨 Document mimeType: ${message.media.document.mimeType}`);
        }
      }
      if (message.media.video) {
        console.log(`📨 Media has video property`);
      }

      // Log full media object (truncated)
      try {
        const mediaStr = JSON.stringify(message.media, null, 2);
        console.log(`📨 Media object (first 500 chars):`, mediaStr.substring(0, 500));
      } catch (e) {
        console.log(`📨 Media object (cannot stringify):`, message.media);
      }
    }

    // Check if message has media - lebih detail
    const mediaToCheck = message.media || (message.replyTo && message.replyTo.media) || (message.fwdFrom && message.fwdFrom.media);

    if (!mediaToCheck) {
      console.log(`⚠️  Pesan tidak memiliki media sama sekali`);
      console.log(`⚠️  Message structure:`, {
        hasMedia: !!message.media,
        hasReplyTo: !!message.replyTo,
        hasFwdFrom: !!message.fwdFrom,
        messageKeys: Object.keys(message),
      });
      await ctx.api.editMessageText(chatId, processingMsg.message_id, "❌ Pesan tidak mengandung media yang dapat didownload.\n\nPesan ini mungkin hanya berisi teks atau media tidak tersedia.");
      return;
    }

    // Cek jenis media yang didukung - lebih komprehensif
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

    const className = mediaToCheck.className || "";
    const classNameLower = className.toLowerCase();

    // Cek berdasarkan className
    let hasSupportedMedia = mediaTypes.some((type) => {
      return classNameLower.includes(type.toLowerCase());
    });

    // Jika tidak match dengan className, cek berdasarkan property
    if (!hasSupportedMedia) {
      hasSupportedMedia = !!(mediaToCheck.photo || mediaToCheck.document || mediaToCheck.video || mediaToCheck.audio || mediaToCheck.voice || mediaToCheck.videoNote || mediaToCheck.sticker || mediaToCheck.gif);
    }

    if (!hasSupportedMedia) {
      console.log(`⚠️  Media type tidak didukung`);
      console.log(`⚠️  Media className: ${className}`);
      console.log(`⚠️  Media properties:`, Object.keys(mediaToCheck).join(", "));
      await ctx.api.editMessageText(
        chatId,
        processingMsg.message_id,
        `❌ Media type tidak didukung: ${className || "Unknown"}\n\nMedia yang didukung: photo, document, video, audio, voice, videoNote, sticker, gif\n\nSilakan cek log di console untuk detail lebih lanjut.`
      );
      return;
    }

    // Pastikan message.media ada (untuk downloadMedia)
    if (!message.media) {
      // Jika media ada di replyTo atau fwdFrom, kita perlu ambil pesan aslinya
      console.log(`⚠️  Media ada di replyTo/fwdFrom, tapi tidak di message langsung`);
      await ctx.api.editMessageText(chatId, processingMsg.message_id, "❌ Media tidak dapat didownload karena berada di reply/forward. Silakan gunakan link pesan aslinya.");
      return;
    }

    // Cek ukuran file dan beri notifikasi jika > 1GB
    const fileSize = getMessageFileSize(message);
    const fileSizeGB = fileSize / (1024 * 1024 * 1024);

    if (fileSize > 0 && fileSizeGB >= 1) {
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      await ctx.api.editMessageText(
        chatId,
        processingMsg.message_id,
        `⚠️ File besar terdeteksi (${fileSizeMB} MB / ${fileSizeGB.toFixed(2)} GB)\n\n` + `⏳ Download akan memakan waktu lebih lama karena ukuran file yang besar.\n` + `💡 Silakan tunggu dengan sabar, proses sedang berjalan...`
      );
      // Tunggu sebentar agar user bisa baca notifikasi
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Update message
    await ctx.api.editMessageText(chatId, processingMsg.message_id, "⬇️ Downloading media...");

    // Generate file name
    const fileName = generateFileName(message);
    const outputPath = path.join(getDownloadsPath(), fileName);

    // Download media
    let downloadedPath;
    try {
      downloadedPath = await downloadMedia(message, outputPath);
    } catch (error) {
      await ctx.api.editMessageText(chatId, processingMsg.message_id, `❌ Error: ${error.message}`);
      return;
    }

    // Get file stats
    const stats = await fs.stat(downloadedPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const fileSizeBytes = stats.size;
    const maxFileSizeBytes = 50 * 1024 * 1024; // 50MB limit Telegram Bot API

    // Cek apakah file terlalu besar untuk dikirim via bot
    if (fileSizeBytes > maxFileSizeBytes) {
      const fileSizeGB = (fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
      await ctx.api.editMessageText(
        chatId,
        processingMsg.message_id,
        `✅ Download berhasil! (${fileSizeMB} MB / ${fileSizeGB} GB)\n\n` +
          `⚠️ File terlalu besar untuk dikirim via bot!\n\n` +
          `📋 Batas maksimal Telegram Bot API: 50 MB\n` +
          `📁 File Anda: ${fileSizeMB} MB\n\n` +
          `💾 File sudah tersimpan di:\n\`${downloadedPath}\`\n\n` +
          `💡 Silakan ambil file secara manual dari folder downloads.`
      );
      return;
    }

    // Update message
    await ctx.api.editMessageText(chatId, processingMsg.message_id, `✅ Download berhasil! (${fileSizeMB} MB)\n📤 Mengirim file...`);

    // Send file to user
    try {
      // Gunakan InputFile untuk file lokal
      const fileStream = createReadStream(downloadedPath);
      const inputFile = new InputFile(fileStream, path.basename(downloadedPath));

      await ctx.api.sendDocument(chatId, inputFile, {
        caption: `📥 File berhasil didownload\n📁 ${path.basename(downloadedPath)}\n💾 ${fileSizeMB} MB`,
      });

      // Delete processing message
      await ctx.api.deleteMessage(chatId, processingMsg.message_id);
    } catch (error) {
      console.error("Error sending file:", error);
      const fileExists = await fs
        .access(downloadedPath)
        .then(() => true)
        .catch(() => false);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        downloadedPath,
        fileExists,
      });

      // Cek apakah error karena file terlalu besar
      const isFileTooLarge = error.message.includes("413") || error.message.includes("Request Entity Too Large") || error.message.includes("too large");

      if (isFileTooLarge) {
        const fileSizeGB = (fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
        await ctx.api.editMessageText(
          chatId,
          processingMsg.message_id,
          `✅ Download berhasil! (${fileSizeMB} MB / ${fileSizeGB} GB)\n\n` +
            `⚠️ File terlalu besar untuk dikirim via bot!\n\n` +
            `📋 Batas maksimal Telegram Bot API: 50 MB\n` +
            `📁 File Anda: ${fileSizeMB} MB\n\n` +
            `💾 File sudah tersimpan di:\n\`${downloadedPath}\`\n\n` +
            `💡 Silakan ambil file secara manual dari folder downloads.`
        );
      } else {
        await ctx.api.editMessageText(
          chatId,
          processingMsg.message_id,
          `✅ Download berhasil, tapi gagal mengirim file.\n\n` + `File tersimpan di: ${downloadedPath}\n\n` + `Error: ${error.message}\n\n` + `💡 File sudah tersimpan di folder downloads, silakan ambil manual.`
        );
      }
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    try {
      await ctx.reply(`❌ Error tidak terduga: ${error.message}`);
    } catch (err) {
      // Ignore if can't send message
    }
  }
}

/**
 * Start bot
 */
export async function startBot() {
  if (!bot) {
    throw new Error("Bot belum diinisialisasi. Panggil initBot() terlebih dahulu.");
  }

  await bot.start();
  console.log("🤖 Telegram Bot sudah berjalan!");
}

/**
 * Stop bot
 */
export async function stopBot() {
  if (bot) {
    await bot.stop();
    console.log("🤖 Telegram Bot dihentikan.");
  }
}

/**
 * Get bot instance
 */
export function getBot() {
  return bot;
}
