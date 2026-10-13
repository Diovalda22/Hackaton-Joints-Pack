# PRD Frontend — LoopCut AI

**Versi:** 1.0 / MVP JOINTS 2026  
**Sumber scope:** [`prd.md`](./prd.md)  
**Kontrak backend:** [`prd-backend.md`](./prd-backend.md)  
**Engine & geometri:** [`prd-optimization.md`](./prd-optimization.md)  
**Stack usulan:** Next.js App Router, TypeScript, Tailwind CSS, komponen UI accessible, SVG native/React.

---

## 1. Tujuan

Menyediakan alur yang **bisa didemokan dalam ≤2 menit**: pilih stok kain sisa yang sudah terverifikasi → buat pesanan baru → jalankan perhitungan → bandingkan greedy vs hasil terpilih → lihat layout potong yang secara geometris valid.

**Prinsip UX:** tidak pernah menggambarkan prediksi sebagai hasil pengukuran; label `Skenario demo/sintetis`, `Terukur/dimasukkan pengguna`, dan `Hasil perhitungan` dibedakan.

## 2. Information architecture & route

```text
/
  Dashboard & tombol "Mulai demo"
/remnants
  Inventaris kain sisa; tambah/edit/verifikasi
/orders
  Daftar pesanan
/orders/new
  Form pesanan + baris komponen
/orders/[id]
  Ringkasan pesanan + tombol "Cari rencana pemotongan"
/plans/[id]
  Hasil optimizer, baseline, layout, metrik, daftar unallocated
/about
  Metode, batasan, sumber, arti metrik (boleh modal di MVP)
```

Jika tim tertinggal, **route minimum** cukup `/`, `/remnants`, `/orders/new`, `/plans/[id]`; ringkasan order dan halaman about dapat berupa panel/modal.

## 3. Sistem desain

- **Nuansa:** studio perencanaan material; bersih, presisi, industri ringan; bukan marketplace.
- **Navigasi:** sidebar laptop (Dashboard, Inventory, New Order, Reports), navbar ringkas pada ponsel.
- **Typography:** hierarki jelas, angka dan satuan memakai tabular figures.
- **Warna semantik:** hijau = verified/layak; kuning = needs review/timeout; merah = incompatibility/input invalid; biru = allocated/potongan. Jangan bergantung pada warna saja.
- **Laporan:** setiap angka punya unit dan tooltip definisi, misalnya `reuse_area_m2`, **bukan** `CO₂ saved`.
- **Aksesibilitas:** label setiap input, focus states, kontras cukup, tombol keyboard-friendly, informasi SVG tersedia juga sebagai tabel.

## 4. Halaman & komponen

### FE-01 — Dashboard `/`

**P0:**
- Hero: “Gunakan kembali kain sisa untuk pesanan baru”.
- KPI ringkas dari inventaris: total lembar `AVAILABLE`, jumlah `VERIFIED`, jumlah butuh review; tidak perlu membuat prediksi limbah nasional.
- Tombol `Lihat Inventaris`, `Buat Pesanan`, `Muat Data Demo` (hanya dev/demo mode).
- Alur 3 langkah: verifikasi stok → susun order → lihat cutting plan.
- Peringatan global: “Simulasi perencanaan; belum otomatis memotong/mengurangi stok”.

**State:** empty, loading, error backend, loaded.

### FE-02 — Inventory `/remnants`

**P0:**
- Tabel responsif: `code`, `lot_code`, `material_code`, `color_code`, `width_mm`, `height_mm`, `area_m2`, `verification_status`, `stock_status`.
- Filter material, warna, status; search kode.
- Form tambah/edit: kode, lot opsional, material, warna, lebar/panjang (mm), catatan kondisi/sumber data.
- Tombol `Tandai Verified` **hanya** jika semua field wajib valid; perubahan informasi inti yang sudah diverifikasi kembali menjadi `NEEDS_REVIEW` kecuali pengguna melakukan konfirmasi ulang eksplisit.
- Quarantine/Archive actions dengan konfirmasi.
- Import CSV **P1**: preview per baris, validasi baris gagal, tidak silently skip.

**Pesan wajib:** `Jenis kain belum terverifikasi, tidak akan digunakan dalam optimasi.`

### FE-03 — Order builder `/orders/new`

**P0:**
- `order_name` + daftar `lines[]`.
- Pool kain: pilih otomatis seluruh stok verified/available bila ≤15 lembar; jika lebih, UI wajib menyediakan multi-select maksimum 15 lembar dan menunjukkan alasan pembatasan.
- Setiap line: `label`, `material_code`, `color_code`, `width_mm`, `height_mm`, `quantity`, `allow_rotation_90`.
- Button `Tambah komponen`, `Hapus`, `Simpan pesanan`, `Jalankan rencana`.
- Live preview: total unit pieces, total area komponen m².
- `quantity` 1–30 per baris; total setelah expand maksimal 30 unit; minimal 1 line.
- Validasi inline: angka bulat positif; material/warna wajib; data valid bila potongan belum tentu muat (itu menjadi hasil engine, bukan input error).
- Field helper: “Masukkan dimensi potong (sudah mencakup allowance jahitan bila diperlukan)”.

**MVP:** tidak upload CAD, tidak AI-generated pattern, tidak perlu upload foto.

### FE-04 — Plan results `/plans/[id]`

**P0, layar utama presentasi:**
- Header: nama order, timestamp, `solver_status`, runtime, `input_snapshot` label, tanda jika stok terbaru berbeda dengan snapshot run.
- KPI: `reuse_area_m2`, `area_coverage_pct`, `pieces_placed / pieces_requested`, `unallocated_area_m2`, `gain_vs_greedy_m2`.
- Tab/toggle `Greedy Baseline` dan `Selected Plan` menggunakan **satu komponen SVG yang sama**.
- Galeri kain per `remnant_id`: kotak kain diskalakan proporsional; placement diberi warna & label ID potongan; tooltip width/height/rotation.
- Tabel placement di bawah gambar untuk keyboard/screen reader: `piece_instance_id`, `remnant_code`, `x`, `y`, `w`, `h`, `rotated`.
- Panel `Tidak teralokasi` menampilkan ID dan alasan yang tidak bersifat overclaim (`NO_VERIFIED_MATERIAL_MATCH`, `DOES_NOT_FIT_ANY_COMPATIBLE_REMNANT`, `UNALLOCATED_AFTER_SEARCH`).
- Badge status: `OPTIMAL` (terbukti), `FEASIBLE_TIMEOUT` (layak, optimalitas belum terbukti), `BASELINE_FALLBACK` (fallback), `NO_ASSIGNABLE_PIECES` (data tidak dapat dialokasikan).
- “Rencana ini **belum mengurangi stok** dan belum menjamin penghematan pembelian bahan.”
- CTA `Buat skenario lain`, `Kembali ke inventaris`.
- Ekspor JSON dan SVG (P1), tampilkan format mentah bila belum tersedia.

**Perbandingan yang adil:** selalu menampilkan batasan yang identik, unit yang sama, dan status solver. Jika selected tidak lebih baik dari greedy, angka gain tetap `0`, **tidak** membuat klaim penghematan fiktif.

## 5. Wireframe tekstual

```text
+------------------------------------------------------------------+
| LoopCut AI                                  Demo mode / Connected |
+------------------------------------------------------------------+
| Inventory | Orders | Reports                                   |
+------------------------------------------------------------------+
| NEW ORDER: Tote-bag accessories             [Run Cutting Plan]  |
| Cotton | Black | Pieces: 6 | Total area: 0.72 m²                |
+------------------------------------------------------------------+
| RESULTS                     [Greedy] [Selected]                  |
| Reuse area: 0.64 m² | Coverage: 88.9% | Status: FEASIBLE_TIMEOUT|
+------------------------------------+-----------------------------+
| Remnant R-01 (1200 x 800 mm)        | Unallocated components      |
| +------------+----------+          | - P-05: packing conflict   |
| |  P-01      | P-02     |          | - P-06: packing conflict   |
| +------------+----------+          |                             |
| |       free material     |          | Meaning of metrics [i]      |
| +-------------------------+          |                             |
+------------------------------------+-----------------------------+
| Baseline 0.56 m² | Selected 0.64 m² | Difference +0.08 m²       |
+------------------------------------------------------------------+
```

Wireframe di atas **mockup angka**, bukan hasil benchmark; konten akhir selalu dari respons backend.

## 6. Component inventory

| Component | Input props | Tanggung jawab |
|---|---|---|
| `InventoryTable` | remnants, onEdit, filters | Tampilan stok & status |
| `RemnantForm` | initial?, onSubmit | Validasi form & payload |
| `VerificationBadge` | verificationStatus, stockStatus | Status sesuai semantik |
| `OrderLineEditor` | lines, onChange | Input komponen dan total |
| `MetricCard` | label, value, unit, definition | KPI tanpa overclaim |
| `PlanStatusNotice` | status, warnings | Status solver & fallback |
| `RemnantCanvas` | remnant, placements | SVG deterministik |
| `PlanComparison` | greedy, selected | Toggle/comparison |
| `UnallocatedList` | records | Alasan yang dapat ditindaklanjuti |
| `EmptyState` | reason, action | State kosong |

## 7. Rendering SVG — kontrak yang wajib konsisten

- Asal koordinat **kiri-atas (0,0)**.
- `x_mm` bergerak ke kanan; `y_mm` bergerak ke bawah.
- Lebar/tinggi kain `W_mm`, `H_mm`; gunakan SVG `viewBox="0 0 W H"` dengan `preserveAspectRatio="xMidYMid meet"`.
- Komponen dirender dari respons API sebagai `<rect x y width height>` dalam satuan mm secara konseptual; CSS hanya mengatur skala tampilan.
- Jika `rotated=true`, API **sudah memberikan** dimensi akhir yang terorientasi (`placed_width_mm`, `placed_height_mm`); FE **tidak** menukar kedua ukuran lagi.
- Layout tidak boleh berubah ketika viewport di-resize.
- Jangan menambahkan posisi drag yang menyimpang dari solusi; tidak ada interactive geometry edit di P0.
- Tooltips menyebut ukuran potong dan item; warna konsisten antar tampilan plan.
- Kotak kontainer/komponen tampil berborder; sisipkan tabel untuk aksesibilitas.

## 8. API calls yang digunakan

| Aksi UI | HTTP |
|---|---|
| Load inventory | `GET /api/v1/remnants` |
| Create remnant | `POST /api/v1/remnants` |
| Update/verify/quarantine | `PATCH /api/v1/remnants/{id}` |
| List orders | `GET /api/v1/orders` |
| Create order | `POST /api/v1/orders` |
| Open order | `GET /api/v1/orders/{id}` |
| Run solver | `POST /api/v1/plan-runs` |
| Open plan | `GET /api/v1/plan-runs/{id}` |
| Health | `GET /api/v1/health` |

Seluruh request memakai JSON; error berbentuk `{"error":{"code":"...","message":"...","details":{...}}}`. Schema detail berada pada `prd-backend.md`.

## 9. Frontend state management

- **Server state:** TanStack Query atau SWR (pilih satu), keyed berdasarkan remnant/order/plan ID.
- **Local form state:** React Hook Form + Zod untuk validasi input sebelum API (jangan menggantikan validasi backend).
- **Plan execution:** loading dengan spinner/skeleton, disabled tombol selama request, status `timeout/fallback` dijelaskan, retry manual.
- **Persisted plans:** tampilan historis mengambil snapshot dari backend; perubahan inventory tidak diam-diam mengubah layout tersimpan.
- **Feature flags:** `NEXT_PUBLIC_ENABLE_DEMO_SEED`; optional TypeSafe/LLM tidak muncul bila backend tidak mengaktifkan fitur.

## 10. Input validation & error copy

| Kondisi | Pesan yang disarankan |
|---|---|
| Ukuran 0/negatif/noninteger | `Ukuran harus bilangan bulat lebih dari 0 mm.` |
| Jumlah order >30 | `Maksimum 30 komponen per perhitungan untuk versi demo.` |
| Stok kosong | `Belum ada kain tersedia. Tambahkan atau muat stok contoh.` |
| Belum verified | `Kain ini perlu verifikasi sebelum dapat dipakai.` |
| Tidak ada material cocok | `Belum ada stok terverifikasi dengan bahan dan warna sesuai.` |
| Solver tidak membuktikan optimum | `Ditemukan rencana valid, tetapi belum terbukti paling optimal.` |
| Solver fallback | `Perhitungan lanjutan belum selesai; menampilkan rencana baseline yang valid.` |
| Request gagal | `Gagal memproses rencana. Periksa koneksi, lalu coba lagi.` |

## 11. Performance, accessibility, quality

- Mobile-friendly form; fokus utama demo desktop 1280px.
- Halaman result tetap berguna saat semua potongan tidak tertampung.
- Tidak ada nilai metrik yang dibuat frontend secara acak; metrik berasal dari API, dan format unit dilakukan di UI.
- Waktu respon solver dibatasi backend **8 detik** (ditambah overhead API); UI memberi indikator proses tanpa menjanjikan angka statis.
- Pastikan `aria-label` pada chart/SVG dan alternatif tabel.
- Screenshot demo dapat diambil tanpa memalsukan performa/angka.
- Semua komponen mendukung pesan warning yang tidak hilang saat toggle greedy/selected.

## 12. Acceptance tests FE

- [ ] Buat remnant `COTTON/BLACK`, verifikasi, tampil di daftar available.
- [ ] Remnant unverified tidak muncul dalam pilihan pool otomatis.
- [ ] Buat order dua line, quantity total benar, validasi batas maksimum.
- [ ] Run memperlihatkan spinner, lalu layout untuk solusi terpilih dan baseline.
- [ ] Toggle baseline vs selected mengubah koordinat/placement sesuai API, bukan metrik hardcoded.
- [ ] SVG skala proporsional, tooltip memuat dimensi hasil orientasi benar.
- [ ] Jika solver `FEASIBLE_TIMEOUT`, UI tidak menampilkan label `Optimal`.
- [ ] Jika semua komponen tidak dapat dialokasikan, tetap ada panel alasan & tombol kembali.
- [ ] Mengubah stok setelah plan dibuat tidak mengubah layout historis.
- [ ] Tab keyboard bisa menjangkau form, toggle plan, tabel, dan tombol aksi.

## 13. Prioritas empat hari

- **Hari 1:** kerangka Next.js, inventaris, order editor.
- **Hari 2:** API integration, state error/loading, status qualification.
- **Hari 3:** SVG layout, comparison, KPI, end-to-end demo.
- **Hari 4:** bug fix, responsive, aksesibilitas, screenshot/video; **tidak** menambah fitur P2.

## 14. Out of scope

Auto image recognition, scan NIR, classifier komposisi kain, chatbot generik, pricing, auth enterprise, multi-workspace, machine cutting control, CAD polygon, CO₂ calculator tanpa LCA, portal jual beli kain.
