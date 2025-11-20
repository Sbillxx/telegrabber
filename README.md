# Telegram Downloader Backend

Backend Express.js untuk download media dari Telegram menggunakan Userbot MTProto.

## 📋 Persyaratan

- Node.js 18+ (mendukung ES modules)
- Akun Telegram
- API ID dan API Hash dari [my.telegram.org](https://my.telegram.org/apps)

## 🚀 Setup Proyek

### 1. Buat folder proyek dan install dependencies

```bash
mkdir telegram-downloader
cd telegram-downloader
npm init -y
npm install express telegram @grammyjs/types dotenv
```

### 2. Struktur Folder

```
telegram-downloader/
├── src/
│   ├── server.js      # Express.js server
│   ├── telegram.js    # Telegram MTProto client
│   └── utils.js       # Helper functions
├── downloads/         # Folder untuk menyimpan file yang didownload
├── .env              # Environment variables (buat dari .env.example)
├── .env.example      # Template environment variables
├── package.json
└── README.md
```

### 3. Setup Environment Variables

1. Copy file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

2. Dapatkan API ID dan API Hash:

   - Kunjungi [my.telegram.org/apps](https://my.telegram.org/apps)
   - Login dengan akun Telegram Anda
   - Buat aplikasi baru (jika belum ada)
   - Copy `api_id` dan `api_hash`

3. Edit file `.env` dan isi:

```env
API_ID=your_api_id_here
API_HASH=your_api_hash_here
PORT=3000
BOT_TOKEN=your_bot_token_here
PHONE_NUMBER=+6281234567890
PASSWORD=your_2fa_password_if_any
TUNNEL_URL=https://your-tunnel-url.com
```

**Environment Variables:**

- `API_ID` - API ID dari my.telegram.org (wajib)
- `API_HASH` - API Hash dari my.telegram.org (wajib)
- `BOT_TOKEN` - Token bot dari @BotFather (wajib untuk bot Telegram)
- `PHONE_NUMBER` - Nomor telepon untuk login pertama kali (wajib jika belum ada SESSION_STRING)
- `PASSWORD` - Password 2FA jika ada (opsional)
- `SESSION_STRING` - Session string setelah login (opsional, akan dibuat otomatis)
- `PORT` - Port untuk Express server (default: 3000)
- `TUNNEL_URL` - URL tunnel untuk akses publik ke folder downloads (opsional, contoh: https://abc123.ngrok.io)

### 4. Login Pertama Kali

Saat pertama kali menjalankan server, Anda perlu login:

1. Jalankan server:

```bash
node src/server.js
```

2. Jika diminta, masukkan:

   - Nomor telepon (format: +6281234567890)
   - Kode OTP yang dikirim ke Telegram
   - Password 2FA (jika ada)

3. Setelah login berhasil, copy `session string` yang muncul di console dan simpan di `.env`:

```env
SESSION_STRING=your_session_string_here
```

4. Restart server. Sekarang tidak perlu login lagi.

## 🏃 Menjalankan Server

```bash
node src/server.js
```

Server akan berjalan di `http://localhost:3000` (atau port yang diatur di `.env`).

## 📡 API Endpoints

### POST /api/download

Download media dari link Telegram.

**Request:**

```json
{
  "link": "https://t.me/channelName/123"
}
```

**Response Success:**

```json
{
  "success": true,
  "file": "downloads/media_123_1234567890.mp4",
  "absolutePath": "/full/path/to/downloads/media_123_1234567890.mp4",
  "publicUrl": "https://your-tunnel-url.com/downloads/media_123_1234567890.mp4",
  "messageId": 123,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Catatan:** Field `publicUrl` hanya akan muncul jika `TUNNEL_URL` dikonfigurasi di environment variables.

**Response Error:**

```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error message"
}
```

### GET /health

Health check endpoint.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /

Informasi API.

## 🔗 Format Link yang Didukung

- Channel publik: `https://t.me/channelName/123`
- Channel privat: `https://t.me/c/channelId/messageId`
- Group: `https://t.me/groupName/123`

## ⚠️ Error Handling

API mengembalikan error dengan status code yang sesuai:

- `400` - Bad Request (link tidak valid, tidak ada media, dll)
- `403` - Forbidden (tidak punya akses ke channel)
- `404` - Not Found (pesan tidak ditemukan)
- `500` - Internal Server Error
- `503` - Service Unavailable (Telegram client tidak terhubung)

## 📝 Contoh Penggunaan

### Menggunakan cURL

```bash
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"link": "https://t.me/channelName/123"}'
```

### Menggunakan JavaScript (fetch)

```javascript
const response = await fetch("http://localhost:3000/api/download", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    link: "https://t.me/channelName/123",
  }),
});

const data = await response.json();
console.log(data);
```

### Menggunakan Python (requests)

```python
import requests

response = requests.post(
    'http://localhost:3000/api/download',
    json={'link': 'https://t.me/channelName/123'}
)

print(response.json())
```

## 🌐 Tunnel URL (Public Access)

Jika Anda menggunakan tunnel service (seperti ngrok, Cloudflare Tunnel, dll) untuk expose folder `downloads` sebagai file server publik, Anda bisa mengkonfigurasi `TUNNEL_URL` di environment variables.

**Cara Setup:**

1. Setup tunnel service Anda untuk expose folder `downloads` (misalnya dengan ngrok: `ngrok http 3000` atau expose folder langsung)
2. Tambahkan `TUNNEL_URL` di `.env` dengan URL tunnel Anda
3. Setelah download selesai, aplikasi akan otomatis generate URL publik untuk file tersebut

**Contoh:**

- Tunnel URL: `https://abc123.ngrok.io`
- File: `downloads/media_123_1234567890.mp4`
- Public URL: `https://abc123.ngrok.io/downloads/media_123_1234567890.mp4`

URL publik ini akan muncul di:

- Response API endpoint `/api/download` (field `publicUrl`)
- Bot Telegram message (untuk file yang terlalu besar atau berhasil dikirim)

## 🔒 Keamanan

- Jangan commit file `.env` ke repository
- Jangan share `SESSION_STRING` dengan siapapun
- Gunakan environment variables untuk production
- Pertimbangkan menambahkan authentication untuk API endpoints
- Jika menggunakan tunnel, pastikan tunnel service Anda aman dan terpercaya

## 📦 Dependencies

- `express` - Web framework
- `telegram` - Telegram MTProto client
- `@grammyjs/types` - Type definitions
- `dotenv` - Environment variables loader

## 🐛 Troubleshooting

### "Telegram client belum terhubung"

- Pastikan API_ID dan API_HASH sudah diisi di `.env`
- Pastikan sudah login (ada SESSION_STRING atau login manual)

### "Tidak dapat mengakses channel"

- Pastikan akun userbot adalah member dari channel tersebut
- Untuk channel privat, pastikan userbot sudah bergabung

### "Pesan tidak ditemukan"

- Pastikan message ID benar
- Pastikan pesan belum dihapus
- Pastikan userbot memiliki akses untuk melihat pesan tersebut

### "Pesan tidak mengandung media"

- Pastikan pesan yang di-link mengandung media (video, foto, dokumen, dll)

## 📄 License

ISC
