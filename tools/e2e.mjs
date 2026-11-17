import { chromium } from 'playwright-core';
import fs from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:3101';
const TOKEN = process.env.SETUP_TOKEN || 'TEST-TOKEN';
const USER = process.env.DF_USER || 'admin';
const PASS = process.env.DF_PASS || 'devforge123';
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`CONSOLE: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
page.on('requestfailed', (request) => {
  if (!request.url().includes('favicon')) errors.push(`REQFAIL: ${request.url()} ${request.failure()?.errorText}`);
});

const log = (...args) => console.log(...args);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); log('SHOT', name); };

await page.goto(BASE, { waitUntil: 'networkidle' });
log('URL:', page.url());
if (await page.locator('.auth-card').count()) {
  const inputs = page.locator('.auth-form input');
  const count = await inputs.count();
  log('AUTH INPUTS:', count);
  if (count === 4) {
    await inputs.nth(0).fill(TOKEN);
    await inputs.nth(1).fill(USER);
    await inputs.nth(2).fill(PASS);
    await inputs.nth(3).fill(PASS);
    await shot('auth-setup');
    await page.click('.auth-submit');
  } else {
    await inputs.nth(0).fill(USER);
    await inputs.nth(1).fill(PASS);
    await shot('auth-login');
    await page.click('.auth-submit');
  }
}

await page.waitForSelector('.dashboard', { timeout: 25000 });
log('SETUP OK');
await page.waitForTimeout(600);
await shot('dashboard-clean');

// Open welcome page
await page.locator('.side-page-link').filter({ hasText: '欢迎来到 DEVFORGE' }).click();
await page.waitForSelector('.bn-editor', { timeout: 20000 });
await page.waitForTimeout(500);
log('PAGE TITLE:', await page.locator('.page-title-input').inputValue());
log('PAGE BLOCKS:', await page.locator('.bn-block-outer').count());
await shot('page-clean');

// Slash menu in Chinese
await page.locator('.bn-editor').click();
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
await page.keyboard.type('/');
await page.waitForTimeout(650);
const menuText = await page.locator('.bn-suggestion-menu').innerText().catch(() => '');
log('SLASH CHINESE:', /标题|列表|代码/.test(menuText));
await shot('slash-chinese');
await page.keyboard.press('Escape');
await page.keyboard.press('Control+Z');
await page.waitForTimeout(500);

// Create a module through the UI
await page.locator('.sidebar .btn-new-page').click();
await page.waitForSelector('.module-modal[open]', { timeout: 5000 });
await page.locator('.module-form-main .field input').first().fill('玩法原型');
await page.locator('.emoji-option').filter({ hasText: '🧩' }).click();
await shot('module-dialog');
await page.getByRole('button', { name: '保存模块' }).click();
await page.waitForTimeout(900);
await page.waitForSelector('.dashboard', { timeout: 10000 });
log('MODULE CREATED:', await page.locator('article.module-card', { hasText: '玩法原型' }).count());

// Open module view
await page.locator('article.module-card', { hasText: '玩法原型' }).click();
await page.waitForSelector('.module-view', { timeout: 10000 });
await shot('module-view');
log('MODULE VIEW:', (await page.locator('.module-hero h1').innerText()));

// Create page inside module
await page.locator('.module-hero-actions .btn-primary').click();
await page.waitForSelector('.page-view', { timeout: 10000 });
await page.waitForSelector('.bn-editor', { timeout: 20000 });
await page.waitForTimeout(500);

// Rename title
const title = page.locator('.page-title-input');
await title.click();
await title.press('Control+A');
await title.fill('一分钟玩法循环');
await page.waitForTimeout(900);
await shot('page-new');

// Write content
await page.locator('.bn-editor').click();
await page.keyboard.type('先让角色动起来，再考虑它为什么动。');
await page.keyboard.press('Enter');
await page.keyboard.type('今天只需要验证一件事：按下方向键，角色有没有反应。');
await page.waitForTimeout(1600);
log('SAVE:', await page.locator('.save-indicator').innerText());
await shot('page-written');

// Reload and verify
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.bn-editor', { timeout: 20000 });
await page.waitForTimeout(700);
log('TITLE PERSISTED:', await page.locator('.page-title-input').inputValue());
log('CONTENT PERSISTED:', (await page.locator('.bn-editor').innerText()).includes('按下方向键'));

// Settings
await page.locator('.nav-item').filter({ hasText: '设置' }).click();
await page.waitForSelector('.settings-view', { timeout: 10000 });
await shot('settings-appearance');
await page.locator('.preset-card').filter({ hasText: '纸间' }).click();
await page.waitForTimeout(700);
await shot('settings-paper');
await page.locator('.preset-card').filter({ hasText: '锻造台' }).click();
await page.waitForTimeout(500);

// Data tab
await page.locator('.settings-tab').filter({ hasText: '数据与备份' }).click();
await page.waitForTimeout(300);
await shot('settings-data');

// Search dialog
await page.keyboard.press('Control+K');
await page.waitForSelector('.search-panel', { timeout: 5000 });
await page.locator('.search-head input').fill('玩法');
await page.waitForTimeout(600);
log('SEARCH RESULTS:', await page.locator('.search-result').count());
await shot('search');
await page.keyboard.press('Escape');

// Mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.dashboard', { timeout: 15000 });
await page.waitForTimeout(500);
await shot('mobile-dashboard');
await page.locator('.topbar-menu').click();
await page.waitForTimeout(450);
await shot('mobile-sidebar');

log('ERRORS:', errors.length ? `\n${errors.join('\n')}` : 'none');
await browser.close();
