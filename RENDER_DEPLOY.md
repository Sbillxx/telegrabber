# 🚀 Deploy ke Render.com

Panduan lengkap untuk deploy aplikasi Telegram Downloader ke Render.com.

## 📋 Checklist Sebelum Deploy

### ✅ File yang Sudah Ada

- [x] `package.json` - ✅ Sudah ada dengan start script
- [x] `.gitignore` - ✅ Sudah ada dan lengkap
- [x] `render.yaml` - ✅ Sudah dibuat (opsional, untuk konfigurasi)
- [x] Source code di folder `src/` - ✅ Lengkap

### ⚠️ Yang Perlu Disiapkan

1. **Environment Variables** - Harus diset di Render dashboard
2. **SESSION_STRING** - Harus sudah ada (login di local dulu)
3. **Persistent Disk** (opsional) - Untuk folder downloads

## 🚀 Langkah-langkah Deploy

### 1. Login di Local Terlebih Dahulu

**PENTING:** Render.com tidak support interactive input (OTP code), jadi Anda **HARUS** login di local dulu untuk mendapatkan `SESSION_STRING`.

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

### 2. Setup Render.com Project

#### Opsi A: Deploy via GitHub (Recommended)

1. **Push code ke GitHub** (jika belum):

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/username/repo-name.git
   git push -u origin main
   ```

2. **Login ke Render.com:**

   - Kunjungi [Render.com](https://render.com)
   - Sign up / Login dengan GitHub

3. **Create New Web Service:**

   - Klik "New +" di dashboard
   - Pilih "Web Service"
   - Connect GitHub repository Anda
   - Pilih repository yang sudah di-push

4. **Configure Service:**
   - **Name:** `telegram-downloader` (atau nama lain)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (atau sesuai kebutuhan)

#### Opsi B: Deploy Manual (tanpa GitHub)

1. Login ke Render.com
2. Klik "New +" → "Web Service"
3. Pilih "Public Git repository"
4. Masukkan URL repository Anda
5. Configure seperti Opsi A

### 3. Set Environment Variables

Di Render dashboard, setelah service dibuat:

1. Buka service yang baru dibuat
2. Klik tab **Environment**
3. Klik "Add Environment Variable"
4. Tambahkan satu per satu:

```env
API_ID=your_api_id_here
API_HASH=your_api_hash_here
BOT_TOKEN=your_bot_token_here
SESSION_STRING=your_session_string_from_local  ← WAJIB!
PHONE_NUMBER=+6281234567890  (opsional jika sudah ada SESSION_STRING)
PASSWORD=your_2fa_password  (opsional)
NODE_ENV=production
```

**Catatan:**

- `SESSION_STRING` **WAJIB** diisi (dari login di local)
- `PHONE_NUMBER` dan `PASSWORD` opsional jika sudah ada `SESSION_STRING`
- `PORT` akan otomatis diset oleh Render, tidak perlu set manual

### 4. Deploy

1. Klik "Save Changes" di Environment Variables
2. Render akan otomatis:

   - Clone repository
   - Install dependencies (`npm install`)
   - Build project
   - Start service (`npm start`)

3. Tunggu deploy selesai (biasanya 2-5 menit)

### 5. Cek Logs

Buka tab **Logs** di Render untuk melihat:

- Apakah server berhasil start
- Apakah Telegram client terhubung
- Error jika ada

## 📁 Persistent Disk (Opsional)

Jika ingin file downloads tersimpan permanen:

1. Di Render dashboard, buka service Anda
2. Klik tab **Disks**
3. Klik "Link Existing Disk" atau "Create New Disk"
4. **Name:** `downloads`
5. **Mount Path:** `/opt/render/project/src/downloads`
6. **Size:** Sesuai kebutuhan (minimal 1GB untuk free tier)

**Update code untuk menggunakan disk:**

```javascript
// Di src/utils.js atau src/telegram.js
const downloadsPath = process.env.DOWNLOADS_PATH || path.join(__dirname, "..", "downloads");
```

**Catatan:** Tanpa disk, file downloads akan hilang saat restart.

## 🔧 Troubleshooting

### Error: "PHONE_NUMBER tidak diisi"

- Pastikan `PHONE_NUMBER` sudah diisi di Render Environment Variables
- Atau pastikan `SESSION_STRING` sudah ada

### Error: "Login pertama kali tidak bisa dilakukan di production"

- **Solusi:** Login di local dulu, copy `SESSION_STRING`, lalu set di Render Environment Variables

### Error: "Telegram client belum terhubung"

- Cek apakah `API_ID` dan `API_HASH` sudah benar
- Cek apakah `SESSION_STRING` valid
- Cek logs untuk detail error

### Service tidak bisa start

- Cek logs di Render
- Pastikan semua environment variables sudah diisi
- Pastikan `package.json` memiliki script `start`
- Pastikan `main` file di `package.json` benar

### Build failed

- Cek logs untuk detail error
- Pastikan semua dependencies di `package.json` valid
- Pastikan Node.js version compatible (Render auto-detect, biasanya 18+)

### Service auto-sleep (Free Plan)

- Free plan di Render akan sleep setelah 15 menit tidak ada traffic
- Solusi: Upgrade ke paid plan atau gunakan service seperti UptimeRobot untuk ping setiap 5 menit

## 🌐 Custom Domain (Opsional)

1. Di Render dashboard, buka service Anda
2. Klik tab **Settings**
3. Scroll ke "Custom Domains"
4. Klik "Add Custom Domain"
5. Masukkan domain Anda
6. Follow instruksi untuk setup DNS

## 📊 Monitoring

Render menyediakan:

- **Metrics** - CPU, Memory, Network usage
- **Logs** - Real-time logs (terbatas untuk free plan)
- **Events** - Deployment history
- **Alerts** - Email notifications untuk errors

## 💰 Pricing

Render.com pricing:

- **Free Plan:**
  - 750 hours/month (cukup untuk 1 service 24/7)
  - Auto-sleep setelah 15 menit idle
  - 512MB RAM
  - Shared CPU
- **Starter Plan:** $7/month
  - No sleep
  - 512MB RAM
  - Shared CPU
- **Standard Plan:** $25/month
  - No sleep
  - 2GB RAM
  - Dedicated CPU

## 🔒 Security Tips

1. **Jangan commit** `.env` atau `session.txt` ke Git
2. **Gunakan Render Environment Variables** untuk secrets
3. **Rotate SESSION_STRING** secara berkala jika perlu
4. **Monitor logs** untuk aktivitas mencurigakan
5. **Gunakan HTTPS** (otomatis disediakan Render)

## 📝 Notes

- Render akan otomatis restart jika app crash
- File di `/opt/render/project/src/downloads` akan hilang saat restart (kecuali pakai Disk)
- Environment variables bisa diubah tanpa redeploy (auto-restart)
- Render auto-detect Node.js dari `package.json`
- Free plan akan sleep jika tidak ada traffic (wake up dalam beberapa detik saat ada request)

## ✅ Checklist Setelah Deploy

- [ ] Service berhasil deploy (cek status di dashboard)
- [ ] Server berhasil start (cek logs)
- [ ] Telegram client terhubung (cek logs)
- [ ] Health check endpoint accessible: `https://your-service.onrender.com/health`
- [ ] Bot bisa menerima command `/start`
- [ ] Download endpoint berfungsi

## 🆚 Render vs Railway

| Feature         | Render            | Railway      |
| --------------- | ----------------- | ------------ |
| Free Plan       | ✅ 750 hrs/month  | ✅ $5 credit |
| Auto-sleep      | ⚠️ 15 min idle    | ❌ No sleep  |
| Persistent Disk | ✅ Available      | ✅ Volume    |
| Custom Domain   | ✅ Free           | ✅ Free      |
| Auto-deploy     | ✅ GitHub         | ✅ GitHub    |
| Logs Retention  | ⚠️ Limited (free) | ✅ Better    |

---

**Selamat deploy! 🎉**
