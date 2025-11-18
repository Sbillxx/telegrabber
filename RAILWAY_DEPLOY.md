# 🚂 Deploy ke Railway

Panduan lengkap untuk deploy aplikasi Telegram Downloader ke Railway.

## 📋 Checklist Sebelum Deploy

### ✅ File yang Sudah Ada

- [x] `package.json` - ✅ Sudah ada dengan start script
- [x] `.gitignore` - ✅ Sudah ada dan lengkap
- [x] `railway.json` - ✅ Sudah dibuat
- [x] Source code di folder `src/` - ✅ Lengkap

### ⚠️ Yang Perlu Disiapkan

1. **Environment Variables** - Harus diset di Railway dashboard
2. **SESSION_STRING** - Harus sudah ada (login di local dulu)
3. **Persistent Storage** (opsional) - Untuk folder downloads

## 🚀 Langkah-langkah Deploy

### 1. Login di Local Terlebih Dahulu

**PENTING:** Railway tidak support interactive input (OTP code), jadi Anda **HARUS** login di local dulu untuk mendapatkan `SESSION_STRING`.

```bash
# Di local machine
npm install
npm start
```

Saat diminta:

- Masukkan nomor telepon
- Masukkan OTP code
- Masukkan password 2FA (jika ada)

Setelah login berhasil, copy `SESSION_STRING` yang muncul di console.

### 2. Setup Railway Project

1. Login ke [Railway](https://railway.app)
2. Klik "New Project"
3. Pilih "Deploy from GitHub repo" (atau "Empty Project" jika mau deploy manual)
4. Connect repository Anda

### 3. Set Environment Variables

Di Railway dashboard, buka tab **Variables** dan tambahkan:

```env
API_ID=your_api_id_here
API_HASH=your_api_hash_here
BOT_TOKEN=your_bot_token_here
SESSION_STRING=your_session_string_from_local
PHONE_NUMBER=+6281234567890
PASSWORD=your_2fa_password_if_any
PORT=3000
```

**Catatan:**

- `SESSION_STRING` **WAJIB** diisi (dari login di local)
- `PHONE_NUMBER` dan `PASSWORD` opsional jika sudah ada `SESSION_STRING`
- `PORT` akan otomatis diset oleh Railway, tapi bisa tetap diisi

### 4. Deploy

Railway akan otomatis:

1. Detect Node.js project
2. Install dependencies (`npm install`)
3. Run start command (`npm start`)

### 5. Cek Logs

Buka tab **Logs** di Railway untuk melihat:

- Apakah server berhasil start
- Apakah Telegram client terhubung
- Error jika ada

## 📁 Persistent Storage (Opsional)

Jika ingin file downloads tersimpan permanen:

1. Di Railway dashboard, buka tab **Volumes**
2. Klik "Add Volume"
3. Mount ke path: `/app/downloads`
4. Set environment variable: `DOWNLOADS_PATH=/app/downloads` (jika perlu)

**Catatan:** Tanpa volume, file downloads akan hilang saat restart.

## 🔧 Troubleshooting

### Error: "PHONE_NUMBER tidak diisi"

- Pastikan `PHONE_NUMBER` sudah diisi di Railway Variables
- Atau pastikan `SESSION_STRING` sudah ada

### Error: "Login pertama kali tidak bisa dilakukan di production"

- **Solusi:** Login di local dulu, copy `SESSION_STRING`, lalu set di Railway Variables

### Error: "Telegram client belum terhubung"

- Cek apakah `API_ID` dan `API_HASH` sudah benar
- Cek apakah `SESSION_STRING` valid
- Cek logs untuk detail error

### Server tidak bisa start

- Cek logs di Railway
- Pastikan semua environment variables sudah diisi
- Pastikan `PORT` tidak conflict (Railway akan set otomatis)

## 🌐 Custom Domain (Opsional)

1. Di Railway dashboard, buka tab **Settings**
2. Klik "Generate Domain" atau "Custom Domain"
3. Set domain Anda

## 📊 Monitoring

Railway menyediakan:

- **Metrics** - CPU, Memory, Network usage
- **Logs** - Real-time logs
- **Deployments** - History deployments

## 💰 Pricing

Railway menggunakan pay-as-you-go:

- Free tier: $5 credit per bulan
- Harga: ~$0.000463 per GB RAM per jam
- Storage: $0.25 per GB per bulan

## 🔒 Security Tips

1. **Jangan commit** `.env` atau `session.txt` ke Git
2. **Gunakan Railway Variables** untuk secrets
3. **Rotate SESSION_STRING** secara berkala jika perlu
4. **Monitor logs** untuk aktivitas mencurigakan

## 📝 Notes

- Railway akan otomatis restart jika app crash
- File di `/app/downloads` akan hilang saat restart (kecuali pakai Volume)
- Environment variables bisa diubah tanpa redeploy
- Railway auto-detect Node.js dari `package.json`

## ✅ Checklist Setelah Deploy

- [ ] Server berhasil start (cek logs)
- [ ] Telegram client terhubung (cek logs)
- [ ] Health check endpoint accessible: `https://your-app.railway.app/health`
- [ ] Bot bisa menerima command `/start`
- [ ] Download endpoint berfungsi

---

**Selamat deploy! 🎉**
