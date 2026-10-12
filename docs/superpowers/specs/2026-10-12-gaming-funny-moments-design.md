# Gaming Funny Moments — rancangan versi pertama

Tanggal: 12 Oktober 2026
Status: arah produk disetujui dalam percakapan; dokumen ini menunggu peninjauan pengguna sebelum implementasi.

## Tujuan dan keputusan

Aplikasi lokal mengubah klip gameplay pilihan pengguna menjadi MP4 vertikal melalui Remotion. Pengguna memilih momen lucu; sistem menerapkan template, membantu membuat subtitle, dan mengusulkan teks reaksi serta efek. Pengguna meninjau edit sebelum render.

Keputusan dari percakapan: mendukung berbagai game, output Shorts/TikTok 9:16, dua preset (Subtitle + zoom ringan dan Meme ramai), serta alur AI membantu dengan template sebagai fondasi. Folder E:\Remotion kosong saat diperiksa, sehingga belum ada implementasi atau pola proyek yang perlu dipertahankan.

Input versi pertama mengikuti pembaruan percakapan: sumber video gameplay 3–5 menit dapat dibuka, lalu pengguna memilih satu rentang awal–akhir dan satu titik lucu untuk setiap hasil. Klip yang sudah dipotong tetap dapat digunakan. Pengelolaan banyak momen sekaligus dari satu rekaman belum termasuk versi pertama.

Implementation plan dan mockup: [plan lengkap](../plans/2026-10-12-gaming-funny-moments-implementation.md), [mockup interaktif](../../mockups/editor.html). Dokumen tersebut merinci keputusan UI dan kontrak teknis; aplikasi produksi belum diimplementasikan.

## Alur pengguna

1. Pilih file gameplay lokal melalui pemilih file. Sistem memeriksa apakah video dapat dibaca dan menampilkan durasi serta preview.
2. Tentukan awal, akhir, dan satu titik lucu di dalam rentang. Tombol mengambil posisi pemutar saat ini agar pengguna tidak perlu mengetik semua waktunya.
3. Pilih preset, tata letak, dan judul singkat opsional. Tata letak awal mempertahankan seluruh gameplay di kanvas vertikal; crop vertikal tersedia dengan posisi fokus yang dapat disesuaikan.
4. Jalankan transkripsi lokal. Hasil berupa segmen subtitle dengan waktu relatif terhadap klip sumber. Pengguna dapat mengubah teks dan waktu atau mengimpor SRT jika transkripsi tidak tersedia.
5. Minta saran AI berdasarkan transkrip, preset, dan titik lucu. AI mengusulkan teks reaksi serta pilihan efek dari daftar yang didukung, bukan kode bebas. Pengguna dapat menerima atau menolak saran dan mengeditnya.
6. Tinjau komposisi yang sama melalui Remotion Player. Rentang, subtitle, dan efek yang ditinjau menjadi input render.
7. Render lokal, tampilkan progres atau kegagalan, lalu berikan tautan file MP4 baru untuk dibuka/diunduh. File sumber tetap utuh.

## Dua preset

### Subtitle + zoom ringan

Subtitle pendek maksimal dua baris, outline hitam, warna aksen pada kata pilihan, dan satu zoom singkat di sekitar titik lucu. Audio gameplay dipertahankan. Freeze frame, replay, shake, dan gambar reaksi tidak diaktifkan secara default.

### Meme ramai

Subtitle lebih ekspresif dengan teks reaksi, zoom dan shake singkat pada titik lucu. Freeze frame atau satu replay dapat dipilih dan ditinjau. Efek suara dan gambar reaksi berasal dari aset lokal pilihan pengguna; aplikasi tidak mengambil media TikTok/Instagram atau mengunduh meme secara otomatis. Tanpa aset tambahan, preset tetap menghasilkan edit melalui teks, zoom, shake, freeze, dan replay.

Kedua preset berbagi satu model edit dan satu komposisi; preset hanya menentukan nilai awal. Pengguna bisa mematikan efek tanpa mengganti alur kerja.

## Tata letak dan output

- Kanvas 1080 × 1920; MP4 H.264 dengan audio AAC; 30 FPS pada versi pertama.
- Mode gameplay utuh: seluruh frame terlihat dengan latar salinan gameplay yang diburamkan dan ruang subtitle. Ini pilihan awal untuk mengurangi risiko aksi terpotong.
- Mode crop: video memenuhi area vertikal; pengguna menentukan posisi fokus. Tidak mengklaim pelacakan objek otomatis.
- Subtitle dan teks reaksi dijauhkan dari tepi bawah serta sisi kanan yang biasanya tertutup kontrol platform. Posisi dapat disesuaikan di preview.
- Facecam terpisah, deteksi kill, deteksi humor, posting otomatis, dan penyuntingan melalui prompt bebas berada di luar versi pertama.

## Pembagian peran dan arsitektur

Frontend React/TypeScript menyediakan pemutar sumber, kontrol rentang, pilihan preset, editor subtitle, tinjauan saran, dan Remotion Player. Backend Node lokal mengelola file, metadata, proses transkripsi, saran AI, dan pekerjaan render. Backend hanya mendengarkan loopback.

Model edit menyimpan identitas aset, rentang sumber, titik lucu, preset, tata letak, subtitle, dan efek yang telah diterima. Fungsi timeline menerjemahkan waktu sumber menjadi frame output, termasuk tambahan freeze/replay. Komposisi Remotion menggunakan timeline tersebut untuk preview dan render agar keduanya tidak mempunyai aturan timing terpisah.

Transkripsi direncanakan memakai faster-whisper lokal melalui Python. Saran teks/efek direncanakan memakai Ollama lokal dengan model yang dipilih pengguna dari model yang sudah terpasang. Tidak ada panggilan layanan AI cloud dalam versi pertama. Instalasi runtime dan pengunduhan model dijelaskan saat implementasi setelah kemampuan perangkat diperiksa; aplikasi tidak memulai unduhan model diam-diam.

Remotion menjalankan efek dan render; AI menghasilkan usulan data edit. Transkrip dan penanda waktu menjadi sumber saran, sehingga AI tidak mengklaim telah memahami gambar gameplay jika tidak menerima gambar.

## Perilaku saat AI tidak tersedia

Backend memeriksa ketersediaan runtime transkripsi dan Ollama. Jika belum siap, UI menjelaskan komponen yang belum tersedia dan menyediakan input subtitle manual atau impor SRT. Template dan render tetap dapat digunakan. Saran template berbasis titik lucu diberi label sebagai template, bukan keluaran AI. Kegagalan AI tidak menghapus edit yang sudah dibuat pengguna.

## Invarian dan batas kepercayaan

- Semua waktu harus finite dan memenuhi 0 <= awal < akhir <= durasi sumber; titik lucu harus berada dalam rentang tersebut.
- Subtitle dan efek harus memiliki waktu valid. Segmen yang melampaui rentang dipotong atau dilaporkan sebelum render, bukan diterima diam-diam dengan durasi negatif.
- Freeze/replay menambah durasi output; subtitle dan audio dipetakan mengikuti timeline. Audio pada freeze dijeda, sementara replay mengulang audio dari segmennya.
- Saran AI divalidasi berdasarkan skema yang sama dengan edit manual. Jenis efek, waktu, panjang teks, dan koordinat dibatasi. AI tidak dapat memilih file, menjalankan perintah, atau mengganti lokasi output.
- UI mengirim ID aset yang dikelola backend, bukan path arbitrer. Server memeriksa asal permintaan, ukuran file, tipe media yang benar-benar terbaca, dan batas akses direktori.
- Proses eksternal dijalankan dengan argumen terpisah tanpa interpolasi perintah shell. Tidak menerima URL remote sebagai sumber video versi pertama.
- Render memakai snapshot edit. Perubahan UI sesudah render dimulai tidak mengubah hasil pekerjaan yang sedang berjalan. Versi pertama menjalankan satu pekerjaan render aktif dan menolak duplikasi.
- Output memiliki nama unik dan hanya dinyatakan berhasil setelah render selesai. Kegagalan dilaporkan; output parsial tidak ditawarkan sebagai video selesai.
- File asli tidak ditimpa. Media dan hasil disimpan lokal dalam direktori proyek aplikasi yang diabaikan Git. Penyimpanan lokal tetap mengonsumsi ruang disk dan dijelaskan kepada pengguna.

## Penanganan kesalahan dan aksesibilitas

Kesalahan media, subtitle, dependensi AI, dan render ditampilkan di tahap terkait dengan tindakan pemulihan yang jelas. Status tombol menunjukkan proses aktif dan mencegah klik ganda. Kontrol waktu mempunyai label, bisa digunakan dengan keyboard, dan kesalahan validasi tidak disampaikan melalui warna saja. Preview dapat dijeda; animasi UI mengikuti reduced motion. Efek di video dikendalikan melalui pilihan preset/efek.

## Bukti yang diperlukan sebelum disebut selesai

1. Pemeriksaan tipe dan build berhasil.
2. Tes timeline membuktikan trimming, titik lucu di batas rentang, serta sinkronisasi subtitle/audio ketika freeze dan replay diaktifkan.
3. Tes validasi menolak waktu tidak valid, path di luar aset terkelola, serta saran AI di luar skema.
4. Uji satu klip contoh sintetis dengan audio melalui kedua preset; render MP4 nyata dan periksa dimensi, durasi, serta audio.
5. Periksa UI melalui browser: input file, koreksi subtitle, perubahan preset/layout, preview, progres render, dan pesan dependensi AI yang belum tersedia.
6. Uji transkripsi dan saran AI nyata jika runtime/model tersedia; jika tidak, laporkan bahwa integrasinya belum terverifikasi, tanpa menyebut sistem AI telah berfungsi penuh.

## Urutan pengerjaan setelah peninjauan

Bangun alur template yang menghasilkan MP4 nyata terlebih dahulu, lalu tambahkan transkripsi dan saran AI ke model edit yang sama. Kedua bagian termasuk cakupan versi pertama; setiap keterbatasan perangkat atau dependensi dilaporkan secara eksplisit.

## Referensi visual dari riset browser

- https://www.tiktok.com/@dejet666/video/7519430710416002325 — subtitle ekspresif dan crop gameplay PEAK.
- https://www.tiktok.com/@nakyon_clips/video/7695347731279187220 — hook singkat untuk Devour.
- https://www.tiktok.com/@romandson_/video/7695245785440603399 — teks reaksi pada gameplay horizontal Valorant.
- https://www.instagram.com/reel/DeUD27qSuoF/ — gameplay dengan panel teks dan kredit.

Referensi dipakai untuk arah edit, bukan sebagai aset untuk disalin. Pengamatan audio lengkap dan klaim tentang performa engagement tidak termasuk bukti riset tersebut.
