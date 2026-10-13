# LoopCut AI — frontend

Studio perencanaan pemanfaatan kain sisa untuk satu operator. Implementasi P0 menggunakan Next.js App Router, TypeScript, Tailwind, komponen shadcn berbasis Base UI, TanStack Query, React Hook Form, Zod, dan SVG React.

## Menjalankan

Node.js **24+** dan npm diperlukan. Dependency terkunci di `package-lock.json`.

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Buka `http://localhost:3000`. Mode default sekarang adalah **`http`**, terhubung ke backend di `http://127.0.0.1:8100`. Jalankan backend dahulu mengikuti `../backend/README.md`. Inventaris, pesanan, dan plan disimpan di SQLite; input bebas dihitung oleh greedy dan CP-SAT.

Untuk demo fixture tanpa backend, salin `.env.demo.example` ke `.env.local` dan restart frontend. Mode `mock` menggunakan localStorage/sessionStorage dan tidak menjalankan solver.

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

## Demo fixture opsional

1. Pada dashboard, klik **Mulai demo**.
2. Pilih skenario. Klik **Ganti data & buka skenario** untuk mengonfirmasi penggantian seluruh data lokal.
3. Klik **Jalankan rencana** pada ringkasan pesanan.
4. Periksa metrik, toggle **Greedy baseline / Selected plan**, SVG, koordinat, dan komponen yang belum teralokasi.

Tersedia tujuh skenario sintetis: normal/seri, rotasi 90°, material mismatch, dimensi tidak muat, partial fulfillment, feasible timeout, dan baseline fallback. Fixture normal menunjukkan luas reuse sama dengan penggunaan lembar lebih sedikit pada selected; tidak ada peningkatan luas yang dikarang.

Inventaris dan pesanan pengguna dapat dibuat bebas. Hasil demo hanya tersedia ketika spesifikasi pesanan dan pool cocok dengan salah satu fixture. Nama dan identitas record boleh berbeda; dimensi, bahan, warna, quantity, rotasi, dan pool harus cocok. Mengubah input yang memengaruhi geometri membuat run demo tidak tersedia. **Tidak ada solver atau baseline produksi yang dijalankan di browser.** Semua status, runtime, koordinat, dan metrik demo diberi label sintetis.

## Halaman

| Route | Fungsi |
| --- | --- |
| `/` | Dashboard, KPI inventaris, muat demo |
| `/remnants` | Tambah/edit/verifikasi, quarantine/archive, filter |
| `/orders` | Daftar pesanan |
| `/orders/new` | Editor komponen dan pemilihan pool |
| `/orders/[id]` | Ringkasan dan menjalankan plan |
| `/plans/[id]` | Snapshot, baseline/selected, metrik, SVG/tabel, alasan pengecualian |

Metode dan batasan tersedia melalui dialog sidebar/footer. Tautan hasil terakhir disimpan per pesanan dalam sessionStorage; laporan eksekusi tersedia ketika kapabilitas roadmap backend aktif.

## Integrasi backend

Backend tersedia di `../backend/`. Database dan CP-SAT nyata sudah lulus pengujian. `.env.example` dan `.env.local` sekarang menggunakan HTTP, sedangkan `.env.demo.example` menyediakan mode mock opsional.

Salin `.env.http.example` ke `.env.local`, lalu restart atau rebuild Next.js:

```dotenv
NEXT_PUBLIC_API_MODE=http
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8100
NEXT_PUBLIC_ENABLE_DEMO_SEED=false
```

`src/lib/api.ts` menyediakan kontrak layanan yang sama untuk adapter lokal dan HTTP. Endpoint mengikuti `prd-backend.md`: health, remnants GET/POST/PATCH, orders GET/POST/detail, plan-runs POST/detail. Request memakai JSON, prefix `/api/v1`, error `error.code/message/details`, serta timeout 15 detik. Request plan tidak diulang otomatis. Server backend harus mengizinkan origin frontend melalui CORS.

Tipe payload menggunakan `name`, mm integer, `placed_width_mm/placed_height_mm` yang sudah terorientasi, serta snapshot immutable. Metrik hasil ditampilkan dari respons; frontend hanya memformat unit. Backend tetap menjadi sumber kelayakan, solusi, validasi geometri, dan status solver. Tidak ada fitur edit order; revisi dibuat sebagai pesanan baru.

## Penyimpanan dan aturan

- Key localStorage: `loopcut.workspace.v1`. Memuat versi schema, inventaris, pesanan, dan hasil fixture.
- Data bertahan setelah refresh. Data rusak tidak ditimpa otomatis; reset harus dikonfirmasi operator.
- Kain baru: `NEEDS_REVIEW` + `AVAILABLE`. Perubahan material/warna/dimensi/kondisi mereset verifikasi, kecuali ada konfirmasi ulang eksplisit.
- Pool hanya `VERIFIED` + `AVAILABLE`. Lebih dari 15 lembar memerlukan pilihan eksplisit, tanpa pemotongan daftar otomatis.
- Dimensi `1–10000` mm, quantity `1–30`, total maksimal 30 unit. Material/warna uppercase dan exact match.
- Historical plan menggunakan snapshot. Pembaruan inventaris memberi peringatan tanpa menulis ulang layout.
- Ukuran adalah ukuran potong termasuk allowance. Defect manual, CSV intake dan pelacakan eksekusi tersedia pada demo roadmap terisolasi; kerf, CAD, AI, auth dan ekspor inventaris belum tersedia.
- Luas reuse adalah luas komponen teralokasi, bukan jaminan pembelian kain baru atau pengurangan CO₂.

## Pengujian

`npm test` menjalankan **29 pengujian** menggunakan test runner native Node.js. TypeScript ditranspilasi ke direktori sementara yang dibersihkan setelah selesai. Pemeriksaan mencakup validasi input, qualification, fixture/geometri/rotasi, unique placement, metrik, penyimpanan, immutable snapshot, error HTTP, dan render SVG/status/aksesibilitas. Test runner native digunakan karena paket Vitest/Testing Library tidak tersedia offline pada lingkungan implementasi.

Playwright menyediakan delapan pengujian alur pada dua viewport (16 kasus: desktop 1280px dan mobile 390px):

```bash
npx playwright install chromium
npm run test:e2e
# Memeriksa discovery tanpa membuka browser/server:
npm run test:e2e -- --list
```

Pengujian mencakup demo, toggle, refresh, rotasi, timeout/mismatch, CRUD/reset verifikasi, batas quantity, snapshot setelah perubahan stok, fokus dialog, dan data lokal rusak. Playwright memulai server sendiri. Gunakan workspace browser baru; seeding mengganti data lokal.

**Hasil verifikasi lingkungan implementasi:** type-check, lint, 29 pengujian otomatis, dan build produksi lulus. Pengujian browser belum dijalankan karena lingkungan menolak pembukaan port lokal (`listen EPERM`). Discovery seluruh 16 kasus Playwright berhasil; responsive dan fokus keyboard masih perlu verifikasi browser saat port tersedia.

## Sumber spesifikasi

- `../LoopCut_AI_PRD_Package/prd.md`
- `../LoopCut_AI_PRD_Package/prd-frontend.md`
- `../LoopCut_AI_PRD_Package/prd-backend.md`
- `../LoopCut_AI_PRD_Package/prd-optimization.md`

Data demo bukan data pabrik atau hasil benchmark. Tidak ada klaim performa optimizer yang diukur pada tahap frontend ini.

## Pengujian integrasi HTTP

```bash
# Backend .venv dan requirements-dev.txt harus sudah siap.
npm run test:e2e:http
# Discovery tanpa membuka port:
npm run test:e2e:http -- --list
```

Empat kasus browser (dua alur pada desktop/mobile) memakai database sementara dan engine nyata. Ini terpisah dari 16 kasus mode fixture. Port 3000/8100 harus tersedia dan server manual dihentikan sebelum tes; pengujian HTTP tidak memakai ulang server yang sudah berjalan. Pengujian browser HTTP belum dijalankan karena server Next.js port 3000 ditolak lingkungan (`EPERM`). Dependency backend sudah tersedia.

## Pengujian lintas frontend–backend tanpa port

```bash
npm run test:integration
```

Test ini memakai adapter HTTP yang sama dengan halaman, API FastAPI, repository SQLite, dan CP-SAT nyata pada database sementara. Hanya transport TCP diganti test bridge ASGI karena pembukaan port dibatasi; data, API, dan solver tidak di-mock. Alur mencakup create/verify kain, pesanan bebas, hasil optimal, kompatibilitas schema, render SVG, rotasi, error, dan snapshot setelah edit/restart. Ini melengkapi, bukan menggantikan, pengujian browser.

## Roadmap demo

[Setup dan alur R1–R2/CSV](../docs/roadmap-implementation.md) menggunakan API 8101/frontend 3001 dengan database terpisah. Halaman tambahan: `/remnants/[id]`, `/remnants/import`, `/executions/[id]`, `/reports`. UI membaca `health.capabilities`; mode fixture tidak menjalankan alur roadmap. `npm run test:integration` menguji dua alur nyata, termasuk roadmap. `npm run test:e2e:roadmap` menyediakan empat kasus browser; eksekusinya masih tertahan timeout startup server di lingkungan implementasi.
