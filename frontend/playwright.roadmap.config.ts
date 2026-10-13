import { defineConfig } from 'playwright/test';
export default defineConfig({
    testDir: './e2e-roadmap', fullyParallel: false, workers: 1,
    use: { baseURL: 'http://127.0.0.1:3001', trace: 'retain-on-failure' },
    projects: [
        { name: 'roadmap-desktop', use: { viewport: { width: 1280, height: 900 } } },
        { name: 'roadmap-mobile', use: { viewport: { width: 390, height: 844 } } },
    ],
    webServer: [
        { command: '.venv/bin/python -m app.demo.e2e_server --roadmap --port 8101', cwd: '../backend',
            url: 'http://127.0.0.1:8101/api/v1/health', reuseExistingServer: false, timeout: 15000 },
        { command: 'npm run dev -- --hostname 127.0.0.1 --port 3001', url: 'http://127.0.0.1:3001', reuseExistingServer: false, timeout: 20000,
            env: { NEXT_PUBLIC_API_MODE: 'http', NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:8101', NEXT_PUBLIC_ENABLE_DEMO_SEED: 'false' } },
    ], reporter: 'list',
});
