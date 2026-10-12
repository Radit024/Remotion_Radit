# Toolkit UI, emoji, font, dan animasi — Moment Lab

Riset melalui browser pada 12 Oktober 2026. Halaman resmi/dokumentasi dibuka dan dibaca; beberapa tampilan font serta FAQ emoji dilihat secara visual. Paket belum diinstal dan kompatibilitas build/render belum diuji. Dokumen ini riset toolkit, bukan bukti paket sudah diimplementasikan. Pembaruan keputusan pengguna: Next.js menggantikan frontend build tool pada proposal awal dan OpenRouter menjadi provider AI; implementation plan adalah authority terbaru.

## Paket yang direkomendasikan

| Kebutuhan | Pilihan utama | Penggunaan |
|---|---|---|
| Frontend | Next.js App Router + React + TypeScript | API satu origin dan worker render lokal sesuai plan terbaru |
| Komponen UI | shadcn/ui + Tailwind CSS | Dialog, Tabs, Slider, Select, Switch, Tooltip, Progress, Scroll Area, Resizable |
| Primitives | Pilih satu base shadcn saat setup | Dokumen yang dibuka mempunyai varian Base UI serta Radix. Jangan berasumsi semua contoh terbaru memakai Radix, dan jangan mencampur keduanya tanpa kebutuhan |
| Ikon | Lucide React | Play, Pause, Scissors, Upload, Download, Captions, Volume, ZoomIn, Sparkles |
| Emoji picker | Emoji Mart + data lokal | Memilih emoji untuk teks reaksi; dimuat ketika picker dibuka |
| Emoji hasil render | Twemoji, aset SVG lokal | Bentuk emoji konsisten antara browser dan MP4; glyph native OS tidak menjadi sumber kebenaran |
| Font UI/caption | Barlow melalui Fontsource | UI400/500/600; subtitle700/800 |
| Font reaksi | Barlow Condensed melalui Fontsource | Judul atau reaksi singkat weight800, bukan semua label kecil |
| Font timestamp | IBM Plex Mono melalui Fontsource | Timestamp/source frame/output frame |
| Motion antarmuka | Motion for React | Panel, dialog, status saran, perubahan layout; reduced motion |
| Motion video | Remotion useCurrentFrame/interpolate/spring | Zoom, shake, subtitle pop, bounce emoji, reaction, freeze/replay |
| Animasi aset opsional | Animated Noto Emoji + @remotion/lottie | Pilih beberapa emoji animasi saja untuk preset meme; tidak menjadi dependensi wajib |

## 1. UI toolkit

### shadcn/ui — rekomendasi utama

Sumber: [Introduction](https://ui.shadcn.com/docs), [Vite installation](https://ui.shadcn.com/docs/installation/vite).

Dokumentasi menjelaskan bahwa shadcn mendistribusikan source komponen yang dapat diedit, bukan sekadar sebuah library komponen npm tertutup. Cocok untuk layout editor khusus: style charcoal/lime, panel sempit, slider waktu, dialog export, dan toolbar.

Trade-off: source komponen menjadi tanggung jawab proyek; pembaruan upstream tidak otomatis memutakhirkan seluruh file yang disalin. Impor hanya komponen yang diperlukan. Timeline tetap dibuat dari compiler edit kita, bukan diasumsikan disediakan shadcn. Library UI tidak menyediakan pipeline FFmpeg/Remotion.

Kandidat komponen: Button, Tabs, Dialog, Alert Dialog, Slider, Switch, Select, Popover, Tooltip, Progress, Scroll Area, Resizable, Input, Textarea, Badge. Grid utama tetap CSS Grid. Panel Resizable hanya ditambahkan jika batas min/max panel dan perilaku mobile sudah jelas.

### Mantine — alternatif

Sumber: [Mantine](https://mantine.dev/).

Halaman resmi menyediakan komponen seperti NumberInput, ColorInput, FileInput, Select serta hooks useMove/useResizeObserver, dan panduan Vite. Cocok jika prioritasnya mempercepat pengembangan form pengaturan subtitle dan media.

Trade-off: menggunakan paket dan sistem tema Mantine; styling editor harus menyesuaikan API/library. Untuk proyek ini pilih Mantine atau shadcn sebagai sistem utama, bukan memasang keduanya sebagai kumpulan kontrol paralel. Saya merekomendasikan shadcn karena mockup sudah mempunyai layout dan token khusus.

### Lucide — ikon, bukan emoji

Sumber: [Lucide for React](https://lucide.dev/guide/react/).

Ikon inline SVG, komponen dapat diimpor per ikon, ukuran/warna/stroke dapat diatur. Ikon mengikuti warna kontrol. Tombol ikon tetap memerlukan label aksesibel; ikon Play bukan pengganti label tombol. Tidak memakai gambar emoji sebagai ikon teknis toolbar.

## 2. Emoji

### Emoji Mart — picker

Sumber: [repository dan dokumentasi](https://github.com/missive/emoji-mart).

Paket yang didokumentasikan: `emoji-mart`, `@emoji-mart/data`, `@emoji-mart/react`. Data dapat dibundel agar tersedia offline, atau disajikan dari origin lokal. Lazy-load picker dan data ketika Popover dibuka agar initial editor tidak memuat seluruh katalog. Kode repository berlisensi MIT.

README yang dibuka menyebut data Unicode/Emoji14. Katalog picker tidak otomatis selengkap aset Twemoji17; periksa versi paket saat implementasi dan filter berdasarkan manifest aset yang tersedia. Jika membutuhkan emoji baru, curated favorites lokal dapat ditambahkan. Jangan menjanjikan i18n Bahasa Indonesia bawaan; siapkan label/search mapping custom jika diperlukan.

### Twemoji — aset statis yang direkomendasikan

Sumber: [maintained Twemoji repository](https://github.com/jdecked/twemoji).

Dokumentasi menyediakan PNG dan SVG serta package `@twemoji/api`; code MIT, graphics CC BY4.0. Sertakan kredit/lisensi sesuai pemakaian, termasuk keterangan pada video/post ketika diperlukan. Bukan seluruh project yang otomatis berlisensi CC BY karena menggunakan library kodenya.

Simpan aset pilihan sebagai SVG trusted bawaan yang diperiksa, bukan membolehkan arbitrary user SVG upload. Map Unicode grapheme sequence ke asset manifest yang diizinkan. Bangun React text spans dan Remotion Img untuk emoji, hindari string parsing menjadi innerHTML. README sendiri memperingatkan string parsing tidak melakukan sanitasi.

Gunakan source aset lokal yang sama pada preview dan renderer. Unicode skin tone/ZWJ/variation selector perlu diparse sebagai satu emoji; uji keluarga, skin tone, flags, dan wajah menangis. Jika asset tidak tersedia, gunakan fallback yang terlihat di preview dan jelaskan sebelum render. Jangan membuat CDN menjadi dependensi export.

### Animated Noto Emoji — pilihan untuk meme ramai

Sumber: [hub resmi](https://googlefonts.github.io/noto-emoji-animation/), tab Documentation.

FAQ yang dibuka menyatakan aset animasi berlisensi CC BY4.0, tersedia JSON, AVIF, WebP, GIF. Tidak semua emoji sudah mempunyai animasi dan tidak ada unduh seluruh set melalui halaman tersebut. Lottie JSON cocok untuk komponen Remotion yang mengikuti frame. Simpan beberapa aset terpilih saja, kreditnya, versi, dan hash.

Gunakan sebagai stiker reaksi besar terpisah, bukan mengganti setiap emoji subtitle dengan animasi. Gaya Noto berbeda dari Twemoji; untuk konsistensi maksimal, mulai dengan Twemoji statis yang dianimasikan scale/rotate menggunakan Remotion. Noto animasi adalah opsi tambahan.

### OpenMoji — alternatif visual

Sumber: [OpenMoji](https://openmoji.org/).

Halaman resmi menunjukkan gaya colored/outlined dan lisensi CC BY-SA4.0. Cocok untuk estetika ilustratif dengan outline, tetapi bukan pilihan utama untuk rupa emoji yang familiar pada gaming clips. Periksa ketentuan share-alike untuk adaptasi aset; jangan menyamakan lisensinya dengan MIT atau CC BY tanpa SA.

## 3. Font

| Font dan sumber | Lokasi | Weights awal |
|---|---|---|
| [Barlow](https://fontsource.org/fonts/barlow) | Label, body, controls, subtitle |400,500,600,700,800 |
| [Barlow Condensed](https://fontsource.org/fonts/barlow-condensed) | Hook/reaksi singkat |800 |
| [IBM Plex Mono](https://fontsource.org/fonts/ibm-plex-mono) | Timeline dan timestamp |400,500 |

Ketiga halaman Fontsource yang dibuka menampilkan lisensi OFL1.1. [Panduan instalasi Fontsource](https://fontsource.org/docs/getting-started/install) mendukung paket npm serta file yang di-host sendiri. Instal hanya weight/style yang dipakai; simpan license notices.

Contoh paket untuk tahap implementasi, bukan perintah yang sudah dijalankan:

```text
@fontsource/barlow
@fontsource/barlow-condensed
@fontsource/ibm-plex-mono
```

Font web boleh diimpor dari CSS Fontsource; video juga harus memuat file font yang sama dari aset lokal, menunggu font siap sebelum render. Jangan mengandalkan Segoe UI/Consolas yang tersedia hanya pada sebagian OS untuk layout output. Subset Latin cukup untuk teks Indonesia biasa, namun kata non-Latin memerlukan fallback yang ditinjau. Emoji tetap melalui aset, bukan menganggap font Barlow mempunyai glyph emoji berwarna.

Ukuran awal kanvas1080×1920: subtitle52–64px weight800, hook44–56px, reaksi64–88px. Uji panjang kalimat dan outline pada footage asli; angka ini default desain, bukan hasil tes keterbacaan.

## 4. Animasi UI dan video

### Motion for React — antarmuka

Sumber: [Motion React docs](https://motion.dev/docs/react).

Gunakan paket `motion` dengan import `motion/react` untuk enter/exit panel, layout transitions, dan feedback apply suggestion. Core library dan paket contoh premium Motion+ berbeda; fitur UI di sini tidak membutuhkan pembelian contoh premium.

| Interaksi | Default desain |
|---|---|
| Dialog render | Opacity0→1 + y8→0,180ms |
| Panel/tab | Opacity dan y4px,120–160ms |
| Saran diterapkan | Checkmark + background highlight160ms |
| Hover preset | Border/color120ms; tidak menggeser layout |
| Progress | Nilai aktual backend; tidak membuat persentase palsu |

Reduced motion mematikan perpindahan besar/bounce. Kontrol timeline, source video, dan job polling tidak menunggu animasi selesai. CSS transitions native cukup untuk hover; tidak semua elemen perlu Motion.

### Remotion — animasi hasil MP4

Sumber: [Animating properties](https://www.remotion.dev/docs/animating-properties).

Dokumentasi menegaskan semua animasi video memakai useCurrentFrame; animasi yang tidak mengikuti frame, seperti CSS transitions, dapat menyebabkan flicker. Karena itu Motion for React hanya berada di shell editor, bukan di FunnyMoment composition.

| Efek | Teknik |
|---|---|
| Zoom ringan | interpolate transform scale, di sekitar titik lucu |
| Meme pop / emoji bounce | spring dari frame onset, clamp/settle terkontrol |
| Shake | Fungsi sinus deterministik, amplitude dibatasi |
| Freeze/replay | Compiler timeline + Freeze/Sequence; bukan sekadar animasi CSS |
| Subtitle masuk | Scale kecil atau opacity frame-based; batasi agar tidak mengganggu dialog |

### Lottie — aset animasi opsional

Sumber: [Remotion Lottie](https://www.remotion.dev/docs/lottie/lottie).

Gunakan `@remotion/lottie` dengan JSON lokal untuk emoji/stiker animasi terpilih. Versi paket harus cocok dengan seluruh paket Remotion lain. Uji frame awal, tengah, akhir serta looping; Lottie memerlukan evaluasi aset per file dan dapat menambah biaya render. Jangan menggunakan GIF/native autoplay sebagai satu-satunya sumber timing deterministik.

## 5. Batas implementasi dan cek sebelum adopsi

- Toolkit sudah dimasukkan ke implementation plan. Mockup HTML tetap prototipe mandiri; belum berubah menjadi aplikasi Next produksi.
- Pilih satu primitive base shadcn dan komponen minimum, kemudian periksa kompatibilitas React/TypeScript/Remotion yang benar-benar terpasang.
- Uji dialog fokus, keyboard Slider, resizable panels, reduced motion, dan nested Popover emoji.
- Uji emoji grafis/fallback, skin tone/ZWJ, font readiness, dan render offline tanpa CDN.
- Jangan menambah GSAP, beberapa UI frameworks, dan Lottie sekaligus jika Motion + Remotion sudah memenuhi kebutuhan.
- Pertahankan notice dan attribution assets/library. Tidak mengunduh font/emoji atau memasang paket pada tahap riset ini.

## Kesimpulan rekomendasi

Next.js/React + shadcn/ui/Tailwind + Lucide + Emoji Mart + Twemoji + Barlow/Barlow Condensed/IBM Plex Mono + Motion untuk UI + Remotion untuk MP4. Animated Noto/Lottie opsional setelah efek dasar terbukti berjalan.
