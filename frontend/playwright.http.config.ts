import { defineConfig } from 'playwright/test';
export default defineConfig({
    testDir: './e2e-http',
    fullyParallel: false,
    workers: 1,
    use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
    projects: [
        { name: 'http-desktop', use: { viewport: { width: 1280, height: 900 } } },
        { name: 'http-mobile', use: { viewport: { width: 390, height: 844 } } },
    ],
    webServer: [
        {
            command: '.venv/bin/python -m app.demo.e2e_server',
            cwd: '../backend',
            url: 'http://127.0.0.1:8100/api/v1/health',
            reuseExistingServer: false,
            timeout: 30000,
        },
        {
            command: 'npm run dev -- --hostname 127.0.0.1',
            url: 'http://127.0.0.1:3000',
            reuseExistingServer: false,
            timeout: 60000,
            env: { NEXT_PUBLIC_API_MODE: 'http', NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:8100', NEXT_PUBLIC_ENABLE_DEMO_SEED: 'false' },
        },
    ],
    reporter: 'list',
});
