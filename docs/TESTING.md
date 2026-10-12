# Moment Lab — Petunjuk Pengujian (TESTING)

Dokumen ini mendokumentasikan suite pengujian otomatis untuk memvalidasi kontrak data, compiler timeline, keamanan batas lokal, concurrency penyimpanan proyek, lifecycle job worker, serta rendering Remotion.

---

## 1. Menjalankan Seluruh Unit & Integration Test

Jalankan rangkaian tes Vitest:
```powershell
npm test
```

### Cakupan Pengujian (Test Suites)

1. **`tests/edit.test.ts` (11 tests)**:
   - Validasi skema Zod kontrak edit (rentang, durasi, frame finite integer).
   - Validasi preset `light` dan `meme`.
   - Penolakan ID malformed, NaN, dan aset hilang.

2. **`tests/timeline.test.ts` (6 tests)**:
   - Kompilasi segmen deterministik (normal, freeze, replay).
   - Penyelarasan subtitle dan efek pada freeze dan instant replay.
   - Pemetaan dua arah output frame ke canonical source frame via `sourceFrameAt`.

3. **`tests/security.test.ts` (16 tests)**:
   - Pembatasan host loopback (`127.0.0.1:3000`).
   - Penolakan permintaan lintas situs (`sec-fetch-site: cross-site`, origin checking).
   - Sanitasi ID dan pencegahan path traversal (`../`, `..\`).
   - Validasi header Range untuk streaming media.

4. **`tests/projects.test.ts` (5 tests)**:
   - Persistensi proyek JSON atomik.
   - Deteksi konflik versi simultan (409 REVISION_CONFLICT).
   - Penolakan modifikasi tanpa pencocokan revisi `If-Match`.

5. **`tests/jobs.test.ts` (5 tests)**:
   - Lifecycle antrean pekerjaan worker (`queued` -> `running` -> `succeeded`).
   - Deduplikasi pekerjaan render identik pada revisi yang sama.
   - Pembatalan pekerjaan melalui sinyal Abort dan file marker.

6. **`tests/ai.test.ts` (8 tests)**:
   - Pemetaan kode kesalahan HTTP OpenRouter (401, 402, 429, 503).
   - Validasi structured outputs JSON schema untuk rekomendasi efek AI.
   - Penolakan rekomendasi yang keluar dari batas rentang waktu terpilih.

7. **`tests/editor.test.tsx` (3 tests)**:
   - Pengujian komponen UI React: konversi timestamp detik ke frame.
   - Interaksi input kontrol rentang (start, end, moment).
   - Peringatan visual saat titik momen berada di luar rentang.

---

## 2. Pengujian Type Checking & Linting

Pastikan tidak ada error kompilasi TypeScript:
```powershell
npm run typecheck
```

---

## 3. Pengujian Pipeline Render Video Nyata (Smoke Render)

Menguji eksekusi Remotion dan FFmpeg untuk memastikan render video menghasilkan dimensi 1080×1920 H.264 / AAC 30 FPS:
```powershell
npm run fixture
npm run smoke:render
```
Skrip ini akan memvalidasi metadata berkas keluaran secara otomatis menggunakan `ffprobe`.
