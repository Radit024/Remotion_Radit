# Gaming Funny Moments Web App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Jika skill tersebut tidak tersedia, kerjakan berurutan dalam sesi yang sama dengan checkpoint dan bukti; jangan mengklaim telah menjalankan skill yang tidak tersedia. Dokumen ini merencanakan pekerjaan, bukan bukti bahwa aplikasi telah dibuat.

**Goal:** Membuat aplikasi web lokal untuk memilih momen dari video gameplay 3–5 menit, meninjau subtitle/saran AI, dan merender MP4 9:16 melalui dua preset Remotion.

**Architecture:** React menyediakan editor dan Remotion Player; Node menyediakan API loopback, aset, proyek, pekerjaan AI, dan render. Satu kontrak edit serta satu compiler timeline dipakai oleh preview dan renderer. AI hanya menghasilkan data saran yang divalidasi, bukan kode atau keputusan render otomatis.

**Tech Stack:** Node 24 LTS, npm, TypeScript, Vite, React, Express, Zod, Remotion/Player/Bundler/Renderer, FFmpeg/FFprobe, Python 3.12 + faster-whisper, Ollama, Vitest, React Testing Library, dan pengujian browser.

---

## 1. Keputusan, batas, dan kondisi awal

- Root: `E:\Remotion`. Proyek saat ini hanya berisi dokumen dan Git; belum ada aplikasi, package.json, atau node_modules.
- Pengguna meminta plan dan mockup; jangan mulai menginstal dependensi atau membangun aplikasi ketika hanya menjalankan permintaan dokumen ini.
- Sumber utama: `docs/superpowers/specs/2026-10-12-gaming-funny-moments-design.md` dan `docs/research/2026-10-12-frontend-ui-references.md`. Bagian input pada spesifikasi lama diperbarui oleh keputusan terbaru: dukung sumber 3–5 menit dan pilih rentang di aplikasi.
- Node terdeteksi `24.15.0`, Python default `3.14.5`, FFmpeg dan FFprobe tersedia di PATH, RAM sekitar 27.7 GiB, GPU RTX 3050 Laptop 6 GB. Kinerja dan kompatibilitas GPU belum diuji. Ollama tidak ditemukan di PATH saat pemeriksaan.
- Gunakan Python 3.12 dalam `.venv`, bukan berasumsi faster-whisper kompatibel dengan Python default. CPU/int8 adalah fallback; GPU hanya dipakai setelah tes kompatibilitas CUDA/CTranslate2 berhasil.
- Satu sumber, satu rentang, satu titik lucu, dan satu MP4 per proyek. Pengguna dapat membuat proyek baru dari sumber yang sama; batch extraction tidak termasuk versi pertama.
- Sumber 180–300 detik wajib terbukti bekerja; durasi bukan batas keras 300 detik. Batas input versi pertama 2 GiB, media harus terbaca. UI menjelaskan batas sebelum memilih file.
- Output tetap 1080 × 1920, 30 FPS, H.264/AAC. Tidak memasang login, billing, cloud storage, remote URL import, atau auto-posting.
- Nama UI sementara: **Moment Lab**, boleh diganti tanpa mengubah arsitektur.
- SRT/manual tetap berfungsi ketika AI tidak tersedia. Status fitur AI tidak boleh disamarkan sebagai berhasil lewat data contoh.

## 2. Mockup dan kontrak desain

**Buka [mockup interaktif](../../mockups/editor.html)**. Ini prototipe HTML mandiri, bukan frontend produksi. Semua data contoh dan aksi simulasi dilabeli; tidak ada upload, AI, atau render nyata.

### Preview mockup

![Mockup editor Moment Lab](../../mockups/editor-preview.svg)

### Asal keputusan UI

| Sumber | Pola yang diambil | Adaptasi |
|---|---|---|
| [Reelio](https://dribbble.com/shots/26984097-AI-Short-Video-Editor-for-Creators) | Preview vertikal pusat, tools kiri, saran kanan | Dua preset; tombol Terapkan/Abaikan per saran |
| [ClipPilot](https://dribbble.com/shots/27106290-ClipPilot-AI-Video-Editor-Dashboard) | Workspace gelap dan panel AI | Charcoal dengan satu aksen lime; status lokal terlihat |
| [Orizon](https://dribbble.com/shots/22315456-Video-Editor-Web-Application) | Properti teks serta track terpisah | Track Video, Subtitle, Efek, Audio; tanpa editor multitrack bebas |
| [Remotion demo](https://editor-starter.remotion.dev/) | Empty canvas, playback, export | Pilih video sumber dan output 9:16; bukan keputusan membeli Editor Starter |

### Tata ruang

```text
┌ Moment Lab │ nama proyek │ status lokal │ Simpan │ Render ┐
│ Preset / Subtitle / Meme │ Hasil 9:16 / Sumber │ Saran AI │
│ Dua preset              │ Preview pusat      │ Terapkan │
│ Layout + crop focus     │ Playback + seek    │ Abaikan  │
│ Awal / Akhir / Titik    │ Durasi hasil       │ Status   │
├ Timeline hasil · sumber 01:38.40 → hasil 00:18.40         ┤
│ Video       [rentang gameplay]                           │
│ Subtitle    [dialog 1] [dialog 2]                         │
│ Efek                     ◆ [zoom / replay]               │
│ Audio       [audio sumber / aset efek suara]             │
└──────────────────────────────────────────────────────────┘
```

- Desktop ≥1200 px: tools 286 px, preview fleksibel, AI 304 px; header 68 px; timeline 210–260 px. Panel memakai scroll internal agar preview tetap terlihat pada laptop 1366 × 768.
- 900–1199 px: panel AI di bawah editor dengan section yang dapat ditutup; preview dan kontrol sumber tetap terlihat.
- <900 px: preview, tools, AI, timeline ditumpuk; tidak ada overflow halaman. Penyuntingan nyaman di desktop, tetapi kontrol tetap dapat diakses dari mobile.
- Tokens: background `#111416`, panel `#191e21`, border `#30383c`, text `#EDF1EE`, muted `#A9B4B1`, accent `#D4F77C`, subtitle track `#79CDD0`, moment marker `#FFC879`.
- Gunakan font lokal yang berlisensi sesuai: UI Segoe UI dengan fallback sans-serif; timestamp Consolas/monospace. Font subtitle harus tersedia identik pada preview dan renderer (bundled font, tidak bergantung font cloud).
- Caption paling banyak dua baris; aturan pemecahan baris adalah pembungkusan/layout teks yang ditinjau, bukan klaim diarization. Warna pembicara hanya dari label yang diisi pengguna.
- Panduan area aman: default 80 px kiri, 180 px kanan, 160 px atas, 320 px bawah pada kanvas 1080 × 1920; bisa disembunyikan di preview dan tidak masuk render. Ini margin produk konservatif, bukan jaminan semua versi UI TikTok/Shorts.

### States yang wajib dibangun

| State | Perilaku |
|---|---|
| Empty | Pilih video lokal; sumber 3–5 menit dijelaskan; Render disabled |
| Importing | Progres byte dari upload lokal, tombol disabled, kegagalan disk jelas |
| Media incompatible | Bedakan codec preview dari media rusak; tawarkan proxy/transcode lokal |
| Editing | Source seek terpisah dari output preview; awal/akhir/titik tervalidasi |
| Unsaved | Status belum tersimpan dan peringatan sebelum pindah proyek |
| Transcribing | Job berjalan, bisa dibatalkan, edit manual yang baru tidak ditimpa |
| AI unavailable | Alasan dan petunjuk setup; manual/SRT tetap tersedia |
| Suggestions ready | Tiap saran punya waktu, tindakan, Terapkan/Abaikan |
| Rendering | Snapshot revisi terlihat; progress nyata dan Batalkan |
| Complete | Lokasi output lokal dan Unduh/Buka hasil; bukan progres simulasi |
| Failed/cancelled | Pesan yang dapat ditindaklanjuti; sumber/proyek tetap aman |

## 3. Struktur file dan kepemilikan

```text
src/
  shared/ edit.ts timeline.ts presets.ts suggestions.ts
  web/ main.tsx App.tsx styles.css api.ts
    editor/ Editor.tsx SourcePlayer.tsx OutputPreview.tsx RangeControls.tsx
    editor/ PresetPanel.tsx SubtitlePanel.tsx AssetPanel.tsx SuggestionPanel.tsx
    editor/ OutputTimeline.tsx RenderDialog.tsx useProject.ts
  video/ index.ts Root.tsx FunnyMoment.tsx VideoSegment.tsx CaptionLayer.tsx
    EffectLayer.tsx AudioLayer.tsx
  server/ index.ts app.ts guard.ts storage.ts assets.ts media.ts projects.ts
    jobs.ts render.ts ai.ts process.ts
scripts/ doctor.mjs transcribe.py create-fixture.mjs smoke-render.mjs
tests/ edit.test.ts timeline.test.ts security.test.ts projects.test.ts
  ai.test.ts jobs.test.ts editor.test.tsx render.integration.test.ts
public/ fonts/                 # hanya font/aset bawaan berlisensi
.data/ assets/ projects/ jobs/ outputs/ tmp/  # semua diabaikan Git
docs/ SETUP.md TESTING.md
package.json package-lock.json tsconfig.json vite.config.ts
vitest.config.ts .gitignore .env.example
```

Tidak membuat generic provider/service interface untuk satu implementasi. `ai.ts` memakai Ollama, `transcribe.py` memakai faster-whisper; fungsi kecil menerima dependensi fetch/spawn hanya bila diperlukan untuk tes kegagalan. Model edit dan timeline tidak mengimpor browser, Express, atau filesystem.

## 4. Kontrak data dan waktu

### Kontrak inti yang dibuat pada Task 2

```ts
// src/shared/edit.ts — seluruh timestamp canonical dalam frame 30 FPS.
export const FPS = 30;
export type Preset = 'light' | 'meme';
export type Asset = {
  id: string; kind: 'video' | 'image' | 'audio'; name: string;
  durationFrames: number; width: number; height: number;
  hasAudio: boolean; previewReady: boolean;
};
export type Caption = {
  id: string; startFrame: number; endFrame: number; text: string;
  speaker: string | null;
};
export type Effect = {
  id: string; kind: 'zoom' | 'shake' | 'reaction' | 'image' | 'sfx';
  startFrame: number; endFrame: number; text: string;
  assetId: string | null; strength: number;
};
export type Edit = {
  id: string; revision: number; assetId: string; name: string;
  startFrame: number; endFrame: number; momentFrame: number;
  preset: Preset; layout: 'contain' | 'crop';
  focusX: number; focusY: number; captionY: number;
  freezeFrames: number; replayFrames: number;
  captions: Caption[]; effects: Effect[];
};
export type Segment = {
  kind: 'normal' | 'freeze' | 'replay'; sourceStart: number;
  sourceEnd: number; outputStart: number; durationFrames: number;
};
export type CompiledEdit = {
  segments: Segment[]; durationFrames: number;
  captions: Caption[]; effects: Effect[];
};
export const toFrame = (seconds: number) => Math.round(seconds * FPS);
```

`sourceEnd` dan seluruh `endFrame` eksklusif. `momentFrame` harus `< endFrame`. Waktu asli video dipetakan berdasarkan detik, bukan menganggap fps rekaman sama dengan composition fps. Semua UI detik menjadi integer frame sebelum disimpan. Metadata duration dibulatkan ke bawah untuk mencegah frame di luar media.

### Timeline deterministik

Misal `s=startFrame`, `e=endFrame`, `p=momentFrame`, `f=freezeFrames`, `r=replayFrames`. Replay mencakup jendela `[max(s,p-floor(r/3)), min(e, start+r))`, diputar ulang segera setelah jendela aslinya selesai. Freeze disisipkan sebelum frame `p`, lalu playback asli dilanjutkan dari `p`, sehingga tidak membuang audio/video sumber.

```ts
// Algoritme lengkap untuk pembentukan segment; validasi dilakukan sebelum masuk.
export function buildSegments(s: number, e: number, p: number, f: number, r: number) {
  const list: Segment[] = [];
  let output = 0;
  const add = (kind: Segment['kind'], a: number, b: number, length = b - a) => {
    if (length <= 0) return;
    list.push({kind, sourceStart: a, sourceEnd: b,
      outputStart: output, durationFrames: length});
    output += length;
  };
  const a = Math.max(s, p - Math.floor(r / 3));
  const b = Math.min(e, a + r);
  add('normal', s, p);
  add('freeze', p, p + 1, f);
  add('normal', p, Math.max(p, b));
  if (r > 0) add('replay', a, b);
  add('normal', Math.max(p, b), e);
  return {segments: list, durationFrames: output};
}
```

Compiler memotong setiap caption/effect terhadap setiap normal/replay segment, mengubah offset ke output, dan menghasilkan ID `${id}:${segmentIndex}`. Pada freeze, caption yang aktif pada `p` bertahan; audio sumber diam. Reaksi dan SFX hanya dipicu pada kejadian asli kecuali pengguna sengaja menambahkan efek lain. Caption dialog diulang pada replay. Hindari soundtrack gameplay ganda pada layer background blur.

Contoh bukti: sumber `[2400,3300)` (01:20–01:50), titik 2952 (01:38.40), freeze 12, replay 36 menghasilkan output 948 frame =31.6 detik. Titik kejadian playback asli menjadi frame 564 setelah freeze; posisi awal freeze 552. UI menampilkan kedua makna secara eksplisit saat diperlukan.

### Preset tetap

| Nilai | light | meme |
|---|---|---|
| Zoom | 1.12×, 18 frame sekitar titik | 1.30×, 24 frame |
| Shake | off | amplitudo maksimum 8 px kanvas, 10 frame |
| Freeze | off | 12 frame, pengguna dapat mematikan |
| Replay | off | off sampai dipilih; default saat dipilih 36 frame |
| Reaksi | off sampai teks diberikan | aktif hanya jika teks diberikan |
| Audio sumber | gain 1.0 | gain 1.0 |
| SFX aset | opsional; gain default 0.35 | opsional; gain default 0.35 |

Nilai ini default desain, belum hasil uji selera. Pergantian preset tidak menghapus caption atau aset pengguna; tawarkan Terapkan default efek sebelum mengganti efek yang telah dikoreksi.

## 5. API lokal dan penyimpanan

Dev frontend `127.0.0.1:5173`, Express `127.0.0.1:4318`; Vite proxy `/api`. Production Express menyajikan `dist/web` dan API pada origin yang sama. Tidak bind `0.0.0.0`.

| Method / route | Request | Response / perilaku |
|---|---|---|
| GET `/api/health` | — | Versi dan readiness FFmpeg, Python, model transkripsi, Ollama/model; status unavailable bukan sukses |
| POST `/api/assets` | Multipart satu file | 201 Asset; stream ke staging, validasi, lalu publish |
| GET `/api/assets/:id/content` | Range header opsional | Media stream 200/206; 416 bila range salah |
| POST `/api/assets/:id/preview` | — | 202 job membuat proxy H.264/AAC untuk preview bila dibutuhkan |
| GET `/api/projects` | — | Daftar ringkas proyek lokal |
| POST `/api/projects` | `{assetId,name}` | 201 Edit dengan default valid |
| GET `/api/projects/:id` | — | Edit dan revision |
| PUT `/api/projects/:id` | Edit + `If-Match` revision | 200 revision baru; 409 bila stale |
| POST `/api/projects/:id/transcribe` | `{revision}` | 202 Job; hanya selected range diekstrak |
| POST `/api/projects/:id/suggestions` | `{revision,model}` | 202 Job; model harus tercantum dalam model lokal |
| POST `/api/projects/:id/render` | `{revision}` | 202 Job, snapshot edit yang sudah tersimpan |
| GET `/api/jobs/:id` | — | Job status, progress bila tersedia, error, hasil |
| POST `/api/jobs/:id/cancel` | — | Request cancellation idempotent |
| GET `/api/outputs/:id` | — | MP4 selesai saja; attachment header dengan nama aman |

`Job` mempunyai `id`, `kind` (`proxy/transcribe/suggestions/render`), `status` (`queued/running/succeeded/failed/cancelled/interrupted`), `projectId`, `revision`, `progress: number|null`, `createdAt`, `result`, dan `error:{code,message}|null`. Persentase hanya bila tersedia dari proses; transkripsi/AI dapat menampilkan indeterminate.

Satu worker lokal menjalankan paling banyak satu pekerjaan berat aktif agar VRAM/RAM tidak diperebutkan. Request render duplikat atas revisi yang sama mengembalikan job aktif yang sama; request berat lain dapat ditolak 409 BUSY versi pertama. Tidak perlu queue distributif.

Proyek disimpan sebagai JSON tervalidasi. Save menggunakan mutex per proyek, write-temp + rename di direktori yang sama, serta revision compare di dalam lock. Gagal rename Windows harus dilaporkan tanpa menghapus file lama. UI mempunyai tombol Simpan, indikator dirty, serta peringatan keluar; render menyimpan dahulu dan hanya berjalan jika save berhasil. Tidak memakai database untuk satu pengguna lokal.

## 6. Tahapan implementasi dan bukti

Semua perintah shell memakai `rtk` sesuai `C:\Users\daffa\.codex\RTK.md`. Potongan kode pada task adalah isi kontrak/helper/tes yang dipakai untuk mengunci perilaku; file UI/backend lain dibangun dari kontrak dan acceptance steps yang eksplisit. Plan tidak menyamar sebagai seluruh source aplikasi yang telah diimplementasikan.

### Task 1 — Runtime, scaffold, dan scripts

**Files:** create `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `scripts/doctor.mjs`, `src/web/main.tsx`, `src/server/index.ts`.

- [ ] Periksa runtime dengan `rtk node --version`, `rtk npm --version`, `rtk ffmpeg -version`, `rtk ffprobe -version`, `rtk proxy py -0p`. Catat versi dan Python 3.12 yang tersedia; jangan mengganti Python default.
- [ ] Buat scaffold Vite React/TypeScript di root tanpa menghapus `docs` atau `.git`. Pasang dependensi:

```powershell
rtk npm install react react-dom remotion @remotion/player @remotion/bundler @remotion/renderer express zod multer
rtk npm install -D typescript vite @vitejs/plugin-react tsx concurrently vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom supertest @types/react @types/react-dom @types/express @types/multer @types/supertest
```

- [ ] Pilih release Remotion yang sama untuk seluruh paketnya, pin exact version hasil instalasi, dan commit lockfile. Periksa `rtk npm ls remotion @remotion/player @remotion/renderer @remotion/bundler` tanpa mismatch. Jangan mengarang nomor release.
- [ ] Definisikan scripts berikut. Build server dengan bundler yang mendukung ESM dan external Remotion jika tsc extension resolution menghambat; pilihan awal `tsc` dengan NodeNext dan import `.js` pada source backend.

```json
{"dev":"concurrently -k \"tsx watch src/server/index.ts\" \"vite --host 127.0.0.1\"",
 "typecheck":"tsc --noEmit",
 "test":"vitest run",
 "build":"vite build --outDir dist/web && tsc -p tsconfig.server.json",
 "start":"node dist/server/server/index.js",
 "doctor":"node scripts/doctor.mjs",
 "fixture":"node scripts/create-fixture.mjs",
 "smoke:render":"node scripts/smoke-render.mjs"}
```

- [ ] Tambahkan `tsconfig.server.json` (NodeNext, rootDir `src`, outDir `dist/server`), dan pisahkan config web bila DOM types bocor ke server. Doctor melaporkan komponen tersedia/unavailable tanpa instalasi atau download otomatis.
- [ ] `.gitignore`: node_modules, dist, .data, .venv, .env, Python cache, browser test outputs. `.env.example` hanya `PYTHON_PATH`, `WHISPER_MODEL_PATH`, `OLLAMA_MODEL`; Ollama URL fixed loopback.
- [ ] Jalankan `rtk npm run typecheck` dan `rtk npm run build`; expected exit 0 dengan halaman dasar dan health route. Commit `chore: scaffold local editor runtime`.

### Task 2 — Skema edit, preset, dan validasi

**Files:** create `src/shared/edit.ts`, `presets.ts`, `suggestions.ts`, `tests/edit.test.ts`.

- [ ] Tulis tes berikut sebelum validator. Export fungsi `validateEdit(edit, asset, relatedAssets)` dari `edit.ts`; kembalikan parsed Edit atau throw validation error.

```ts
import {expect, test} from 'vitest';
import {validateEdit, type Asset, type Edit} from '../src/shared/edit';
const asset: Asset = {id:'a',kind:'video',name:'clip.mp4',durationFrames:7560,
 width:1920,height:1080,hasAudio:true,previewReady:true};
const edit: Edit = {id:'p',revision:1,assetId:'a',name:'Mabar',startFrame:2400,
 endFrame:3300,momentFrame:2952,preset:'light',layout:'contain',focusX:.5,
 focusY:.5,captionY:.72,freezeFrames:0,replayFrames:0,captions:[],effects:[]};
test('accepts selected range within a 4m12s source',()=>{
 expect(validateEdit(edit,asset,[]).endFrame).toBe(3300);
});
test.each([NaN,Infinity,-1,3300])('rejects invalid moment %s',momentFrame=>{
 expect(()=>validateEdit({...edit,momentFrame},asset,[])).toThrow();
});
test('rejects nonexistent meme asset',()=>{
 expect(()=>validateEdit({...edit,effects:[{id:'e',kind:'image',startFrame:2952,
 endFrame:2982,text:'',assetId:'missing',strength:1}]},asset,[])).toThrow();
});
```

- [ ] `rtk npm test -- tests/edit.test.ts`: expected fail until validator exists.
- [ ] Implement Zod strict objects from section 4: finite integer frames, nonempty bounded IDs, name ≤120 chars, caption ≤160 chars, reaction ≤80 chars, normalized focus 0..1, captionY .15.. .82, freeze 0..60, replay 0..90, zoom strength 1..1.5, shake ≤12 px; at most 600 captions and 100 effects. Reject unknown keys. Refine source range against metadata and asset type against relatedAssets. Enforce caption start < end and effect start < end.
- [ ] Add `makePresetEffects(preset, momentFrame, startFrame, endFrame)` which clips its window to selected range. It generates no reaction text or arbitrary assets. Preset default changes require explicit UI action when existing effects differ.
- [ ] Rerun tests; expected pass. Commit `feat: define validated editing contract`.

### Task 3 — Compiler timeline sebagai sumber kebenaran

**Files:** create `src/shared/timeline.ts`, `tests/timeline.test.ts`; modify `edit.ts` if typed compiler result needed.

- [ ] Tulis tes real mapping berikut; export `compileEdit(Edit):CompiledEdit` dan `sourceFrameAt(CompiledEdit,outputFrame):number`.

```ts
import {expect,test} from 'vitest';
import {compileEdit,sourceFrameAt} from '../src/shared/timeline';
import type {Edit} from '../src/shared/edit';
const edit: Edit = {id:'p',revision:1,assetId:'a',name:'x',startFrame:2400,
 endFrame:3300,momentFrame:2952,preset:'meme',layout:'contain',focusX:.5,
 focusY:.5,captionY:.72,freezeFrames:12,replayFrames:36,effects:[],
 captions:[{id:'c',startFrame:2952,endFrame:2960,text:'jatuh',speaker:null}]};
test('freeze/replay preserve selected source length and align captions',()=>{
 const result=compileEdit(edit);
 expect(result.durationFrames).toBe(948);
 expect(sourceFrameAt(result,552)).toBe(2952);
 expect(sourceFrameAt(result,563)).toBe(2952);
 expect(sourceFrameAt(result,564)).toBe(2952);
 expect(result.captions.some(c=>c.startFrame===564)).toBe(true);
 expect(sourceFrameAt(result,947)).toBe(3299);
});
test('no insertions maps first/last frame exactly',()=>{
 const r=compileEdit({...edit,freezeFrames:0,replayFrames:0});
 expect(r.durationFrames).toBe(900);
 expect(sourceFrameAt(r,0)).toBe(2400);
 expect(sourceFrameAt(r,899)).toBe(3299);
});
```

- [ ] Run failing test, then implement `buildSegments` from section 4 and interval intersection mapping. `sourceFrameAt` finds half-open output interval, returns freeze sourceStart or sourceStart+offset; invalid output frame throws.
- [ ] Add boundary cases: moment at start, moment=end-1, replay shorter near end, captions crossing cuts, source without audio, disabled effects. Assert segment continuity and sum durations with seeded generated valid ranges.
- [ ] Run `rtk npm test -- tests/timeline.test.ts`; expected pass. Commit `feat: compile source edits into one output timeline`.

### Task 4 — Local trust boundary, media import, and streaming

**Files:** create `src/server/guard.ts`, `storage.ts`, `process.ts`, `media.ts`, `assets.ts`, `app.ts`, `tests/security.test.ts`.

- [ ] Tests assert unexpected Host, cross-site Origin mutation, `../` ID, invalid UUID, oversized upload, fake MIME, and invalid Range are rejected; valid same-origin upload returns managed Asset.
- [ ] Validate Host against `127.0.0.1:4318` and dev forwarded allowed origin; production only own origin. Mutations require allowed Origin plus JSON or multipart content type. CORS does not use wildcard. Reject cross-site Fetch Metadata. Bind to loopback; localhost tools cannot execute arbitrary shell commands.
- [ ] Use Multer disk streaming with 2 GiB file limit, exactly one file, bounded fields, UUID filename. Detect truncated limit and remove only known staging file inside `.data/tmp`. Probe media with FFprobe, not extension/MIME alone. Filenames are display text, never shell strings or storage paths.
- [ ] Use this process pattern, with caller-provided fixed arguments and trusted executable names only:

```ts
import {spawn} from 'node:child_process';
export function spawnTool(command: string, args: string[]) {
 return spawn(command,args,{shell:false,windowsHide:true,
  stdio:['ignore','pipe','pipe']});
}
```

- [ ] `runTool` wraps it with bounded stdout/stderr, timeout, AbortSignal, exit checks, and child-tree cancellation on Windows. Never log private transcripts or full local paths by default.
- [ ] FFprobe args `-v error -show_format -show_streams -of json <managedPath>`; duration finite positive; reject media with no video for video import. Images limited 25 MiB and decoded dimension ≤8192; audio ≤100 MiB and valid audio stream. Reject SVG/HTML/script inputs as meme assets.
- [ ] Media IDs map through manifest lookup, not user path joins. Stream Range with validated single interval, Content-Type from probe, Content-Length, Accept-Ranges, and safe Content-Disposition. Reject multiple ranges in first version.
- [ ] On unsupported browser codec, preserve original and create local preview proxy: H.264 yuv420p/AAC with max 1280 px longest side, native timestamps, faststart. A lower-quality preview proxy must not become final-render source. Final render uses original only if renderer can decode it; otherwise explicit full-quality normalized intermediate. Maintain source duration/frame alignment across proxies.
- [ ] Run `rtk npm test -- tests/security.test.ts`; expected all rejection/streaming cases pass. Commit `feat: import and serve managed local media safely`.

### Task 5 — Proyek lokal dan save concurrency

**Files:** create `src/server/projects.ts`, `tests/projects.test.ts`; extend `storage.ts`.

- [ ] Test that source import + create project survives restart, two concurrent saves with revision 1 yield exactly one revision 2 and one 409, malformed stored JSON returns readable error, rename failure preserves previous file.
- [ ] Store project `${uuid}.json` with strict Edit; metadata manifests separately. Lock per project around read revision, validate, stage, and rename. Temp name UUID in same directory. In-memory keyed mutex is sufficient for one server process; prevent launching a second writer on same data directory via local exclusive lockfile with stale PID handling.
- [ ] GET list returns ID/name/updatedAt/source name only. PUT requires `If-Match`; return revision 2 with persisted content. No automatic deletion endpoints in first version.
- [ ] Run `rtk npm test -- tests/projects.test.ts`; expected pass. Commit `feat: persist versioned local projects`.

### Task 6 — Remotion composition dan local render smoke

**Files:** create `src/video/index.ts`, `Root.tsx`, `FunnyMoment.tsx`, `VideoSegment.tsx`, `CaptionLayer.tsx`, `EffectLayer.tsx`, `AudioLayer.tsx`, `scripts/create-fixture.mjs`, `scripts/smoke-render.mjs`, `tests/render.integration.test.ts`.

- [ ] Create synthetic fixture with FFmpeg lavfi: 300 seconds, 1280×720, 30fps, colored timecoded pattern and 440 Hz audio. Add 1-second distinct tone near point 98.4s for sync verification; no real user footage committed. Store fixture under `.data/tmp`.
- [ ] Register composition with dynamic duration from `compileEdit`:

```tsx
import React from 'react';
import {Composition,getInputProps,registerRoot} from 'remotion';
import {FunnyMoment,type VideoProps} from './FunnyMoment';
import {compileEdit} from '../shared/timeline';
export const Root=()=> <Composition id="FunnyMoment" component={FunnyMoment}
 width={1080} height={1920} fps={30} durationInFrames={1}
 defaultProps={getInputProps<VideoProps>()}
 calculateMetadata={({props})=>({durationInFrames:compileEdit(props.edit).durationFrames})}/>;
registerRoot(Root);
```

`VideoProps` is `{edit:Edit,sourceUrl:string,assetUrls:Record<string,string>}`; validate before composition. Root reads validated inputProps supplied by the backend/smoke runner; an empty Studio entry must show an instructional composition rather than dereferencing an absent edit. Separate registration (`index.ts`) from Root export so web importing composition does not call registerRoot.

- [ ] Each segment uses `Sequence from={outputStart} durationInFrames={durationFrames}`. Original/replay Video component uses source trim in composition frame units. Freeze uses `<Freeze frame={0}>` around a video trimmed at sourceStart and muted. Use the current pinned Remotion component API; check installed type signatures before coding, do not mix deprecated props.
- [ ] Keep source audio in exactly one layer; blur background video always muted. Freeze segment muted. SFX tracks use managed asset URLs and bounded volume. Preview and render import same FunnyMoment.
- [ ] Draw contain/crop using shared focusX/Y; deterministic zoom interpolation; shake from fixed frame-based sine function, never Math.random per frame. Reaction uses text nodes; no innerHTML. Caption text wraps to max two lines in safe area with measured font and accessible editor adjustment. Export excludes safe-area guides.
- [ ] Renderer smoke uses `bundle` once, `selectComposition({id:'FunnyMoment',inputProps})`, then `renderMedia({codec:'h264',audioCodec:'aac',crf:18,pixelFormat:'yuv420p',composition,inputProps,serveUrl,outputLocation})`. Start concurrency 2 and benchmark before increasing; do not promise GPU hardware encoding.
- [ ] Run `rtk npm run fixture`, then `rtk npm run smoke:render`. FFprobe output asserts 1080×1920, fps 30, H.264, AAC, 30.0s light and 31.6s meme when freeze12/replay36 enabled. Inspect selected first/moment/replay/last frames and listen to audio interruption/replay. Commit `feat: render both presets from shared composition`.

### Task 7 — Job lifecycle, render snapshot, cancel, recovery

**Files:** create `src/server/jobs.ts`, `render.ts`, `tests/jobs.test.ts`; modify `app.ts`.

- [ ] Test duplicate render requests reuse active job, another heavy job yields BUSY, revision mutation after start does not change snapshot, cancelled output is not downloadable, restart marks running jobs interrupted.
- [ ] Save a deep immutable edit snapshot and revision in job JSON before work begins. Job ID determines output and temp names. Backend owns statuses; frontend cannot set success or outputPath.
- [ ] Bundle cache invalidated by source/version changes; run worker with fixed FFmpeg/runtime dependencies. Forward progress from renderer only; use its cancellation API where available. Cancel child processes and polling cleanly, then delete only that job's managed partial output after process closure.
- [ ] Atomic rename final MP4 after renderer success and probe verification. `/api/outputs/:id` verifies succeeded job and mapped output, never serves partial file. Preserve failed job diagnostic code without raw stack exposure.
- [ ] Poll while UI has running jobs every 1s; stop on terminal state/unmount. On restart discover persisted jobs and preserve finished outputs. Commit `feat: coordinate recoverable local render jobs`.

### Task 8 — Frontend shell, source range, and project controls

**Files:** create `src/web/App.tsx`, `styles.css`, `api.ts`, `editor/Editor.tsx`, `SourcePlayer.tsx`, `RangeControls.tsx`, `useProject.ts`, `tests/editor.test.tsx`.

- [ ] Translate mockup to semantic React components, retaining design tokens and responsive rules. Do not copy simulated script or hardcoded success into production UI. Create project picker, empty state, local upload, actual filename and metadata.
- [ ] SourcePlayer uses browser video, supports keyboard seek, and emits `currentTime`. Buttons Ambil awal/Ambil akhir/Tandai update draft canonical frame values. Numeric timestamp inputs offer precise control; selecting a point outside range produces clear validation, not silent movement.
- [ ] useProject owns draft, persisted revision, dirty, save state and server errors. A 409 prompts reload/copy draft; no automatic overwrite. Render first awaits successful save, then starts job for returned revision.
- [ ] API client uses relative `/api`, parses structured errors, AbortController for requests, and aborts polling on unmount. No external network URLs in user inputs.
- [ ] Editor test: source duration 252s, chosen [80,110), moment98.4 produces frames2400/3300/2952; invalid end disables Render. Failed save prevents render POST.
- [ ] Run `rtk npm test -- tests/editor.test.tsx`, `rtk npm run typecheck`. Commit `feat: edit one selected moment in local web UI`.

### Task 9 — Preview, timeline, presets, caption/SRT editing, assets

**Files:** create `OutputPreview.tsx`, `OutputTimeline.tsx`, `PresetPanel.tsx`, `SubtitlePanel.tsx`, `AssetPanel.tsx`; modify `editor.test.tsx` and `timeline.test.ts`.

- [ ] OutputPreview receives `VideoProps` used by render and mounts Remotion Player with compiler duration. Source and output tabs have independent time positions; selected mode is announced through tab roles.
- [ ] Timeline displays compiled output intervals (not raw source times) and source/output tooltips. One point marker identifies start of freeze and actual event frame when different. Click caption/effect selects existing item; no arbitrary layer editor needed.
- [ ] Implement preset select with explicit apply-defaults action preserving captions/custom assets. Controls include freeze/replay toggles, bounded zoom/shake, contain/crop, normalized focus controls, caption position, and safe-guide preview toggle.
- [ ] Subtitle editor supports add/update/delete segment, speaker label, text, timestamps; source canonical frame domain displayed explicitly. Import SRT locally as text, parse timestamps with milliseconds, reject invalid overlaps if simultaneous cues cannot fit, clip cues outside selection with a count/message. Offer time base choice Source or Selected clip for imported SRT; selected-clip times offset by startFrame. Export SRT reflects selected source range before inserted effects, labelled accordingly.
- [ ] Meme image/audio uploads use assets route and require supported type. Pick stored assets for effect entry, display volume/duration; default has no unlicensed stock meme.
- [ ] Test manual corrections persist through preset change and preview uses edited text; imported SRT offset by startFrame; unknown asset rejected. Browser check desktop 1440, laptop1366×768, mobile390px; no horizontal overflow. Commit `feat: preview and refine captions presets and assets`.

### Task 10 — Local transcription dengan faster-whisper

**Files:** create `scripts/transcribe.py`, `src/server/ai.ts`, `tests/ai.test.ts`, `docs/SETUP.md`; modify `jobs.ts`.

- [ ] Create isolated Python3.12 venv and install pinned known-compatible `faster-whisper` after runtime check. Model download is an explicit setup step; app never auto-downloads while editing.

```powershell
rtk proxy py -3.12 -m venv .venv
rtk proxy .venv\Scripts\python.exe -m pip install faster-whisper
rtk proxy .venv\Scripts\python.exe -m pip freeze
```

- [ ] Record installed versions in `requirements.txt`. Model path is a configured local directory. Script contract is complete:

```python
import argparse, json
from faster_whisper import WhisperModel
p = argparse.ArgumentParser()
p.add_argument('--audio', required=True)
p.add_argument('--model', required=True)
p.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
a = p.parse_args()
m = WhisperModel(a.model, device=a.device,
                 compute_type='int8' if a.device == 'cpu' else 'float16',
                 local_files_only=True)
segments, info = m.transcribe(a.audio, language='id', vad_filter=True,
                              word_timestamps=True)
result = [{'start': s.start, 'end': s.end, 'text': s.text.strip(),
           'words': [{'start': w.start, 'end': w.end, 'word': w.word}
                     for w in (s.words or [])]} for s in segments]
print(json.dumps({'language': info.language, 'segments': result},
                 ensure_ascii=False), flush=True)
```

- [ ] Extract only selected range with FFmpeg to mono16kHz WAV; no shell interpolation. Returned relative seconds are converted to frame + startFrame. Validate array limits, finite times, media bounds, UTF-8 and empty speech. Group word timestamps into readable cues, not arbitrary uniform guessed timing.
- [ ] Capture transcript as job result; never overwrite draft automatically. Offer Ganti subtitle / Tambahkan dengan pemeriksaan konflik. If current revision changed, label stale and require user review. Missing audio shows NO_AUDIO; missing model shows MODEL_MISSING; runtime error differs from silence.
- [ ] Tests use recorded small fixtures for parser validation and failure branches; real transcription smoke uses a consented local spoken Indonesian fixture. Verify timestamp accuracy manually; no diarization claim. Try CUDA only after driver/library smoke; CPU remains usable. Commit `feat: generate reviewable local subtitles`.

### Task 11 — Ollama structured suggestions dan review

**Files:** extend `src/server/ai.ts`, `src/shared/suggestions.ts`; create `SuggestionPanel.tsx`; extend `tests/ai.test.ts`.

- [ ] Install Ollama from official source only as explicit setup work and choose an available small model after checking RAM/VRAM. Start from a quantized 3B model if benchmark permits; store selected model name, do not hardcode an unverified model download as requirement.
- [ ] Read `/api/tags` from fixed `http://127.0.0.1:11434`, expose installed model choices. POST `/api/chat` with `stream:false`, JSON schema `format`, `options.temperature:0`. Timeout 120s, user cancellation, response size cap. Model cannot choose URLs or paths.
- [ ] `Suggestion` schema: `{id,kind:'zoom'|'shake'|'reaction',startFrame,endFrame,text,strength,reason}`; max5 entries, reason≤240chars. Frame domain remains source; validate against selection and preset constraints. No asset IDs from AI. AI prompt includes transcript as untrusted data, selected range, point, and allowed schema; request concise natural Indonesian, no fabricated spoken dialogue.
- [ ] Convert accepted suggestion to an Effect with UUID; accepting twice is idempotent by suggestion ID. Suggested reaction is separate from transcript text. Validate response after JSON parse; invalid JSON/schema gives AI_INVALID_RESPONSE, no effects applied. Reject injection content that tries to introduce new effect types.
- [ ] Test with mock fetch for invalid JSON, timeout, uninstalled model, out-of-range frames, unknown kind, stale revision. Live smoke proves local model response and accept/reject; fake example responses are only tests, never production fallback labelled AI.
- [ ] Commit `feat: suggest validated edits with local AI review`.

### Task 12 — Render UI, progress, download, cancellation

**Files:** create `RenderDialog.tsx`; update Editor, api, editor tests.

- [ ] Dialog shows snapshot revision, output dimensions, duration and real progress. Trap focus; Escape closes view without silently cancelling job. Explicit Batalkan sends cancellation; user can reopen current job view.
- [ ] Success offers MP4 download and reveals saved project-relative output location. Failure offers retry from same snapshot or return to editing, with distinct disk/full, codec, dependency, and cancellation messages.
- [ ] Button guard prevents duplicate clicks; server still enforces duplicate protection. Navigation/reload can recover job from persisted state.
- [ ] Test rendering→complete, rendering→failed, cancel, and rendering after a changed draft. Check generated download media locally. Commit `feat: surface local export lifecycle`.

### Task 13 — Full verification, documentation, finish gate

**Files:** create `docs/TESTING.md`, update SETUP and README; update tests and doctor.

- [ ] Run smallest full suite:

```powershell
rtk npm run doctor
rtk npm run typecheck
rtk npm test
rtk npm run build
rtk npm run fixture
rtk npm run smoke:render
rtk git diff --check
```

- [ ] Production smoke: `rtk npm start`, use same-origin served UI without Vite. Import300s fixture, select80–110s, point98.4, save, generate/manual captions, both presets, render, download, restart, reopen project/output.
- [ ] Actual browser QA:1366×768,1440×900,390×844; keyboard input/focus; modal Escape/focus return; reduced motion; no console errors; input error, AI unavailable, render failure, and cancel visible. Check both original-source and output seek behavior. Use browser/computer-use when available; do not infer visual QA from build success.
- [ ] Security proof: reject unexpected Origin/Host, path traversal, malformed Range, oversized uploads, extra AI keys, stale project save, arbitrary output access. Verify data directory not exposed by static hosting and logs do not include private transcripts.
- [ ] Audio/visual proof on light and meme MP4: dimensions/codecs/duration, subtitle at moment, replay repeats correct frames+audio, freeze silence, no double audio, caption max two lines, crop preserves user-selected focus. Keep synthetic evidence and exclude personal media from Git.
- [ ] Benchmark selected30s output and full3–5min source preview on device; record elapsed render/transcription, peak RAM if measurable, GPU runtime readiness, proxy quality. No universal ETA or quality claim based only on fixture.
- [ ] SETUP explains start/stop, data location, Python/model setup, local upload vs cloud, disk usage, model limitations, backups, runtime troubleshooting, and license checks. README distinguishes ready template/render vs actually verified AI integration.
- [ ] Final completion is blocked if either preset cannot render, project cannot reopen, or timing is wrong. Missing AI runtime is reported as unavailable integration, not full AI system success. Commit `test: verify local funny moment workflow` after evidence passes.

## 7. API error vocabulary

Use `{error:{code,message}}` with HTTP codes:400 VALIDATION,404 ASSET_NOT_FOUND/PROJECT_NOT_FOUND,409 REVISION_CONFLICT/BUSY,413 FILE_TOO_LARGE,415 MEDIA_UNSUPPORTED,422 NO_AUDIO/AI_INVALID_RESPONSE,503 DEPENDENCY_UNAVAILABLE/MODEL_MISSING,500 DISK_WRITE_FAILED/RENDER_FAILED. No raw stderr stack or user transcript in responses. Internal diagnostics can be opt-in local logs with redaction.

## 8. Acceptance checklist dan pelacakan cakupan

| Requirement | Task / proof |
|---|---|
| Input sumber3–5menit dan rentang |4,8,13;300s fixture |
| Dua preset |2,6,9;dua MP4 smoke |
| Preview9:16 dan timeline |3,6,9;browser + frame checks |
| Subtitle manual/SRT/AI |9,10;time-base tests + live transcript |
| Saran AI ditinjau |11;schema + live model |
| Meme image dan SFX |4,6,9;asset validation/audio proof |
| Freeze/replay audio sync |3,6,13;948-frame test + listen |
| Render lokal aman |4,7,12;origin/job/output tests |
| Save/reopen proyek |5,8,13;restart test |
| Model unavailable fallback |10,11,13;UI state proof |
| Mobile/keyboard/errors |8,9,12,13;browser QA |

## 9. Urutan checkpoint

1. Task1–5: file sumber dan proyek lokal valid serta tersimpan.
2. Task6–7: dua MP4 nyata dengan timing benar, sebelum mempercantik semua UI.
3. Task8–9: editor sesuai mockup; source/range/subtitle dapat ditinjau.
4. Task10–11: transkripsi dan saran model lokal, atau laporan blocker dependensi yang konkret.
5. Task12–13: seluruh alur, restart, cancel, unduhan dan bukti visual selesai.

Mulai eksekusi berurutan di chat ini setelah pengguna meminta build. Delegasi hanya bila pengguna memilih/menyetujui atau instruksi yang berlaku memintanya. Plan dan mockup dapat ditinjau terlebih dahulu; tidak diperlukan hosting atau akun cloud untuk tahap ini.

## 10. Verifikasi dokumen dan mockup (sudah dilakukan saat penyusunan)

- Mockup dibuka melalui browser lokal. Pergantian preset menampilkan reaksi dan label efek; koreksi subtitle mengubah preview contoh.
- Dialog simulasi render dapat dibuka dan ditutup dengan Escape. Empty state menonaktifkan tombol Render.
- Console browser tidak menunjukkan error pada pemeriksaan tersebut. Pemeriksaan DOM pada viewport 390 px tidak menemukan overflow horizontal.
- Preview SVG adalah ilustrasi layout desktop yang dibuat khusus, bukan screenshot aplikasi produksi. Mockup HTML dan SVG tidak membuktikan AI atau render backend.
- Semua task aplikasi dan acceptance checks pada section 6 tetap berstatus belum dikerjakan.
