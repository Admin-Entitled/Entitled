import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const projectRoot = process.cwd();
const appImage = path.join(projectRoot, 'release', 'Images OpenArt Processing-1.1.0.AppImage');
const fakeCli = path.join(projectRoot, 'tests', 'fixtures', 'fake-openart-cli.mjs');
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

interface Scenario {
  root: string;
  configRoot: string;
  productRoot: string;
  outputRoot: string;
  statePath: string;
}

async function createScenario(name: string): Promise<Scenario> {
  const runtimeRoot = path.join(projectRoot, 'artifacts', 'e2e-runtime');
  await fs.mkdir(runtimeRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(runtimeRoot, `${name}-`));
  const configRoot = path.join(root, 'config');
  const productRoot = path.join(root, 'Product input root');
  const product = path.join(productRoot, 'product 01');
  const outputRoot = path.join(root, 'Results');
  const statePath = path.join(root, 'fake-state.json');
  await fs.mkdir(product, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });
  await Promise.all(
    ['1-front.jpeg', '2-back.jpeg', '3-detail.jpeg', '4-label.jpeg'].map((name) =>
      fs.writeFile(path.join(product, name), onePixelPng),
    ),
  );
  await fs.mkdir(path.join(configRoot, 'images-openart-processing'), { recursive: true });
  await fs.writeFile(
    path.join(configRoot, 'images-openart-processing', 'preferences.json'),
    JSON.stringify({ inputRoot: productRoot, outputRoot }, null, 2),
  );
  await fs.writeFile(
    statePath,
    JSON.stringify({ generationCalls: 0, statusCalls: 0, commands: [] }),
  );
  return { root, configRoot, productRoot, outputRoot, statePath };
}

async function launch(
  scenario: Scenario,
  mode: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: appImage,
    args: ['--no-sandbox'],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: scenario.configRoot,
      OPENART_CLI_PATH: fakeCli,
      OPENART_FAKE_STATE: scenario.statePath,
      OPENART_UPLOAD_CACHE: path.join(scenario.root, 'upload-cache.json'),
      OPENART_FAKE_MODE: mode,
      OPENART_FAKE_CLI_E2E: '1',
      OPENART_FAKE_UPLOAD_DELAY_MS: '2000',
      OPENART_CLI_POLL_INTERVAL_MS: '500',
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.folder input').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const inputs = [...document.querySelectorAll<HTMLInputElement>('.folder input')];
    return inputs.length === 2 && inputs.every((input) => Boolean(input.value));
  });
  return { app, page };
}

async function prepare(page: Page) {
  await page.getByRole('button', { name: 'Scan Products' }).click();
  await page.getByText('product 01', { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll('.source-thumbnails img').length === 4,
  );
  await page.getByRole('button', { name: 'Validate Batch' }).click();
  await page.locator('.success-panel, .error-panel').first().waitFor({ timeout: 30_000 });
  const validationText = await page.locator('.success-panel, .error-panel').first().innerText();
  if (!validationText.includes('Batch validation passed'))
    throw new Error(`Packaged local validation failed: ${validationText}`);
}

async function state(scenario: Scenario) {
  return JSON.parse(await fs.readFile(scenario.statePath, 'utf8')) as {
    generationCalls: number;
    statusCalls: number;
    commands: string[];
  };
}

async function confirm(page: Page, doubleClick = false) {
  await page.getByRole('button', { name: 'Generate Selected' }).click();
  await page.getByRole('heading', { name: 'Generate selected images?' }).waitFor();
  if (doubleClick) {
    await page.getByRole('button', { name: 'Generate Images' }).click({ clickCount: 2 });
  } else {
    await page.getByRole('button', { name: 'Generate Images' }).click();
  }
}

async function happyRestartScenario() {
  const scenario = await createScenario('restart');
  let launched = await launch(scenario, 'success');
  await prepare(launched.page);
  await launched.page.getByRole('button', { name: 'Generate Selected' }).click();
  assert.equal((await state(scenario)).generationCalls, 0, 'opening confirmation submitted work');
  await launched.page.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(
    (await state(scenario)).generationCalls,
    0,
    'cancelling confirmation submitted work',
  );
  await confirm(launched.page, true);
  await launched.page
    .getByTestId('current-run')
    .getByText(/Submitting|Submitted|Queued|Processing/)
    .first()
    .waitFor();
  await launched.page
    .getByTestId('current-run')
    .locator('.current-job')
    .getByText('Processing', { exact: true })
    .waitFor({ timeout: 45_000 });
  await launched.app.close();
  launched = await launch(scenario, 'success');
  await launched.page
    .getByTestId('current-run')
    .getByText('Completed', { exact: true })
    .waitFor({ timeout: 20_000 });
  assert.equal(
    (await state(scenario)).generationCalls,
    1,
    'restart or double-click duplicated submission',
  );
  await fs.access(path.join(scenario.outputRoot, 'product 01', '01.png'));
  await launched.page.getByTestId('current-run').locator('img.job-preview').waitFor();
  await fs.mkdir(path.join(projectRoot, 'artifacts', 'e2e'), { recursive: true });
  await launched.page.screenshot({
    path: path.join(projectRoot, 'artifacts', 'e2e', 'packaged-current-run.png'),
    fullPage: true,
  });
  await launched.app.close();
}

await fs.chmod(fakeCli, 0o755);
await fs.access(appImage);
await happyRestartScenario();
console.log(
  'Packaged fake-CLI happy-path E2E passed: confirmation, one submission, lifecycle, finalisation, restart, and no real OpenArt endpoint.',
);
process.exit(0);
