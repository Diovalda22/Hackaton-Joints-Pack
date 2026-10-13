import { z } from 'zod';
import type { OrderInput, Remnant } from './types';
export const dimension = z.number({ error: 'Ukuran harus bilangan bulat lebih dari 0 mm.' }).int('Ukuran harus bilangan bulat lebih dari 0 mm.').min(1, 'Ukuran harus bilangan bulat lebih dari 0 mm.').max(10000, 'Maksimum ukuran 10.000 mm.');
export const codeSchema = z.string().trim().min(1, 'Kode wajib diisi.').max(64, 'Maksimum 64 karakter.').transform(s => s.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9_-]+$/, 'Gunakan huruf, angka, underscore, atau tanda hubung.'));
export const remnantSchema = z.object({ code: z.string().trim().min(1, 'Kode kain wajib diisi.').max(64), lot_code: z.string().trim().max(128).optional(), material_code: codeSchema, color_code: codeSchema, width_mm: dimension, height_mm: dimension, condition_note: z.string().max(1000).optional(), source_note: z.string().max(1000).optional() });
export const lineSchema = z.object({ label: z.string().trim().min(1, 'Nama komponen wajib diisi.').max(128), material_code: codeSchema, color_code: codeSchema, width_mm: dimension, height_mm: dimension, quantity: z.number().int('Jumlah harus bilangan bulat.').min(1, 'Minimal satu unit.').max(30, 'Maksimum 30 unit per baris.'), allow_rotation_90: z.boolean() });
export const orderSchema = z.object({ name: z.string().trim().min(1, 'Nama pesanan wajib diisi.').max(128), lines: z.array(lineSchema).min(1, 'Tambahkan minimal satu komponen.').refine(lines => lines.reduce((s, l) => s + l.quantity, 0) <= 30, 'Maksimum 30 komponen per perhitungan untuk versi demo.') });
export const eligible = (r: Remnant) => r.verification_status === 'VERIFIED' && r.stock_status === 'AVAILABLE' && remnantSchema.safeParse(r).success;
export const totalPieces = (order: OrderInput) => order.lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
export const totalArea = (order: OrderInput) => order.lines.reduce((s, l) => s + (Number(l.width_mm) || 0) * (Number(l.height_mm) || 0) * (Number(l.quantity) || 0), 0);
export const formatArea = (area: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(area);
export const formatNumber = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n);
export function coreChanged(before: Remnant, after: Partial<Remnant>) { return (['material_code', 'color_code', 'width_mm', 'height_mm', 'condition_note'] as const).some(k => after[k] !== undefined && after[k] !== before[k]); }
export const defaultLine = () => ({ label: '', material_code: 'COTTON', color_code: 'BLACK', width_mm: 300, height_mm: 200, quantity: 1, allow_rotation_90: false });
