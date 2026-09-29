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

if (await fetch(base).then(() => true, () => false)) {
  console.error(`Something is already serving ${base}. Stop it or set E2E_PORT.`);
  process.exit(1);
}
execFileSync('npx', ['vite', 'build'], { cwd: web, stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: web, stdio: 'pipe', detached: true });

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

  const visible = (locator) => locator.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  await page.goto(base);
  const rows = page.getByTestId('account-row');
  check('first visit loads the five demo accounts', (await visible(page.getByText("You're looking at demo accounts."))) && (await rows.count()) === 5);
  await shot('01-demo-accounts');

  const slide = (value) => page.locator('#whatif').evaluate((input, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await slide(-1500);
  const topstep = rows.filter({ hasText: 'Topstep 50K Express' });
  check('what-if −$1,500 shows Topstep blowing', await visible(topstep.getByText('Blows the account')));
  check('what-if caps Tradeify at its daily loss lock', await visible(rows.filter({ hasText: 'Tradeify Growth 50K' }).getByText('Hits the daily loss lock')));
  await shot('02-whatif-minus-1500');
  await page.getByRole('button', { name: 'Reset' }).click();
  check('reset clears the what-if', (await page.getByTestId('whatif-value').textContent()) === '$0' && (await page.getByTestId('whatif-effects').count()) === 0);

  await rows.filter({ hasText: 'MFFU Rapid 50K' }).click();
  const panel = page.getByTestId('account-panel');
  check('clicking a row opens its panel', await visible(panel.getByRole('heading', { name: 'MFFU Rapid 50K' })));
  check('panel shows the next step', await visible(panel.getByText('Pass in 1 trading day')));
  check('panel draws the balance and floor chart', await visible(panel.locator('.ui-chart svg')));
  await shot('03-panel-overview');

  await panel.getByRole('tab', { name: /Days/ }).click();
  await panel.getByLabel('Net P&L').fill('600');
  await panel.getByRole('button', { name: 'Save day' }).click();
  check('typing a +$600 day passes the evaluation', await visible(panel.getByRole('button', { name: /^Add .* account$/ })));
  await shot('04-panel-passed');
  const dayCount = await panel.locator('tbody tr').count();
  await panel.locator('tbody tr').first().getByRole('button', { name: /^Remove/ }).click();
  check('removing a day drops it', (await panel.locator('tbody tr').count()) === dayCount - 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  check('Undo puts the day back', (await panel.locator('tbody tr').count()) === dayCount);

  await panel.getByRole('button', { name: 'Actions for MFFU Rapid 50K' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await panel.getByLabel('Account name').fill('MFFU Rapid #2');
  await panel.getByLabel('Account name').press('Enter');
  check('rename from the menu', await visible(rows.filter({ hasText: 'MFFU Rapid #2' })));
  await panel.getByRole('tab', { name: 'Rules' }).click();
  await panel.getByRole('button', { name: "Override this account's rules" }).click();
  await panel.getByLabel('Drawdown', { exact: true }).fill('abc');
  check('a bad rule override is refused, not saved', (await visible(panel.getByText('Not a valid amount, so the old one is kept'))) && (await visible(panel.getByText('$2,000 end-of-day trailing', { exact: false }).first())));
  await page.keyboard.press('Escape');

  await page.locator('input[type=file][accept*="json"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"accounts":[{}]}') });
  check('a broken backup is refused and nothing is replaced', (await visible(page.getByText('nothing was loaded'))) && (await rows.count()) === 5);

  await page.getByRole('link', { name: 'Calendar' }).first().click();
  check('calendar lists payout weeks', await visible(page.getByTestId('calendar-weeks').locator('.week').first()));
  await page.getByRole('button', { name: 'Averages used' }).click();
  await page.getByLabel('Your average day for TPT 50K PRO').fill(' ');
  check('a blank average leaves the calendar working', await visible(page.getByTestId('calendar-weeks').locator('.week').first()));
  await page.getByLabel('Your average day for TPT 50K PRO').fill('');
  await shot('05-calendar');

  await page.getByRole('link', { name: 'Import' }).first().click();
  await page.getByTestId('csv-input').setInputFiles(join(samples, 'tradovate-fills.csv'));
  check('import matches TPT50K-1 to the demo account', await visible(page.getByText('Matched before').first()));
  await shot('06-import-preview');
  await page.getByRole('button', { name: /^Import \d+ days? into/ }).click();
  check('import applies and reports per account', await visible(page.getByTestId('import-log').getByText(/TPT 50K PRO: added/)));
  await shot('07-import-done');

  await page.getByRole('link', { name: 'Tools' }).first().click();
  await page.getByLabel('Risk per trade').fill('500');
  check('position size: $500 risk, 20 ticks at $5 is 5 contracts', (await page.getByTestId('contracts').textContent()) === '5 contracts');
  await shot('08-tools');

  await page.getByRole('link', { name: 'Accounts' }).first().click();
  await page.getByRole('button', { name: 'Start with my own accounts' }).click();
  check('starting fresh clears the demo', await visible(page.getByText('No accounts yet')));
  await shot('09-empty');

  await page.getByRole('button', { name: 'Add an account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an account' });
  await dialog.getByLabel('Firm').selectOption({ label: 'Topstep' });
  await dialog.getByLabel('Name').fill('My Combine');
  await page.waitForTimeout(500);
  await shot('10-add-dialog');
  await dialog.getByRole('button', { name: 'Add account' }).click();
  check('adding an account opens its panel', await visible(panel.getByRole('heading', { name: 'My Combine' })));
  await panel.getByRole('tab', { name: /Days/ }).click();
  await panel.getByLabel('Date').fill('2026-09-01');
  await panel.getByLabel('Net P&L').fill('−250');
  await panel.getByRole('button', { name: 'Save day' }).click();

  await page.reload();
  check('accounts survive a reload', (await visible(rows.first().getByText('My Combine'))) && (await visible(rows.first().getByText('−$250.00'))) && (await rows.count()) === 1);

  await rows.first().click();
  await panel.getByRole('button', { name: 'Actions for My Combine' }).click();
  await page.getByRole('menuitem', { name: 'Delete account…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click();
  check('delete asks first, then removes', await visible(page.getByText('No accounts yet')));

  await page.getByRole('button', { name: 'Load demo accounts' }).click();
  check('load demo accounts from the empty state', (await rows.count()) === 5);

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.waitForTimeout(700);
  check('dark mode', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await shot('11-dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.waitForTimeout(900);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/#accounts`);
  check('phone: bottom tab bar', await visible(page.locator('.tabbar')));
  await page.waitForTimeout(300);
  await shot('12-phone-accounts');
  await rows.filter({ hasText: 'Topstep 50K Express' }).click();
  await page.waitForTimeout(300);
  await shot('13-phone-panel');
  await page.setViewportSize({ width: 1320, height: 1000 });

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
  try {
    process.kill(-server.pid);
  } catch {}
}

const failed = checks.filter((item) => !item.ok);
const summary = { ranAt: new Date().toISOString(), base, passed: checks.length - failed.length, failed: failed.length, checks };
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed} passed, ${summary.failed} failed. Artifacts in ${out}`);
exitCode = failed.length ? 1 : 0;
process.exit(exitCode);
