import { test, expect } from 'playwright/test';
const backend = 'http://127.0.0.1:8100/api/v1';

test('free order runs through real API and keeps its historical snapshot', async ({ page, request }) => {
    const code = `E2E-${Date.now()}`;
    const created = await request.post(`${backend}/remnants`, { data: {
        code, material_code: 'COTTON', color_code: 'BLACK', width_mm: 1100, height_mm: 800,
    } });
    expect(created.status()).toBe(201);
    const stock = await created.json();
    expect((await request.patch(`${backend}/remnants/${stock.id}`, { data: { verification_status: 'VERIFIED' } })).status()).toBe(200);
    await page.goto('/orders/new');
    await expect(page.getByText('API terhubung', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Muat data demo', exact: true })).toHaveCount(0);
    await page.getByLabel('Nama pesanan', { exact: true }).fill('Pesanan bebas HTTP');
    await page.getByLabel('Nama komponen', { exact: true }).fill('Panel ukuran bebas');
    await page.getByLabel('Lebar (mm)', { exact: true }).fill('457');
    await page.getByLabel('Tinggi (mm)', { exact: true }).fill('311');
    await page.getByLabel('Jumlah unit', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Jalankan rencana', exact: true }).click();
    await expect(page).toHaveURL(/\/plans\//);
    await expect(page.getByRole('heading', { name: 'Pesanan bebas HTTP', exact: true })).toBeVisible();
    await expect(page.getByText('Semua komponen terpenuhi', { exact: true })).toBeVisible();
    await expect(page.getByText('Contoh status fixture:', { exact: false })).toHaveCount(0);
    const url = page.url();
    const id = new URL(url).pathname.split('/').at(-1);
    const response = await request.get(`${backend}/plan-runs/${id}`);
    const plan = await response.json();
    expect(plan.solver_metadata.engine).toBe('ortools-cpsat');
    expect(plan.solver_metadata.raw_solver_status).toBe('OPTIMAL');
    expect(plan.selected.metrics.requested_count).toBe(2);
    expect(plan.selected.metrics.reuse_area_mm2).toBe(457 * 311 * 2);
    await request.patch(`${backend}/remnants/${stock.id}`, { data: { width_mm: 1099 } });
    await page.reload();
    await expect(page.getByText('Stok terbaru berbeda dengan snapshot run ini.', { exact: false })).toBeVisible();
    expect(await (await request.get(`${backend}/plan-runs/${id}`)).json()).toEqual(plan);
    await page.getByRole('button', { name: 'Greedy baseline', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Greedy baseline', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('real API returns an informative empty result for incompatible material', async ({ page, request }) => {
    const created = await request.post(`${backend}/orders`, { data: {
        name: 'Material belum tersedia', lines: [{ label: 'Panel spesifik', material_code: 'OTHER_SPECIFIED', color_code: 'UNIQUE_COLOR',
            width_mm: 500, height_mm: 300, quantity: 1, allow_rotation_90: false }],
    } });
    expect(created.status()).toBe(201);
    const order = await created.json();
    await page.goto(`/orders/${order.id}`);
    await page.getByRole('button', { name: 'Jalankan rencana', exact: true }).click();
    await expect(page).toHaveURL(/\/plans\//);
    await expect(page.getByText('Tidak ada placement pada rencana ini', { exact: true })).toBeVisible();
    await expect(page.locator('.unallocated-list code')).toHaveText('NO_VERIFIED_MATERIAL_MATCH');
    await expect(page.locator('.plan-meta code')).toHaveText('NO_ASSIGNABLE_PIECES');
});
