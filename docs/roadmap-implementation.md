# Implementasi roadmap LoopCut AI

Rilis ini mencakup **R1 eksekusi dan rekonsiliasi manual, R2 defect-aware cutting, serta impor CSV**. Mode awal **SYNTHETIC_DEMO**, dengan database terisolasi. R3 future/residual/purchase dan R4 multi-order belum dibangun.

## Menjalankan

Dependency sama dengan MVP. Dari root proyek, terminal pertama:

```bash
cd backend
.venv/bin/python -m app.db.migrate --database-url sqlite:///./loopcut-roadmap-demo.db --demo --seed
.venv/bin/python -m app.demo.roadmap_server
```

Terminal kedua, mulai dari root proyek:

```bash
cd frontend
NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8101 NEXT_PUBLIC_ENABLE_DEMO_SEED=false npm run dev -- --hostname 127.0.0.1 --port 3001
```

Buka **http://127.0.0.1:3001**. Swagger **http://127.0.0.1:8101/docs**. Launcher demo membuka localhost, mengaktifkan execution/defect/CSV dan memeriksa marker database. Database demo persisten sudah dibuat berisi 7 kain/7 order sintetis. Seed tidak diulang jika database berisi data. `loopcut.db` dan `.env.local` MVP tidak diganti.

Health mengembalikan `capabilities`; frontend hanya menampilkan fitur yang aktif. Flag `ENABLE_EXECUTIONS`, `ENABLE_DEFECTS`, `ENABLE_CSV_IMPORT` default false. `.env.roadmap.example` tersedia sebagai referensi; environment command di atas tidak mengubah konfigurasi MVP.

## Migrasi dan data

Migrasi bernomor melalui CLI, memakai SQLAlchemy dan tabel `schema_version` versi 1. Untuk menambah schema pada database kerja tanpa mengaktifkan demo:

```bash
.venv/bin/python -m app.db.migrate --database-url sqlite:///./loopcut.db
```

Backup `*.db.backup-<timestamp>` dibuat melalui SQLite backup API, termasuk data committed di WAL. Tabel dan JSON snapshot MVP tidak ditulis ulang. Migrasi dapat diulang. Database existing yang berisi inventaris kerja tidak dapat dikonversi menjadi demo dengan `--demo`. Untuk restore, salin backup ke file baru dan arahkan backend ke file tersebut; jangan menimpa database yang sedang dibuka aplikasi.

Tabel baru: `schema_version`, `cut_executions`, `cut_execution_items`, `execution_stock_claims`, `remnant_reconciliations`, `reconciliation_children`, `remnant_defects`, dan `inventory_import_previews`.

## Alur penggunaan

1. **Defect:** buka detail dari kode kain. Tarik rectangle pada SVG atau isi koordinat numerik. Semua ukuran integer mm di dalam kain; maksimal 20 zona, overlap antarzona ditolak, tepi boleh bersinggungan. Simpan mengembalikan Needs Review; periksa dan verifikasi ulang. Ini pemetaan manual.
2. **Plan:** jalankan order seperti MVP. Greedy, CP-SAT dan validator memakai defect yang sama. Hasil menampilkan obstacle merah dari snapshot. Snapshot lama tidak berubah setelah stok/defect diedit. `BLOCKED_BY_DEFECT` berbeda dari belum teralokasi akibat pencarian.
3. **Eksekusi:** pilih Simulasikan eksekusi selected plan → tinjau checklist → setujui → mulai. Simpan completed, failed/deviasi, atau not attempted pada setiap unit. Luas completed dihitung backend dari ukuran snapshot.
4. **Konfirmasi:** seluruh outcome harus tersimpan. Source dengan completed/failed dikarantina atomik; failed tidak menambah confirmed area. Retry tidak menggandakan stok/metrik. Stok berubah atau klaim penggunaan lain menghasilkan konflik.
5. **Rekonsiliasi:** masukkan persegi panjang hasil pengukuran atau konfirmasi tidak ada sisa. Source menjadi Archived; sisa mendapat ID baru dan Needs Review. Sistem tidak mengubah bentuk L menjadi rectangle. Total luas sisa dibatasi luas source dikurangi completed pieces, tetapi kondisi fisiknya tetap memerlukan inspeksi. Detail kain menautkan riwayat sumber/sisa/eksekusi.
6. **Laporan:** `/reports` memisahkan demo dan laporan lapangan. Planned vs confirmed menggunakan sesi CONFIRMED yang sama; draft/cancelled tidak menambah angka. Pending reconciliation dihitung per source. Laporan lapangan tetap nol pada rilis demo.
7. **CSV:** `/remnants/import` menyediakan template, upload/paste, preview error dan hasil ekspansi. Quantity satu mempertahankan kode; quantity lebih besar memakai `-001`, `-002`, dan seterusnya. Maksimal 256 KB request, 1.000 baris dan 1.000 lembar. Seluruh error harus diperbaiki sebelum commit; konflik setelah preview membatalkan seluruh impor. Token 30 menit; retry commit menghasilkan ID yang sama. Semua hasil Needs Review; verifikasi massal maksimal 100 lembar yang telah diperiksa, dengan pengecekan perubahan sejak review.

State machine: `DRAFT → APPROVED → IN_PROGRESS → CONFIRMED`. CONFIRMED tidak dapat diedit. CANCELLED hanya sebelum outcome completed/failed; semua not attempted harus dibatalkan. Semua failed boleh dikonfirmasi dengan area nol. Approval/start/confirm memeriksa kelayakan dan geometri terhadap snapshot; perubahan setelah approval memblokir transisi dan membutuhkan sesi/rencana baru yang ditinjau ulang.

Permanent stock claim dan `BEGIN IMMEDIATE` mencegah penggunaan ulang source. Edit inventaris MVP ikut memeriksa perubahan serentak, sehingga edit catatan yang terlambat tidak bisa memverifikasi kembali defect baru. Source terpakai tidak dapat dipulihkan ke Available atau diubah geometrinya. Feature flag editor tidak membuat solver mengabaikan defect tersimpan. Planning tetap maksimal 30 pieces/15 remnants/8 detik dan tidak mengonsumsi stok.

## API tambahan

Prefix `/api/v1`, JSON dan error envelope MVP; konflik 409 dan input invalid 422.

| Endpoint | Payload/fungsi |
| --- | --- |
| `GET/POST /cut-executions`, `GET /cut-executions/{id}` | Daftar/filter `plan_run_id`; create `{plan_run_id,mode:SYNTHETIC_DEMO}`; detail |
| `POST /cut-executions/{id}/approve`, `/start`, `/confirm`, `/cancel` | Body opsional `{operator_note}` |
| `PATCH /cut-executions/{id}/items/{piece_id}` | `{outcome,note}`; URL-encode `#` pada piece ID |
| `POST /cut-executions/{id}/reconciliations` | `{source_remnant_id,note,leftovers:[{code,width_mm,height_mm,condition_note}]}` |
| `GET /remnants/{id}/history` | Hubungan eksekusi, source dan sisa |
| `GET/PATCH /remnants/{id}/defects` | PATCH `{expected_updated_at,defects:[{x_mm,y_mm,width_mm,height_mm,defect_type,note}]}` mengganti daftar |
| `POST /remnants/import-preview`, `/import-commit` | `{csv_text}` → preview; `{preview_token}` → IDs |
| `POST /remnants/bulk-verify` | `{inspected:true,items:[{id,expected_updated_at}]}` |
| `GET /reports/summary?mode=...` | `SYNTHETIC_DEMO` atau `OPERATOR_REPORTED` |

## Verifikasi

```bash
cd backend
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest -q
.venv/bin/python -m app.demo.benchmark --include-defects --time-limit 8 --output benchmarks/roadmap
```

```bash
cd frontend
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run test:e2e:roadmap -- --list
# Memerlukan port 3001/8101 dan Chromium terpasang:
npm run test:e2e:roadmap
```

**99 tes backend, 29 tes frontend, 2 tes integrasi**. Integrasi memakai adapter HTTP sebenarnya, FastAPI, SQLite dan CP-SAT; transport TCP diganti bridge ASGI, dengan proses backend baru per request.

`backend/benchmarks/roadmap/` berisi 40 seeded scenarios (30 P0 + 10 defect), 40 layout valid, engine errors 0, complete true: 7 WIN, 22 TIE, 0 LOSS, 3 NO_CANDIDATE, 8 SKIPPED. Input, snapshot, seed, versi strategi/engine, runtime, objective dan status tersedia. Data sintetis bukan bukti performa pabrik.

Empat kasus browser desktop/mobile berhasil didiscover. Eksekusi browser belum lulus: startup server pengujian timeout dan pemeriksaan socket lokal menghasilkan `PermissionError: Operation not permitted` di lingkungan implementasi. Drag, fokus keyboard dan responsive masih membutuhkan QA pada lingkungan yang dapat menjalankan browser/server. HTTP/SSR tests tidak menggantikannya.

## Batas rilis

Eksekusi `OPERATOR_REPORTED` ditolak. Penggunaan lapangan masih membutuhkan autentikasi, akses workspace, reservasi produksi, audit/koreksi, dan backup operasional. Confirmed reuse belum membuktikan penghematan pembelian atau CO₂. R3/R4, QR, kerf, CAD dan computer vision belum termasuk rilis ini.
