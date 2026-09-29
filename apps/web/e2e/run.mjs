import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const samples = resolve(web, '../../packages/core/samples');
const out = join(here, 'artifacts');
const port = Number(process.env.E2E_PORT ?? 4179);
const base = `http://localhost:${port}`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

execFileSync('npx', ['vite', 'build'], { cwd: web, stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: web, stdio: 'pipe' });

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`preview server never answered on ${base}`);
}

let browser;
let exitCode = 0;
try {
  await waitForServer();
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1320, height: 1000 } });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  const shot = (name) => page.screenshot({ path: join(out, `${name}.png`), fullPage: true });

  await page.goto(base);
  check('empty state on first visit', await page.getByText('No accounts yet').isVisible());
  await shot('01-empty');

  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
  async function add(firm, planId, stage, name) {
    await page.getByRole('button', { name: '+ Add account' }).click();
    await page.getByLabel('Firm').selectOption({ label: firm });
    await page.getByLabel('Plan').selectOption(planId);
    await page.getByLabel('Stage').selectOption(stage);
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Add account', exact: true }).click();
    await page.getByTestId('account-detail').waitFor();
  }
  await add('Topstep', 'topstep/trading-combine/50000', 'eval', 'Topstep 50K Combine');
  await shot('02-account-added');
  await add('Take Profit Trader', 'take-profit-trader/test/50000', 'funded', 'TPT 50K PRO');
  await add('MyFundedFutures', 'my-funded-futures/rapid/50000', 'funded', 'MFFU Rapid 50K');
  check('three accounts in the list', (await page.locator('.list > button').count()) === 4);

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByTestId('csv-input').setInputFiles([
    join(samples, 'tradovate-fills.csv'),
    join(samples, 'topstepx-trades.csv'),
    join(samples, 'tradovate-cash-history.csv'),
  ]);
  await page.getByText('topstepx-trades.csv').waitFor();
  const tpt = page.getByLabel('Account for TPT50K-1');
  const mffu = page.getByLabel('Account for MFFU50K-2');
  const unnamed = page.getByLabel('Account for unnamed rows');
  await tpt.selectOption({ label: 'TPT 50K PRO' });
  for (let i = 0; i < (await mffu.count()); i += 1) await mffu.nth(i).selectOption({ label: 'MFFU Rapid 50K' });
  await unnamed.selectOption({ label: 'Topstep 50K Combine' });
  await shot('03-import-mapped');
  await page.getByRole('button', { name: 'Apply import' }).click();
  const log = await page.getByTestId('import-log').innerText();
  check('import log names every account', ['TPT 50K PRO', 'MFFU Rapid 50K', 'Topstep 50K Combine'].every((label) => log.includes(label)), log.replaceAll('\n', ' | '));
  check('cash history adds the payout', /MFFU Rapid 50K: added \d+ days.*1 payouts/.test(log));
  await shot('04-import-applied');

  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const cards = page.getByTestId('account-card');
  check('dashboard shows three account cards', (await cards.count()) === 3);
  const topstepCard = cards.filter({ hasText: 'Topstep 50K Combine' });
  const topstepText = await topstepCard.innerText();
  check('Topstep eval card states its consistency rule and when it passes', /Consistency 55%/.test(topstepText) && /Pass (in|now)|Passed/.test(topstepText), topstepText.replaceAll('\n', ' | '));
  const mffuText = await cards.filter({ hasText: 'MFFU Rapid 50K' }).innerText();
  check('MFFU funded card states its payout path', /Rapid daily payout/.test(mffuText), mffuText.replaceAll('\n', ' | '));
  await shot('05-dashboard');

  const slider = page.locator('#whatif');
  await slider.fill('-2500');
  await page.getByTestId('whatif-notes').first().waitFor();
  const down = await page.getByTestId('whatif-notes').allInnerTexts();
  check('a -$2,500 day blows at least one account', down.some((text) => /Blows the account|daily loss/.test(text)), down.join(' | '));
  await shot('06-whatif-down');
  await slider.fill('1500');
  const up = await page.getByTestId('whatif-notes').allInnerTexts();
  check('a +$1,500 day reports every included account', up.length === 3, up.join(' | '));
  await shot('07-whatif-up');

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const weeks = page.getByTestId('calendar-weeks');
  const hasWeeks = await weeks.isVisible().catch(() => false);
  check('calendar schedules at least one event', hasWeeks, hasWeeks ? (await weeks.innerText()).split('\n').slice(0, 4).join(' | ') : await page.locator('main').innerText());
  await shot('08-calendar');

  await page.reload();
  await page.getByTestId('account-card').first().waitFor();
  check('accounts survive a reload', (await page.getByTestId('account-card').count()) === 3);

  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
  await page.locator('.list > button', { hasText: 'Topstep 50K Combine' }).click();
  await page.getByLabel('Day', { exact: true }).fill('2026-09-15');
  await page.getByLabel('P&L').fill('-450');
  await page.getByRole('button', { name: 'Save day' }).click();
  check('a typed day lands in the table', (await page.getByTestId('account-detail').innerText()).includes('2026-09-15'));
  await shot('09-account-detail');

  const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
  check('PWA manifest is served', manifest.display === 'standalone');
  const sw = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? null);
  check('service worker is registered', sw?.endsWith('/sw.js'), String(sw));

  check('no console or page errors', errors.length === 0, errors.join(' | '));
  await context.tracing.stop({ path: join(out, 'trace.zip') });
} catch (error) {
  check('run finished without throwing', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close();
  server.kill();
}

const failed = checks.filter((item) => !item.ok);
const summary = { ranAt: new Date().toISOString(), base, passed: checks.length - failed.length, failed: failed.length, checks };
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed} passed, ${summary.failed} failed. Artifacts in ${out}`);
exitCode = failed.length ? 1 : 0;
process.exit(exitCode);
