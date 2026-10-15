# Takefield Studio — Petunjuk Pengujian (TESTING)

Dokumen ini mendokumentasikan suite pengujian otomatis untuk memvalidasi kontrak data, compiler timeline, keamanan batas lokal, concurrency penyimpanan proyek, lifecycle job worker, serta rendering Remotion.

---

## 1. Menjalankan Seluruh Unit & Integration Test

Jalankan rangkaian tes Vitest:
```powershell
rtk npm test
```

### Isolasi storage wajib (Task 0)

`tests/setup.ts` dijalankan Vitest sebelum import test module. Setup langsung membuat direktori unik lewat `fs.mkdtempSync(path.join(os.tmpdir(), "takefield-tests-"))` dan mengatur `DATA_DIR` ke direktori tersebut, termasuk bila sebelumnya `DATA_DIR` menunjuk storage aplikasi. Fixture pada saat import, proyek, asset manifest, job, output, dan lock tes menggunakan storage sementara ini. Dengan konfigurasi isolasi file Vitest saat ini, setiap test file mendapat direktori tersendiri; jangan menonaktifkan isolasi file.

Setup memastikan path tes berbeda dari `path.resolve(process.cwd(), ".data")`. Sebelum dan sesudah setiap suite, setup menghitung berkas proyek `.json` di `.data/projects` melalui pembacaan filesystem saja dan mencetak `[tests:storage] .data/projects before=N after=N`. Perubahan jumlah proyek membuat suite gagal; `.data/projects` yang belum ada dihitung nol tanpa dibuat. Jangan memakai `listProjects()` atau helper inisialisasi storage untuk pengecekan data pengguna.

Setelah suite, cleanup hanya menghapus hasil `mkdtemp` yang dimiliki setup, bukan nilai `DATA_DIR` saat teardown. Parent path hasil resolve harus sama dengan `path.resolve(os.tmpdir())`; `.data` aplikasi tidak boleh dihapus. Nilai `DATA_DIR` sebelumnya dipulihkan persis, termasuk string kosong, atau dihapus bila sebelumnya tidak ada. Cleanup dan pemulihan env tetap dijalankan bila assertion jumlah proyek gagal. Jika proses dihentikan paksa, hook teardown mungkin tidak berjalan; jangan menggantinya dengan cleanup massal `.data` atau seluruh direktori temp.

`tests/storage-isolation.test.ts` memeriksa fixture saat import, ownership cleanup, penolakan cleanup di luar parent temp, pemulihan env, dan lokasi output kedua skrip tanpa menjalankan FFmpeg/Chromium.

Saat agent menjalankan suite, batasi waktu eksekusi (baseline Task 0: 120 detik). Catat kegagalan baseline sebelum mengubah perilaku/UI berikutnya. Jangan menganggap proyek pengguna yang namanya menyerupai fixture aman untuk dihapus.

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
rtk npm run typecheck
```

---

## 3. Pengujian Pipeline Render Video Nyata (Smoke Render)

Menguji eksekusi Remotion dan FFmpeg untuk memastikan render video menghasilkan dimensi 1080×1920 H.264 / AAC 30 FPS. Jalankan dari root repository, dengan `DATA_DIR` sementara yang sama untuk kedua skrip. Contoh PowerShell berikut membuat direktori unik di OS temp dan hanya membersihkan direktori miliknya sendiri:

```powershell
$previousDataDir = [Environment]::GetEnvironmentVariable("DATA_DIR", "Process")
$ownedDir = (& rtk proxy node -e 'const fs=require("node:fs"),os=require("node:os"),path=require("node:path"); console.log(fs.mkdtempSync(path.join(os.tmpdir(),"takefield-smoke-")));').Trim()
if (-not $ownedDir -or -not (Test-Path -LiteralPath $ownedDir -PathType Container)) {
    throw "Direktori sementara smoke tidak berhasil dibuat"
}
try {
    $env:DATA_DIR = $ownedDir
    rtk npm run fixture
    if ($LASTEXITCODE -ne 0) { throw "Pembuatan fixture gagal" }
    rtk npm run smoke:render
    if ($LASTEXITCODE -ne 0) { throw "Smoke render gagal" }
} finally {
    try {
        rtk proxy node -e 'const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"); const owned=path.resolve(process.argv[1]); assert.equal(path.dirname(owned),path.resolve(os.tmpdir())); assert.ok(path.basename(owned).startsWith("takefield-smoke-")); assert.notEqual(owned,path.resolve(".data")); fs.rmSync(owned,{recursive:true,force:true});' "$ownedDir"
        if ($LASTEXITCODE -ne 0) { throw "Cleanup smoke ditolak atau gagal" }
    } finally {
        [Environment]::SetEnvironmentVariable("DATA_DIR", $previousDataDir, "Process")
    }
}
```

Kedua skrip menghormati `DATA_DIR` absolut maupun relatif terhadap root repository (whitespace luar dipangkas). Fixture dibuat di `<DATA_DIR>/tmp/fixture-300s.mp4`; hasil render ada di `<DATA_DIR>/tmp/smoke-light.mp4` dan `smoke-meme.mp4`. Smoke render meneruskan root yang sama ke proses pembuat fixture bila video belum ada. Skrip tidak membersihkan root output sendiri.

Fallback `.data/tmp` hanya untuk penggunaan manual yang disengaja tanpa `DATA_DIR` dan akan mencetak peringatan. Bila `CI` atau `VITEST` diatur, atau `NODE_ENV=test`, kedua skrip menolak berjalan tanpa `DATA_DIR` sebelum menulis berkas. Untuk otomasi/agent, selalu gunakan storage sementara, jangan memakai fallback atau menunjuk `.data` pengguna. Jangan mengubah `.env.local` atau secret untuk menjalankan tes.

Skrip ini memvalidasi metadata berkas keluaran secara otomatis menggunakan `ffprobe`. Smoke render memerlukan FFmpeg, ffprobe, dan Chromium Remotion; tes isolasi skrip memakai mock dan bukan bukti actual render.
