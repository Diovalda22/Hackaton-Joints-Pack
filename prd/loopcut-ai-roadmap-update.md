
# LoopCut AI — Roadmap Pengembangan Setelah MVP

**Dokumen:** `loopcut-ai-roadmap-update.md`  
**Versi:** 1.0 (rancangan pengembangan; belum diimplementasikan)  
**Tanggal:** 13 Oktober 2026  
**Produk:** LoopCut AI — Verified Textile Remnant-to-Order Optimizer  
**Acuan utama:** `prd.md`, `prd-frontend.md`, `prd-backend.md`, `prd-optimization.md`  
**Kompetisi:** JOINTS Hackathon 2026 — Sustainability

> **Status dokumen:** Semua fitur di bawah adalah **usulan update setelah MVP**, bukan klaim fitur yang sudah tersedia. Kontrak P0 dari keempat PRD tetap menjadi sumber kebenaran sampai suatu perubahan disetujui dan diuji. Prioritas, rancangan API, database, jadwal, serta target berikut adalah keputusan desain yang **diusulkan**, bukan persyaratan yang tertulis pada PRD saat ini.

---

## 1. Ringkasan keputusan

Setelah MVP selesai, LoopCut AI sebaiknya berkembang dari **alat simulasi cutting plan** menjadi **sistem perencanaan dan pelacakan penggunaan kembali kain sisa**.

**Masalah utama MVP yang belum tertutup:**

1. Hasil optimizer adalah rencana, bukan bukti pemotongan dan reuse yang benar-benar terjadi.
2. Remnant diasumsikan persegi panjang utuh; cacat fisik dan area terlarang belum dimodelkan.
3. Objective CP-SAT sekarang memaksimalkan luas komponen order yang dialokasikan, bukan nilai sisa bahan untuk produksi masa depan.
4. MVP belum menentukan berapa kain baru yang *benar-benar* tidak perlu dibeli.
5. Masukan inventaris satu lembar per record menghambat adopsi jika stok sangat banyak; impor CSV baru P1 pada PRD awal.
6. Setiap run hanya mengoptimalkan satu order.

**Dua diferensiasi yang paling penting:**

- **Closed-Loop Production Tracking:** perencanaan → persetujuan → eksekusi → rekonsiliasi → laporan pemakaian nyata berbasis konfirmasi operator.
- **Defect-Aware Cutting Optimization:** cutting plan memperhitungkan area cacat sehingga lebih mungkin diterapkan pada stok dunia nyata.

**Aturan prioritas:** jangan mengorbankan demo P0 yang valid untuk mengejar banyak fitur tambahan. Menjelang deadline **16 Oktober 2026, 23.59 WIB**, selesaikan, tes, dan kirimkan P0 terlebih dahulu. Jika P0 stabil, *proof of concept* tracking boleh dipertimbangkan tanpa mengubah klaim dampak. Perluasan yang lebih besar adalah kandidat sebelum Grand Final jika lolos atau setelah kompetisi.

---

## 2. Prinsip produk dan batas klaim

- **Server authoritative:** backend tetap menjadi sumber kebenaran untuk kelayakan kain, koordinat, status solver, serta hasil perhitungan.
- **Immutable plan:** `plan_runs` yang sudah disimpan tidak boleh berubah setelah stok/order diedit; eksekusi fisik disimpan sebagai entitas baru.
- **Tidak ada klaim palsu:** `reuse_area_m2` adalah luas komponen teralokasi dalam rencana. `confirmed_reuse_area_m2` adalah luas komponen yang *dikonfirmasi operator* selesai dipotong/digunakan, **bukan** pengukuran independen atau bukti langsung penghematan pembelian kain baru.
- **Persetujuan manusia:** input bahan, cacat, dan eksekusi harus diverifikasi operator; foto/LLM hanya memberikan usulan jika nanti ditambahkan.
- **Fail safely:** ketidakcocokan material, rotasi yang tidak sah, tumpang tindih, zona cacat, atau data tidak lengkap tidak boleh menghasilkan rencana sah.
- **Reproducible:** seed, input snapshot, versi algoritma, runtime, konfigurasi, dan hasil validasi disimpan.
- **Backward compatibility:** jangan merusak endpoint P0 `/api/v1/remnants`, `/orders`, `/plan-runs`; perluasan API harus eksplisit dan terdokumentasi.
- **Demo vs real:** data sintetis, konfirmasi simulasi, dan data eksekusi riil wajib dilabeli berbeda.

---

## 3. Prioritas pengembangan

| Prioritas | Fitur | Alasan | Kesulitan estimasi | Rilis usulan |
|---|---|---|---|---|
| **1** | Closed-Loop Production Tracking | Menutup celah antara rekomendasi dan pemakaian aktual | Sedang | **R1** |
| **2** | Defect-Aware Cutting (manual) | Meningkatkan validitas rencana untuk kain cacat | Sedang–tinggi | **R2** |
| **3** | Future-Aware Remnant Optimization | Menilai kegunaan sisa setelah pemotongan | Tinggi | **R3** |
| **4** | Purchase-Aware Planning | Menghubungkan rekomendasi dengan kebutuhan beli bahan baru | Tinggi | **R3** |
| **5** | Smart Inventory Intake | Mengurangi waktu kerja operator saat jumlah stok besar | Rendah–sedang | **R1/R2** |
| **6** | Multi-Order Optimization | Optimasi alokasi lintas beberapa pesanan | Tinggi | **R4** |

**Rilis tidak harus sama dengan minggu kalender.** Selesaikan kriteria penerimaan sebuah rilis sebelum masuk rilis berikutnya.

### Yang **tidak** dikerjakan dulu

Computer vision yang mengklaim mendeteksi komposisi serat dari foto, pola garmen non-persegi panjang/CAD penuh, marketplace kain, perhitungan CO₂ tanpa LCA, mesin potong otomatis, dan chatbot generik. Fitur-fitur ini tidak menutup masalah paling mendesak dari MVP.

---

## 4. R1 — Closed-Loop Production Tracking (prioritas utama)

### 4.1 Masalah dan tujuan

MVP dapat menghitung layout valid, tetapi operator belum bisa merekam apakah komponen benar-benar dipotong. R1 menambahkan **jejak pelaksanaan** dari satu hasil `plan_run`, tanpa mengubah snapshot yang sudah ada.

**User story:**

> Sebagai operator konveksi, saya ingin menyetujui sebuah cutting plan, mengonfirmasi komponen yang berhasil dipotong, dan mencatat kondisi stok akhir sehingga laporan membedakan *rencana* dengan *realisasi yang dilaporkan*.

### 4.2 Alur pengguna

1. Operator membuka hasil plan (`/plans/[id]`) lalu memilih **Ajukan untuk Eksekusi**.
2. Sistem menampilkan checklist stok, kondisi material, dan potongan dari **selected plan**.
3. Operator menyetujui plan dan memulai sesi eksekusi.
4. Setelah pemotongan, operator menandai `COMPLETED`, `FAILED`, atau `NOT_ATTEMPTED` untuk tiap placement beserta catatan.
5. Operator meninjau ringkasan realisasi dan mengonfirmasi.
6. Stok kain yang tersentuh eksekusi dipindahkan ke `QUARANTINED` sampai diukur/rekonsiliasi; **jangan** otomatis berasumsi bahwa seluruh area sisa berbentuk rectangle yang bisa digunakan kembali.
7. Jika ada sisa fisik yang valid, operator membuat record remnant baru berdasarkan ukuran/kondisi yang diukur, kemudian melakukan verifikasi seperti P0.
8. Laporan membedakan hasil **planned**, **operator-confirmed**, dan **belum diverifikasi secara independen**.

**Catatan keselamatan stok:** karena satu workspace demo belum memiliki autentikasi dan reservasi produksi yang lengkap, satu remnant tidak boleh dikonfirmasi terpakai dua kali. Gunakan pengecekan konflik stok ketika eksekusi dikonfirmasi dan transaksi database atomik. Jika konflik, blokir konfirmasi dan minta operator meninjau ulang. Untuk rilis produksi nyata, perlu mekanisme reservasi, autentikasi, dan audit yang lebih kuat.

### 4.3 Data model usulan

**Tabel `cut_executions`:**

| Field | Deskripsi |
|---|---|
| `id` | ID eksekusi |
| `plan_run_id` | FK ke immutable snapshot `plan_runs` |
| `status` | `DRAFT`, `APPROVED`, `IN_PROGRESS`, `CONFIRMED`, `CANCELLED` |
| `mode` | `SYNTHETIC_DEMO` atau `OPERATOR_REPORTED` |
| `approved_at`, `confirmed_at` | Waktu tahap terkait |
| `operator_note` | Catatan bebas, tanpa informasi sensitif |
| `planned_reuse_area_mm2` | Disalin dari selected plan saat dibuat |
| `confirmed_reuse_area_mm2` | Dihitung server dari komponen completed yang sesuai snapshot |
| `created_at`, `updated_at` | Timestamp |

**Tabel `cut_execution_items`:**

- `execution_id`, `piece_instance_id`, `remnant_id`, `outcome` (`COMPLETED` / `FAILED` / `NOT_ATTEMPTED`), `note`.
- **Server** mengecek bahwa `(piece_instance_id, remnant_id)` benar-benar terdapat pada `selected.placements` dari `plan_run_id` terkait.
- Satu komponen tidak boleh dikonfirmasi dua kali; ID item unik dalam satu eksekusi.
- Luas *confirmed* memakai dimensi potongan yang telah ditetapkan di snapshot, **bukan estimasi bebas yang bisa diisi sembarang pengguna**. Bila ukuran hasil potong berbeda, tandai sebagai deviasi untuk peninjauan, bukan diam-diam dianggap valid.

**Opsional di R1 lanjutan:** `remnant_reconciliations` untuk tautan `source_remnant_id` → `new_remnant_id[]`, ukuran fisik, dan catatan hasil inspeksi.

### 4.4 API usulan (tambahan, bukan perubahan endpoint P0)

```http
POST /api/v1/cut-executions
  {"plan_run_id":"pr_01","mode":"SYNTHETIC_DEMO"}

GET /api/v1/cut-executions/{id}

POST /api/v1/cut-executions/{id}/approve

POST /api/v1/cut-executions/{id}/start

PATCH /api/v1/cut-executions/{id}/items/{piece_instance_id}
  {"outcome":"COMPLETED","note":"dipotong sesuai layout"}

POST /api/v1/cut-executions/{id}/confirm
  {"operator_note":"Pemotongan selesai; sisa menunggu ukur ulang"}
```

**Perilaku penting:**

- Konfirmasi bersifat **idempotent**: request ulang tidak boleh menggandakan konsumsi stok, metrik, atau riwayat.
- Status berubah sesuai state machine; eksekusi `CONFIRMED` tidak bisa diedit tanpa alur koreksi/audit tersendiri.
- Konfirmasi harus gagal jika data snapshot tidak valid, ada konflik penggunaan stok, atau sumber stok tidak lagi sah untuk eksekusi.
- Status stok source remnant menjadi `QUARANTINED` **dalam transaksi yang sama** dengan konfirmasi; plan hasil P0 tetap tidak pernah mengurangi stok.
- Mode `SYNTHETIC_DEMO` **tidak boleh** dipakai untuk laporan dampak lapangan. Untuk demo publik bersama, hindari mutasi data milik pengguna lain.

### 4.5 Update frontend

- `/plans/[id]`: tombol **Jalankan di Produksi** (atau **Simulasikan Eksekusi** dalam demo), label risiko dan tautan riwayat.
- `/executions/[id]`: checklist placement dengan status, indikator progres, catatan operator.
- `/reports`: KPI terpisah **Direncanakan**, **Dikonfirmasi Operator**, **Menunggu Rekonsiliasi**.
- `/remnants`: status `QUARANTINED` dan tautan sumber jika kain sudah dipakai dalam eksekusi.

### 4.6 Definition of Done dan tes

- [ ] Eksekusi merujuk snapshot plan; edit inventory sesudahnya tidak mengubah plan historis.
- [ ] `confirmed_reuse_area_mm2 <= planned_reuse_area_mm2` untuk konfirmasi item sesuai snapshot.
- [ ] Item tidak ada dalam selected plan ditolak.
- [ ] Konfirmasi ulang tidak menciptakan double count.
- [ ] Dua eksekusi yang mencoba memakai remnant sama tidak bisa keduanya dikonfirmasi tanpa rekonsiliasi yang valid.
- [ ] Source remnant masuk `QUARANTINED` secara atomik setelah konfirmasi (kecuali simulasi terisolasi yang memang tidak mengubah stok nyata).
- [ ] Data `SYNTHETIC_DEMO` tidak masuk hitungan dampak produksi riil.
- [ ] Dashboard menjelaskan perbedaan metrik rencana vs pelaksanaan yang dilaporkan.

**Metrik keberhasilan:** jumlah pemotongan terkonfirmasi, area komponen terkonfirmasi, selisih rencana-vs-realisasi, tingkat eksekusi yang berhasil, durasi konfirmasi operator. Hindari mengklaim pembelian kain baru berkurang hanya dari metrik ini.

---

## 5. R2 — Defect-Aware Cutting Optimization

### 5.1 Masalah dan pendekatan

PRD awal mengasumsikan satu remnant sebagai rectangle yang dapat dipakai seluruhnya. Padahal stok dunia nyata bisa berlubang, bernoda, atau robek. Versi awal R2 sebaiknya **manual defect mapping**, bukan computer vision.

**P0 R2 yang realistis:** operator menggambar satu atau beberapa rectangle sebagai **no-cut zone** pada setiap remnant. Cacat kompleks bisa didekati oleh beberapa rectangle konservatif; batasan ini wajib dijelaskan.

### 5.2 Perubahan data dan solver

**Tabel `remnant_defects`:** `id`, `remnant_id`, `x_mm`, `y_mm`, `width_mm`, `height_mm`, `defect_type`, `note`, `verified_by_operator_at`.

**Validasi:**

- Semua nilai koordinat dan dimensi integer mm; area defect harus berada di dalam remnant.
- Setiap run menyimpan daftar defect dalam `input_snapshot` agar hasil historis tetap identik.
- Validator independen menolak placement jika overlap **berluas positif** dengan defect.
- Pada CP-SAT, defect diperlakukan sebagai obstacle tetap di remnant bersangkutan dalam constraint `AddNoOverlap2D`.
- Pada greedy, calon posisi harus dicek juga terhadap no-cut zone.
- Jika defect berubah, stok kembali `NEEDS_REVIEW` sampai diverifikasi ulang secara eksplisit.

### 5.3 Frontend

- Halaman remnant: editor visual rectangle untuk posisi dan ukuran defect (form numerik tetap tersedia agar presisi).
- Halaman hasil: visualisasi area cacat sebagai lapisan terpisah dan penjelasan jika suatu komponen tidak muat karena defect.
- Tooltip: label jenis cacat, ukuran dan koordinat mm.

### 5.4 Acceptance criteria

- [ ] Semua placement dalam baseline dan selected plan berada di dalam kain serta tidak overlap dengan defect.
- [ ] Kasus piece yang muat secara dimensi tetapi menabrak defect ditangani dengan benar (alternatif posisi atau unallocated).
- [ ] Defect touch-edge diperbolehkan jika tidak ada overlap positif.
- [ ] Snapshot lama tidak berubah setelah defect diedit.
- [ ] Ada minimal 10 skenario defect tambahan yang diuji, termasuk banyak obstacle dan rotasi 90°.

**Metrik:** valid layout rate di hadapan defect (target 100% untuk hasil yang dipublikasikan), luas komponen teralokasi pada kain bercacat, dan perbedaan rencana bila defect tidak dimodelkan. Jangan memakai layout tanpa defect sebagai bukti layout tersebut layak dipotong secara nyata.

---

## 6. R1/R2 — Smart Inventory Intake

### Tujuan

Menjawab masalah operasional: mengapa operator harus memasukkan setiap lembar satu per satu?

### Lingkup

1. **CSV template** untuk `code`, `lot_code`, `material_code`, `color_code`, `width_mm`, `height_mm`, `quantity`, `condition_note`.
2. Preview dan validasi per baris sebelum impor; tampilkan baris yang gagal serta alasannya.
3. Jika `quantity=3`, backend membuat **tiga record remnant berbeda** dengan ID/code unik—sesuai kontrak PRD (satu record = satu lembar), tidak membuat solver memakai `quantity=3` sebagai satu container.
4. Default impor `NEEDS_REVIEW`; verifikasi massal hanya setelah operator memeriksa dimensi/material/warna (aksi dengan konfirmasi).
5. QR label untuk membuka detail satu lembar (fase berikutnya, bukan prasyarat CSV).

**API usulan:** `POST /api/v1/remnants/import-preview` dan `POST /api/v1/remnants/import-commit`, dengan preview token atau checksum agar baris yang dikomit sama dengan baris yang diverifikasi. Batasi ukuran dan jumlah input, tangani benturan code, berikan ringkasan baris diterima/ditolak, serta mode transaksi yang jelas.

**Acceptance criteria:** contoh 100 lembar dengan kombinasi quantity dapat diimpor tanpa salah jumlah; impor kode duplikat diberi error; stok belum verified tetap dikecualikan dari optimizer. Ukur waktu input dan error rate melalui pengujian operator jika tersedia, bukan angka hipotesis.

---

## 7. R3 — Future-Aware Remnant Optimization

### Hipotesis produk

Layout yang memaksimalkan luas reuse untuk pesanan saat ini belum tentu menghasilkan sisa kain yang paling berguna untuk pesanan selanjutnya.

### Desain bertahap

- **R3a — Residual Geometry:** hitung area kosong setelah placement dan representasikan *usable leftover* dengan definisi geometri yang terdokumentasi. Sisa bentuk L atau tidak beraturan **tidak boleh** dilaporkan sebagai satu rectangle baru jika bentuknya tidak benar.
- **R3b — Reusability Score:** definisikan skor berdasarkan dimensi sisa yang benar-benar dapat menampung kelas komponen tertentu; bukan hanya besar luas kosong.
- **R3c — Future Demand:** evaluasi layout menggunakan katalog order mendatang yang **sudah diketahui** atau skenario permintaan sintetis berlabel jelas. Jangan menamai prediksi tanpa model/data yang sah.
- **R3d — Multi-objective:** bandingkan dua strategi yang memakai input order identik: objective P0 vs objective yang juga mempertimbangkan nilai sisa. Pertahankan trade-off yang transparan; jangan mengorbankan prioritas order sekarang diam-diam.

**Contoh metrik:** `usable_leftover_area_m2` menurut definisi ukuran minimum, jumlah potongan masa depan yang muat dari residual, `future_order_coverage_pct`, dan perbedaan total reuse pada rangkaian order simulasi.

**Acceptance criteria:** validator geometri residual; input dan seed reproducible; ada hasil unggul, seri, dan kalah yang tetap dilaporkan; tidak ada klaim “menghemat stok masa depan” dari satu screenshot layout.

---

## 8. R3 — Purchase-Aware Planning

### Tujuan

Mengubah output dari hanya `unallocated_area_m2` menjadi **rencana kebutuhan kain baru** yang mempertimbangkan cara membeli kain: lebar roll, panjang minimum, margin potong, dan harga (jika ada).

### Tahap

1. Input katalog bahan yang dapat dibeli: `material_code`, `color_code`, `roll_width_mm`, `minimum_purchase_length_mm`, `unit_price`, dan satuan harga.
2. Untuk komponen yang tidak teralokasi dari remnant, jalankan perhitungan kebutuhan kain baru dengan batasan pembelian aktual.
3. Bandingkan skenario `tanpa reuse` vs `reuse + pembelian pelengkap` dengan demand dan aturan cutting yang sama.
4. Ukur bahan baru yang **direncanakan** untuk dibeli, biaya estimasi, dan waktu/biaya proses jika data tersedia.
5. Catat pembelian **aktual** hanya bila terdapat bukti administrasi atau konfirmasi yang sesuai; jangan menyebut penghematan terealisasi dari rencana saja.

**Risiko:** `unallocated_area_m2` dari PRD **bukan** kuantitas pembelian kain yang benar; roll width, bentuk pola, minimum order, dan sisa cutting dapat menambah kebutuhan pembelian.

**Acceptance criteria:** output menyebut asumsi lebar roll/harga, ada solusi pembelian valid, unit harga konsisten, dan hasil tanpa data harga tetap dapat berfungsi (hanya keluarkan metrik bahan).

---

## 9. R4 — Multi-Order Optimization

### Tujuan

Mengalokasikan inventaris remnant ke beberapa order tanpa memakai satu lembar dua kali dan tanpa mengabaikan prioritas/deadline produksi.

**Data tambahan:** `orders.priority`, `orders.due_at` (opsional), `planning_batches` berisi banyak order dan snapshot inventaris pada saat perencanaan.

**Pendekatan:** buat perbandingan antara *sequential planning* (order satu-satu) dan *batch planning* (order digabung dengan batasan yang sama). Perkenalkan fairness/deadline sebagai kebijakan terpisah yang dapat dijelaskan.

**Acceptance criteria:** setiap piece instance unik lintas order, tidak ada penempatan ganda pada area remnant yang sama, status per order jelas, dan eksperimen menggunakan data/skenario dengan ukuran yang sesuai kemampuan solver (jangan diam-diam melanggar batas MVP 30 pieces/15 remnants; rilis baru memerlukan benchmark kapasitas dan konfigurasi baru).

---

## 10. Dampak dan protokol pembuktian

| Klaim yang ingin diuji | Metrik utama | Sumber bukti | Batas interpretasi |
|---|---|---|---|
| Cutting plan layak secara matematis | Persentase layout lolos validator independen | Unit/integration tests, seeded benchmarks | Tidak sama dengan kelayakan produksi fisik |
| Rencana menghindari cacat | Jumlah overlap placement–defect = 0 | Defect snapshots dan geometry validator | Kualitas input defect masih bergantung operator |
| Pemanfaatan kain terjadi | `confirmed_reuse_area_m2` & jumlah item `COMPLETED` | Konfirmasi operator + catatan eksekusi | Konfirmasi operator belum otomatis bukti audit independen |
| Input inventaris lebih cepat | Median waktu per lembar, jumlah error per batch | Uji alur sebelum/sesudah fitur CSV | Butuh pengujian dengan pengguna nyata |
| Sisa kain lebih berguna | Pemenuhan order berikutnya pada replay multi-periode | Skenario/riwayat order reproducible | Jika data sintetis, bukan hasil pabrik riil |
| Pembelian kain baru berkurang | Kuantitas pembelian aktual vs pembanding yang sepadan | Catatan pembelian, demand dan batasan produksi | Tidak bisa disimpulkan dari reuse area saja |
| Emisi berkurang | CO₂e dengan metodologi LCA dan faktor emisi yang dapat diaudit | Inventaris siklus hidup + asumsi substitusi | **Tidak diklaim** sebelum metodologi tersedia |

### Standar eksperimen minimal

1. Pertahankan **30 skenario seeded** dari PRD P0 dan tambahkan kasus khusus untuk setiap fitur.
2. Bandingkan baseline dan optimizer pada input, filter, serta objective yang terdokumentasi.
3. Jalankan validator independen untuk seluruh layout yang ditampilkan; yang invalid dianggap gagal.
4. Laporkan kasus gain positif, gain nol, fallback, dan timeout secara lengkap.
5. Pisahkan `SYNTHETIC_DEMO` dari `OPERATOR_REPORTED` dan, bila nanti tersedia, data audit pihak ketiga.
6. Jangan memakai grafik yang hanya menunjukkan kasus terbaik tanpa jumlah total skenario.

---

## 11. Dependensi teknis dan migrasi

**Stack tetap:** Next.js App Router + TypeScript + Tailwind CSS; FastAPI + Pydantic v2 + SQLAlchemy; OR-Tools CP-SAT; SQLite untuk demo kecil dengan penyimpanan persisten.

**Urutan migrasi yang disarankan:**

1. Tambah schema dan migration script untuk `cut_executions`/`cut_execution_items`, tanpa mengubah bentuk respons P0.
2. Buat service domain eksekusi dan tes transaksi/idempotensi sebelum UI.
3. Tambah perubahan dashboard/halaman execution dengan feature flag.
4. Tambah `remnant_defects` dan snapshot defect; ubah greedy + CP-SAT + validator bersamaan agar tidak ada perbedaan aturan.
5. Tambah CSV importer dengan preview sebelum commit.
6. Perluas metric/model untuk residual, pembelian, dan multi-order hanya ketika test suite dan benchmark fase sebelumnya lulus.

**Keamanan deployment:** PRD P0 belum menyediakan autentikasi production-grade. Jika web publik mengizinkan perubahan inventaris/eksekusi, data bisa saling bertabrakan antar pengunjung. Sebelum memakai data lapangan, wajib ada autentikasi, pembatasan akses workspace, audit perubahan, backup, dan kontrol transaksi. Untuk demo juri, gunakan workspace/demo data terisolasi atau akses tulis yang dibatasi; jangan membocorkan API key ke frontend.

**Keputusan penting:** fitur execution mengubah stok **hanya setelah tindakan konfirmasi operator**; `POST /api/v1/plan-runs` tetap merupakan simulasi dan **tidak** mengurangi stok. Ini menjaga kontrak asli MVP.

---

## 12. Backlog pelaksanaan dan pembagian kerja

| Urutan | Backend | Frontend | Optimization/QA | Gate selesai |
|---|---|---|---|---|
| 0 — Kunci MVP | Stabilkan endpoint/seed/README | Freeze demo alur ≤2 menit | 30 seeded tests, validitas SVG | Submission P0 siap |
| 1 — Eksekusi | Schema + API + atomic confirm | Checklist eksekusi + laporan planned/confirmed | Double-count & conflict tests | R1 bisa diuji end-to-end |
| 2 — Defect | Defect schema + snapshot | Editor no-cut zone | Greedy/CP-SAT/validator obstacle tests | Tidak ada overlap defect |
| 3 — Input massal | CSV preview/import | Template & error preview | Test quantity, duplikat, review status | Batch bisa diverifikasi |
| 4 — Residual & purchase | Model leftover + katalog pembelian | Perbandingan skenario | Replay & perhitungan pembelian | Klaim berbasis asumsi eksplisit |
| 5 — Multi-order | Batch planning API | UI alokasi per order | Benchmark kapasitas/fairness | Tidak double-assign antar order |

### Tugas pertama paling konkret (sesudah P0 stabil)

- [ ] Sepakati state machine eksekusi dan arti `CONFIRMED` dengan tim.
- [ ] Tentukan apakah konfirmasi memakai dataset demo terisolasi atau inventaris kerja (harus eksplisit).
- [ ] Implementasi `cut_executions` dan `cut_execution_items` + migrasi.
- [ ] Implementasi validasi item terhadap immutable selected plan.
- [ ] Implementasi konfirmasi idempotent + karantina sumber kain secara atomik.
- [ ] Buat halaman `/executions/[id]` dan KPI planned vs confirmed.
- [ ] Tambahkan sedikitnya 5 tes integration untuk replay request, konflik, status, validasi, dan histori.
- [ ] Rekam satu demo yang jelas menunjukkan **rencana ≠ realisasi**.

---

## 13. Cara mempresentasikan perkembangan kepada juri

**Narasi singkat:**

> "LoopCut AI awalnya membantu konveksi menemukan pemotongan yang valid dari stok kain sisa terverifikasi. Pengembangan berikutnya membuat rekomendasi lebih siap diterapkan: kami memperhitungkan cacat kain, mencatat pelaksanaan pemotongan, dan merekonsiliasi stok. Dengan begitu, sistem tidak hanya memperlihatkan potensi reuse, tetapi juga membedakan rencana dengan hasil yang dilaporkan operator. Pengurangan pembelian material dan emisi tetap memerlukan data operasional serta pembuktian tersendiri."

**Alur demo R1/R2 yang disarankan:**

1. Tunjukkan remnant terverifikasi dan satu no-cut zone (jika R2 sudah aktif).
2. Jalankan order; perlihatkan greedy vs selected + status yang benar.
3. Tekan "Ajukan untuk Eksekusi" lalu tandai item yang benar-benar selesai (atau sebagai **simulasi demo**).
4. Perlihatkan perbedaan planned vs confirmed serta stok yang menunggu rekonsiliasi.
5. Tampilkan benchmark yang dapat diulang, bukan angka dampak yang dibuat-buat.

---

## 14. Kriteria keputusan Go / No-Go

**GO — lanjut ke fitur berikutnya apabila:**

- Seluruh alur P0 masih bekerja dan kontrak JSON tidak rusak.
- Validator independen tidak menerima layout invalid.
- Metrik tetap memiliki definisi dan unit yang konsisten.
- Konfirmasi eksekusi tidak menghasilkan double-count atau inventaris ganda.
- Skenario demo sintetis jelas ditandai dan reproduksibel.

**NO-GO — tunda fitur apabila:**

- Algoritma menghasilkan placement di zona cacat atau melewati kain.
- Konfirmasi dua kali mengurangi/mengubah stok dua kali.
- Tim belum bisa membedakan perhitungan reuse, konfirmasi operator, dan pembelian riil.
- Fitur baru membuat demo utama tidak dapat diselesaikan secara andal.
- Klaim dampak menuntut data yang belum tersedia.

---

## 15. Referensi internal dan catatan perubahan

**Asal dari PRD yang diunggah:**

- `prd.md`: scope P0–P2, objective reuse area, pembatasan klaim, 30 skenario seeded, deadline kompetisi.
- `prd-backend.md`: authoritative backend, SQLite/FastAPI, `plan_runs` immutable, filter verified/available, max 15 remnants/30 pieces, simulasi tidak mengubah stok.
- `prd-frontend.md`: alur UI ≤2 menit, status solver, SVG dan metrik, CSV di P1, pemisahan label data sintetis/perhitungan.
- `prd-optimization.md`: CP-SAT + deterministic greedy, aturan rectangle/non-overlap, validator independen, objective lexicographic, timeout 8 detik.

**Usulan baru yang belum ada dalam PRD P0:** execution lifecycle, karantina saat konfirmasi, obstacle defect, batch CSV yang lebih lengkap, residual geometry, purchase planning, dan multi-order planning.

**Catatan sumber eksternal:** dokumen ini adalah rancangan produk/teknis berdasarkan PRD dan brainstorming, **bukan** studi literatur baru. Jika fitur R3–R4 akan diklaim sebagai inovasi riset, tambahkan telaah pustaka dan benchmark terpisah sebelum presentasi.

---

## 16. Keputusan akhir

> **Prioritaskan satu loop produksi yang benar-benar tertutup, bukan banyak fitur AI yang dangkal.**
>
> R1 = buktikan alur rencana → eksekusi → rekonsiliasi.  
> R2 = buat hasil cutting lebih realistis dengan defect-aware optimization.  
> R3–R4 = baru hubungkan ke kegunaan sisa, pembelian bahan baru, dan banyak order.

**Target positioning jangka panjang:** *LoopCut AI — Intelligent Textile Circular Production Planner*, bukan hanya generator layout pemotongan.
