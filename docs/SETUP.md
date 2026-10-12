# Moment Lab — Petunjuk Instalasi & Menjalankan (SETUP)

Dokumen ini menjelaskan cara menyiapkan lingkungan lokal, konfigurasi dependensi, variabel lingkungan, serta menjalankan editor web dan worker rendering untuk **Moment Lab**.

---

## 1. Kebutuhan Sistem & Prasyarat Lokal

- **Node.js**: v24 LTS (direkomendasikan v24.15.0 atau lebih baru)
- **FFmpeg & FFprobe**: Tersedia di PATH sistem (`ffmpeg -version` dan `ffprobe -version` dapat dipanggil dari terminal).
- **RAM**: Minimum 8 GB (direkomendasikan 16+ GB untuk rendering video beresolusi 1080×1920).
- **Penyimpanan**: Minimum 5 GB ruang disk kosong untuk direktori `.data/` (video sumber, caching, dan render output).

Periksa kesiapan dependensi lokal dengan menjalankan:
```powershell
npm run doctor
```

---

## 2. Instalasi Dependensi

Instal seluruh paket dependensi npm:
```powershell
npm install --legacy-peer-deps
```

Verifikasi integritas berkas font lokal berlisensi OFL di `public/fonts/`:
```powershell
npm run verify:assets
```

---

## 3. Konfigurasi Lingkungan (`.env.local`)

Salin berkas contoh konfigurasi:
```powershell
copy .env.example .env.local
```

Isi variabel di `.env.local` sesuai kebutuhan:

```env
# Aktifkan fitur AI (opsional, default: false)
ENABLE_AI=true

# OpenRouter API (Saran Efek AI)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
OPENROUTER_SUGGESTION_MODEL=meta-llama/llama-3.3-70b-instruct

# Speech-to-Text (STT) Provider: "openrouter" atau "9router" (default: openrouter)
STT_PROVIDER=openrouter

# Opsi A: Jika menggunakan OpenRouter untuk STT
OPENROUTER_TRANSCRIPTION_MODEL=openai/whisper-large-v3

# Opsi B: Jika menggunakan 9Router untuk STT
# STT_PROVIDER=9router
# STT_BASE_URL=http://127.0.0.1:20128/v1
# STT_API_KEY=9router
# STT_MODEL=whisper-large-v3

# Bahasa audio untuk transkripsi STT
STT_LANGUAGE=id

# Direktori Data Lokal (opsional, default: .data)
DATA_DIR=.data

# Batas Maksimal Ukuran Unggahan (default 2 GiB = 2147483648 bytes)
MAX_UPLOAD_BYTES=2147483648
```

> **Catatan Keamanan & Privasi**: Kunci API (`OPENROUTER_API_KEY` / `STT_API_KEY`) hanya dibaca di sisi server dan worker (`src/server/` dan `src/worker/`). Kunci ini tidak pernah dikirim ke browser ataupun dicatat dalam log publik. Video gameplay dan berkas MP4 hasil render tetap disimpan secara lokal di mesin Anda. Hanya potongan audio dari rentang yang dipilih yang dikirim ke provider STT saat tombol **AI STT** ditekan secara eksplisit.

---

## 4. Menjalankan Aplikasi

Aplikasi terdiri dari dua proses: **Next.js Web Server** (`http://127.0.0.1:3000`) dan **Persistent Background Worker** untuk tugas rendering FFmpeg & Remotion.

### Mode Pengembangan (Development)
Menjalankan server Next.js dan background worker secara bersamaan:
```powershell
npm run dev
```
Buka browser di `http://127.0.0.1:3000`.

### Mode Produksi (Production Build & Start)
Untuk performa optimal:
```powershell
npm run build
npm run start
```

---

## 5. Pengujian dan Validasi Render Smoke

Untuk menguji bahwa pipeline komposisi Remotion dan FFmpeg dapat merender video kedua preset (**Light** dan **Meme**) tanpa membuka browser:
```powershell
# 1. Buat video fixture sintetis 300 detik
npm run fixture

# 2. Jalankan render headless smoke test
npm run smoke:render
```
Kedua berkas hasil uji coba (`smoke-light.mp4` dan `smoke-meme.mp4`) akan dibuat di `.data/tmp/` dengan spesifikasi 1080×1920 @ 30 FPS.
