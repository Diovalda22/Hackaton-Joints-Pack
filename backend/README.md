# LoopCut AI — backend dan optimasi

FastAPI menyediakan inventaris kain, pesanan, perencanaan greedy/CP-SAT, validator geometri independen, dan snapshot immutable. Respons mengikuti `../LoopCut_AI_PRD_Package/prd-backend.md` serta kontrak frontend yang sudah ada. Tidak ada layout fixture pada backend.

## Status verifikasi saat ini

**99 pengujian backend lulus**, termasuk database SQLite nyata dan CP-SAT nyata. Semua dependency runtime sudah tersedia pada lingkungan verifikasi. Suite API/service memakai test double untuk isolasi; suite database terpisah menguji adapter SQLAlchemy, persistence, dan snapshot.

Full benchmark `benchmarks/full/` menjalankan greedy dan CP-SAT pada **30 input sintetis berseed**. Seluruh layout valid, tanpa engine error, dengan `complete=true`. Hasil kandidat menurut objective: 7 unggul, 12 seri, 0 kalah, 3 tanpa kandidat, dan 8 skipped karena tidak ada pasangan yang layak. Status selected: 17 optimal, 2 feasible timeout, 3 fallback, dan 8 no assignable pieces. Hasil ini bukan sampel pabrik atau peningkatan universal.

Integrasi adapter HTTP frontend → FastAPI → SQLAlchemy/SQLite → CP-SAT → renderer frontend diperiksa tanpa port melalui test ASGI bridge. Browser E2E masih belum dijalankan karena lingkungan menolak server Next.js port 3000 (`EPERM`).

Laporan `benchmarks/baseline-only/` tetap disimpan sebagai pengujian greedy saja dan berlabel `complete=false`; jangan mencampurkannya dengan full comparison.

## Instalasi dan menjalankan

Gunakan Python **3.12**. Jalankan dari folder `backend` agar path SQLite konsisten. Dependency langsung dikunci di requirements; pip menyelesaikan dependency transitifnya.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cp .env.example .env
python -m app.db.init
python -m app.demo.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8100
```

Pada Windows, aktivasi virtual environment memakai `.venv\Scripts\activate`. `requirements-dev.txt` sudah mencakup dependency runtime. Jika hanya menjalankan layanan, `requirements.txt` cukup.

- API: `http://localhost:8100/api/v1`
- Swagger: `http://localhost:8100/docs`
- Health: `http://localhost:8100/api/v1/health`

Inisialisasi/startup membuat tabel yang belum ada, tanpa menjatuhkan tabel atau menghapus data. Schema lama yang kehilangan kolom wajib ditolak; tidak ada migrasi destruktif otomatis. Backend memakai SQLite single-operator, bukan layanan multi-perusahaan.

Jika PyPI belum dapat diakses, gunakan wheel beserta semua dependency yang diunduh dari registry resmi pada mesin dengan Python/platform yang sesuai:

```bash
python -m pip install --no-index --find-links /path/to/wheels -r requirements-dev.txt
```

Jangan mengganti package OR-Tools dengan hasil hardcoded. Setelah SQLAlchemy tersedia, backend bisa menyediakan greedy bila optimizer sengaja dinonaktifkan, dengan status/warning yang jelas.

## Konfigurasi

| Variable | Default | Fungsi |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./loopcut.db` | Database lokal; foreign key aktif, WAL, busy timeout. |
| `CORS_ORIGINS` | localhost dan 127.0.0.1 port 3000 | Origin eksplisit; wildcard ditolak. |
| `SOLVER_TIME_LIMIT_SEC` | `8` | Budget solver 1–8 detik. |
| `SOLVER_RANDOM_SEED` | `2026` | Seed default CP-SAT. |
| `ENABLE_OPTIMIZER` | `true` | `false` mengaktifkan tahap baseline-only, bukan optimum terbukti. |
| `DEMO_MODE` | `true` | Mengizinkan CLI seed lokal. |
| `MAX_PAYLOAD_BYTES` | `262144` | Batas body request, termasuk request tanpa Content-Length. |
| `LOG_LEVEL` | `INFO` | Logging request ID, status, dan runtime. |

`.env` dimuat tanpa menimpa environment variable yang sudah diberikan. Field `ENABLE_AI_EXTRACTION=false` pada contoh hanya mendokumentasikan bahwa AI berada di luar scope; tidak ada endpoint ekstraksi.

## API dan aturan data

| Endpoint | Perilaku |
| --- | --- |
| `GET /api/v1/health` | Status, nama service, versi. |
| `GET /api/v1/remnants` | `{items,total}`, filter bahan/warna/verifikasi/status. |
| `POST /api/v1/remnants` | Create, default Needs Review + Available, respons 201. |
| `PATCH /api/v1/remnants/{id}` | Edit/verify/quarantine/archive/restore. |
| `GET /api/v1/orders` | `{items,total}` dengan lines untuk kompatibilitas frontend. |
| `POST /api/v1/orders` | Create order, respons 201. |
| `GET /api/v1/orders/{id}` | Detail order. |
| `POST /api/v1/plan-runs` | Request sinkron, hasil tersimpan, respons 201. |
| `GET /api/v1/plan-runs/{id}` | Respons historis dari snapshot. |

Satu kain adalah satu lembar persegi panjang. Dimensi integer JSON `1–10000` mm; quantity `1–30`; maksimal 30 unit setelah ekspansi. String numerik, boolean, dan float bukan integer input yang valid. Material/warna di-trim, uppercase, maksimal 64 karakter, exact match; kode khusus yang sesuai pola boleh digunakan.

Field teks opsional dikembalikan sebagai string kosong, bukan null, agar tidak mengeluarkan kain dari eligibility frontend. PATCH `null` pada catatan/lot mengosongkan field; field wajib/status tidak boleh null.

Create tidak menerima ID/status dari client. Kain baru Needs Review. Perubahan material, warna, dimensi, atau kondisi mereset verifikasi kecuali PATCH sama menyatakan `verification_status=VERIFIED`. Mengubah sumber informasi saja tidak mereset. Archive/quarantine mengeluarkan kandidat tanpa DELETE; restore tidak otomatis memverifikasi.

`remnant_ids=null`/dihilangkan memakai semua stok eligible hanya jika ≤15. Lebih banyak menghasilkan `422 REMNANT_SELECTION_REQUIRED`. Pilihan eksplisit dibatasi 15 sebelum exclusion, ID duplikat ditolak, ID tidak ditemukan memberi 404, dan stok noneligible dicatat dalam `excluded_remnants`. Pilihan kosong valid.

Error menggunakan `{"error":{"code":"...","message":"...","details":{...}}}`. Kode mengikuti PRD; tambahan `413 PAYLOAD_TOO_LARGE` digunakan untuk batas request. `X-Request-ID` tersedia untuk korelasi log. Diagnostic exception tidak dikirim ke client.

## Perhitungan

1. Ambil salinan order/pool dan expand quantity menjadi ID unit stabil.
2. Qualification Verified + Available, exact material/color, serta ukuran/orientasi.
3. Greedy first-fit decreasing: area piece terbesar dahulu; remnant terkecil dahulu; tie-break ID; orientasi 0° dahulu; posisi dari tepi placement dalam urutan y lalu x.
4. Validasi baseline dengan validator terpisah.
5. CP-SAT memakai assignment optional, interval X/Y dengan presence yang sama, `NoOverlap2D`, dan maksimal satu alokasi per unit.
6. Objective integer: `area*(N+1)*(M+1) + count*(M+1) - used_remnants`.
7. Validasi kandidat, pilih hasil yang sah, hitung metrik, lalu simpan dalam transaksi singkat. Transaksi database tidak dipegang selama pencarian solver.

CP-SAT memakai satu worker, budget 1–8 detik dan seed tersimpan. Random seed tidak menjamin runtime/status/koordinat identik pada mesin atau versi library berbeda; input dan versi strategi dicatat untuk reproduksi.

| Kondisi | Selected dan status |
| --- | --- |
| Kandidat optimal valid ≥ baseline menurut objective | Optimizer / OPTIMAL. |
| Kandidat feasible valid > baseline | Optimizer / FEASIBLE_TIMEOUT. |
| Feasible seri/lebih buruk, unknown, error, atau kandidat invalid | Greedy / BASELINE_FALLBACK. |
| Tidak ada pasangan eligible yang muat | Empty result / NO_ASSIGNABLE_PIECES / raw SKIPPED. |
| Baseline gagal validasi | Internal error, tanpa menyimpan plan invalid. |

Optimal seri boleh dipilih; feasible seri memakai baseline. Perbaikan jumlah lembar dapat dipilih meskipun gain luas nol. Jika OR-Tools tidak tersedia, backend tidak mengarang status optimal; hasil greedy memiliki warning dependency dan raw ERROR.

Validator memeriksa ID, qualification, matching, ukuran orientasi, bilangan integer, containment, positive-area overlap, dan pembagian lengkap placed/unallocated. Tepi bersinggungan valid. Frontend memakai `placed_width_mm`/`placed_height_mm` yang sudah terorientasi, tanpa rotasi ulang.

Metrik dihitung dari luas asli unit yang ditempatkan. `reuse_area_m2` adalah luas komponen, `area_coverage_pct` adalah cakupan pesanan, dan gain adalah perbedaan selected vs greedy. Tidak ada klaim penghematan pembelian atau CO₂. Run tidak mengubah stok, melakukan reservasi, atau memesan kain.

## Seed dan reset

`python -m app.demo.seed` memasukkan 7 stok dan 7 pesanan sintetis hanya pada workspace kosong. Tidak ada plan atau solver_status hardcoded. Nama skenario menggambarkan input, bukan menjanjikan timeout atau improvement.

Untuk mengganti workspace yang berisi data:

```bash
python -m app.demo.seed --reset
```

CLI meminta ketikan `RESET` dan membuat backup SQLite termasuk transaksi WAL sebelum penggantian. Reset tidak tersedia melalui endpoint HTTP. Jangan menjalankannya pada database berisi data yang ingin dipertahankan.

## Pengujian dan benchmark

```bash
python -m pytest -q
python -m app.demo.benchmark --time-limit 8 --output benchmarks/full
# Gate wajib: dependency hilang menghasilkan gagal, bukan suite skipped yang dianggap selesai.
python -m app.demo.verify
```

Suite mencakup strict validation, qualification, greedy deterministik, rotation, containment/non-overlap, unique assignment, pemilihan/fallback, error API, CORS/payload, snapshot, dan persistence SQLite. Status timeout/error diuji melalui injeksi hasil solver terkontrol; tes optimizer nyata tetap menjalankan CP-SAT.

Test client menggunakan HTTPX ASGI tanpa port. Repository in-memory hanya untuk isolasi service/API. Suite `test_database.py` memakai database SQLite nyata, sedangkan `test_cp_sat.py` menjalankan engine nyata; keduanya tidak diganti mock ketika dependency hilang.

Untuk lingkungan dengan plugin pytest global yang mengganggu:

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest -q
```

Benchmark menghasilkan `scenarios.json`, `runs.json`, `results.csv`, dan `summary.json`: 30 kasus berseed, enam kelompok, lima varian per kelompok. Input greedy/optimizer sama. Status optimal, feasible, fallback, raw status, candidate objective, dan selected objective dipisahkan. Pengurangan jumlah lembar dihitung dalam objective, bukan dibuat sebagai gain area palsu.

`optimizer_vs_baseline` mengukur kandidat optimizer; selected selalu memilih hasil valid yang tidak lebih buruk. Tidak adanya kandidat berbeda dari loss. `complete=true` hanya untuk full benchmark tanpa engine error. Jika engine ERROR/MODEL_INVALID/INFEASIBLE, laporan disimpan tetapi command gagal agar masalah tidak tersembunyi.

Untuk menguji hanya greedy secara eksplisit:

```bash
python -m app.demo.benchmark --baseline-only --output benchmarks/baseline-only
```

Laporan tersebut tidak membuktikan performa optimizer. Benchmark tidak memakai target persentase peningkatan yang ditetapkan sebelumnya.

## Menghubungkan frontend

Pada terminal lain:

```bash
cd frontend
cp .env.http.example .env.local
npm run dev
```

Restart/rebuild frontend setelah perubahan environment. Label API menunjukkan connected/error; tombol seed/reset browser tidak tampil pada mode HTTP. Inventaris, pesanan bebas, dan hasil menggunakan endpoint nyata. Data localStorage mock tidak dimigrasikan ke backend.

Untuk pengujian browser HTTP:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e:http
```

Pengujian membuat database sementara melalui `app.demo.e2e_server`, menyalakan backend dan frontend, lalu memeriksa order bebas, perhitungan nyata, snapshot, dan mismatch di desktop/mobile. Memerlukan semua dependency dan port 3000/8100 tersedia. Mode HTTP tests menolak memakai server lain yang kebetulan sudah berjalan agar tidak menguji data atau mode yang salah.

## Referensi

- PRD backend dan optimasi di `../LoopCut_AI_PRD_Package/`.
- [OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver).
- [Python CP model API](https://or-tools.github.io/docs/pdoc/ortools/sat/python/cp_model.html).
- [SQLAlchemy 2.0](https://docs.sqlalchemy.org/en/20/).

R1 demo execution/reconciliation, R2 defect mapping dan impor CSV sudah tersedia pada database demo terisolasi. Panduan: [Implementasi roadmap](../docs/roadmap-implementation.md). Belum dibangun: ekspor inventaris, AI/Jev, auth/multiworkspace, CAD/kerf, reservasi produksi, purchase/future-aware/multi-order, dan deployment publik.

## Roadmap R1–R2 dan CSV

Lihat [panduan lengkap](../docs/roadmap-implementation.md) untuk migrasi bernomor, demo API 8101, state machine, API execution/defect/import, dan benchmark 40 skenario. `health.capabilities` menjadi sumber feature flag frontend.
