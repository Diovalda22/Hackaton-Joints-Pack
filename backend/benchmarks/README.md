# Laporan benchmark

`baseline-only/` berisi run nyata greedy pada 30 input sintetis berseed. Seluruh layout lolos validator. CP-SAT **tidak dijalankan** pada laporan ini; `baseline_only=true` dan `complete=false`. Angka tersebut bukan klaim peningkatan optimizer.

`full/` sekarang berisi perbandingan nyata greedy/CP-SAT untuk 30 input sintetis: `complete=true`, 30 layout valid, 0 engine error. Ringkasan memisahkan kandidat unggul/seri/tanpa kandidat dan status optimal/feasible/fallback. Untuk menjalankan ulang dari `backend/`:

```bash
python -m app.demo.benchmark --time-limit 8 --output benchmarks/full
```

Full benchmark menyimpan input, koordinat, metrik, versi, runtime, raw status, dan perbandingan kandidat optimizer secara terpisah dari hasil selected. Jangan membandingkan hasil dari input atau batasan yang berbeda.
