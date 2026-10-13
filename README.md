# LoopCut AI

Verified textile remnant-to-order planning: inventaris kain sisa → verifikasi material → pesanan komponen → greedy/CP-SAT → layout dan laporan yang dapat diperiksa.

Frontend sekarang memakai **HTTP secara default** ke backend `http://127.0.0.1:8100`. Data disimpan di SQLite dan rencana dihitung oleh engine nyata. Mode fixture tersedia sebagai pilihan demo terpisah.

- [Frontend](frontend/README.md): Next.js, konfigurasi HTTP/mock, dan pengujian integrasi.
- [Backend dan optimasi](backend/README.md): setup Python, API, seed, solver, dan benchmark.
- [Use case](docs/alur-penggunaan.md): alur fitur dan realisasinya.
- [Roadmap R1–R2 dan CSV](docs/roadmap-implementation.md): fitur tambahan dan cara menjalankan demo terisolasi.
- Spesifikasi: `LoopCut_AI_PRD_Package/`.

## Menjalankan frontend dan backend

Setelah dependency terpasang mengikuti README masing-masing, jalankan dari root proyek pada terminal pertama:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8100
```

Pada terminal kedua dari root proyek:

```bash
cd frontend
npm run dev
```

Buka `http://localhost:3000`. Swagger: `http://127.0.0.1:8100/docs`. Konfigurasi lokal HTTP sudah disiapkan; jika membuat checkout baru, salin `.env.example` masing-masing ke `.env` backend dan `.env.local` frontend. Jalankan `python -m app.db.init` dalam virtual environment untuk inisialisasi; seed `python -m app.demo.seed` hanya untuk database kosong.

## Demo fixture opsional tanpa backend

```bash
cd frontend
cp .env.demo.example .env.local
npm run dev
```

Pilih Mulai Demo. Hasil mode mock merupakan fixture sintetis, bukan solver yang dijalankan. Untuk kembali ke backend, salin `.env.http.example` ke `.env.local` lalu restart frontend.

## Status verifikasi

- Frontend: 29 tests, type-check, lint, dan build HTTP lulus.
- Backend: 99 tests, termasuk SQLite/CP-SAT, migrasi dan transaksi eksekusi nyata, lulus.
- `npm run test:integration`: 2 alur adapter frontend → FastAPI → SQLite/CP-SAT → renderer lulus, termasuk execution/defect/CSV.
- `backend/benchmarks/full/`: 30 skenario sintetis, semua layout valid, tanpa engine error.
- `backend/benchmarks/roadmap/`: 40 skenario (10 defect), semuanya valid, tanpa engine error.
- Browser E2E belum lulus pada lingkungan ini. Tes roadmap tertahan timeout startup server; discovery 4 kasus desktop/mobile lulus. Test bridge memakai ASGI tanpa TCP dan tidak menggantikan QA browser.

Menjalankan rencana tidak mengurangi atau mereservasi stok dan tidak menjamin penghematan pembelian kain.
