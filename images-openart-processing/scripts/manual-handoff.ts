import { _electron as electron } from '@playwright/test';

const app = await electron.launch({
  executablePath: `${process.cwd()}/release/Images OpenArt Processing-1.1.0.AppImage`,
  args: ['--no-sandbox'],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForFunction(() => {
  const values = [...document.querySelectorAll<HTMLInputElement>('.folder input')].map((input) => input.value);
  return values.length === 2 && values.every(Boolean);
});
await page.getByRole('button', { name: 'Scan Products' }).click({ timeout: 120_000 });
await page.waitForTimeout(5_000);
if (!(await page.getByText('product 01', { exact: true }).count())) {
  throw new Error(`Packaged scan did not produce a product row: ${await page.locator('.status-message').innerText()}`);
}
await page.getByRole('button', { name: 'Validate Batch' }).click();
await page.getByText('Batch validation passed', { exact: false }).waitFor({ timeout: 120_000 });
console.log('READY FOR ONE MANUAL GENERATION');
console.log((await page.locator('.product-review').innerText()).slice(0, 5000));
console.log('Generate Selected remains available; this harness will not click it.');
await new Promise<void>(() => undefined);
