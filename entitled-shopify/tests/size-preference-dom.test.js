const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

let playwright;
try {
  playwright = require('playwright');
} catch (error) {
  throw new Error('Playwright is required for this executable DOM test. Set NODE_PATH to an existing Playwright installation.');
}

const themeRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(themeRoot, 'assets/size-preference.js'));
const baseStyleSource = fs.readFileSync(path.join(themeRoot, 'assets/style.css'));
const styleSource = fs.readFileSync(path.join(themeRoot, 'assets/entitled-overrides.css'));

function fixture() {
  const product = JSON.stringify({
    options: ['Color', 'Size'],
    options_with_values: [{ name: 'Color', values: ['Black', 'Blue'] }, { name: 'Size', values: ['M', 'L'] }],
    variants: [
      { id: 11, available: true, options: ['Black', 'M'] },
      { id: 12, available: true, options: ['Black', 'L'] },
      { id: 13, available: false, options: ['Blue', 'M'] },
      { id: 14, available: true, options: ['Blue', 'L'] }
    ]
  });
  return `<!doctype html><html><head><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/entitled-overrides.css"></head><body>
    <main id="PageContainer"><button id="opener" data-size-preference-open><span data-size-preference-control-label>Choose size</span></button>
      <div hidden data-product-options='[{"name":"Size","values":["S","M","L","XL","XXL"]}]' data-product-variants='[{"id":90,"available":true,"options":["S"]},{"id":91,"available":true,"options":["M"]},{"id":92,"available":true,"options":["L"]},{"id":93,"available":true,"options":["XL"]},{"id":94,"available":true,"options":["XXL"]}]'></div>
      <div id="cards">
        <article data-size-product data-product-options='[{"name":"Size","values":["M","L"]}]' data-product-variants='[{"id":1,"available":true,"options":["M"]}]'><p data-size-preference-status hidden></p></article>
        <article data-size-product data-product-options='[{"name":"Size","values":["M","L"]}]' data-product-variants='[{"id":2,"available":false,"options":["M"]},{"id":3,"available":true,"options":["L"]}]'><p data-size-preference-status hidden></p></article>
        <article data-size-product data-product-options='[{"name":"Size","values":["L"]}]' data-product-variants='[{"id":4,"available":true,"options":["L"]}]'><p data-size-preference-status hidden></p></article>
        <article data-size-product data-product-options='[{"name":"Color","values":["Black"]}]' data-product-variants='[{"id":5,"available":true,"options":["Black"]}]'><p data-size-preference-status hidden></p></article>
      </div>
      <div hidden data-product-options='[{"name":"Size","values":["${'X'.repeat(80)}"]}]' data-product-variants='[{"id":99,"available":true,"options":["${'X'.repeat(80)}"]}]'></div>
      <section data-size-product-page><p data-size-preference-product-status hidden></p><form id="AddToCartForm"><button id="AddToCart" type="submit">Add</button></form></section>
    </main>
    <div data-size-preference-root data-label-choose="Choose size" data-label-selected="Size: {{ size }}" data-status-available="Available {{ size }}" data-status-sold-out="Sold out {{ size }}" data-status-unavailable="Unavailable {{ size }}" data-status-one-size="One size" data-status-not-applicable="Not applicable" data-status-saved="Saved {{ size }}">
      <div class="size-preference__backdrop" data-size-preference-dialog role="dialog" aria-modal="true" aria-labelledby="SizePreferenceTitle" aria-describedby="SizePreferenceDescription" tabindex="-1" hidden>
        <div class="size-preference__panel">
          <button class="size-preference__close" data-size-preference-close type="button" aria-label="Close">Close</button>
          <span class="size-preference__eyebrow">Your fit</span>
          <h2 id="SizePreferenceTitle">What size do you usually wear?</h2>
          <p id="SizePreferenceDescription">Choose your usual size to personalize product availability.</p>
          <form data-size-preference-form><fieldset><legend class="visually-hidden">Choose your size</legend><div class="size-preference__choices" data-size-preference-choices></div></fieldset><div class="size-preference__actions"><button type="submit" class="size-preference__confirm needsclick" data-size-preference-confirm disabled>Save My Size</button></div></form>
        </div>
      </div><p data-size-preference-live></p>
    </div>
    <script>window.productData=${product}; window.__submits=0; document.getElementById('AddToCartForm').addEventListener('submit',e=>{e.preventDefault();window.__submits++});</script>
    <script src="/size-preference.js"></script>
  </body></html>`;
}

function emptyFixture() {
  return `<!doctype html><html><body><main id="PageContainer"><p>Contact us</p></main>
    <div data-size-preference-root><div data-size-preference-dialog role="dialog" aria-modal="true" tabindex="-1" hidden><button data-size-preference-close>Close</button><form data-size-preference-form><div data-size-preference-choices></div><button data-size-preference-confirm>Confirm</button></form></div><p data-size-preference-live></p></div>
    <script src="/size-preference.js"></script></body></html>`;
}

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/size-preference.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(scriptSource);
    } else if (request.url === '/style.css') {
      response.setHeader('Content-Type', 'text/css; charset=utf-8');
      response.end(baseStyleSource);
    } else if (request.url === '/entitled-overrides.css') {
      response.setHeader('Content-Type', 'text/css');
      response.end(styleSource);
    } else if (request.url === '/empty') {
      response.setHeader('Content-Type', 'text/html');
      response.end(emptyFixture());
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end(fixture());
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browserName = process.env.SIZE_PREFERENCE_BROWSER || 'chromium';
  const browserType = playwright[browserName];
  if (!browserType) throw new Error(`Unsupported SIZE_PREFERENCE_BROWSER: ${browserName}`);
  const launchOptions = { headless: true };
  if (browserName === 'chromium') launchOptions.executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
  const browser = await browserType.launch(launchOptions);
  try {
    const emptyPage = await browser.newPage();
    await emptyPage.goto(url + 'empty');
    await emptyPage.waitForTimeout(350);
    assert.strictEqual(await emptyPage.getAttribute('[data-size-preference-dialog]', 'hidden'), '', 'non-product pages must not prompt');
    await emptyPage.close();

    const activation = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await activation.goto(url);
    await activation.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    await activation.evaluate(() => {
      window.__preferenceEvents = 0;
      window.__sessionWrites = 0;
      document.addEventListener('entitled:size-preference-change', () => { window.__preferenceEvents += 1; });
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.indexOf('entitled:size-preference:') === 0) window.__sessionWrites += 1;
        return originalSetItem.call(this, key, value);
      };
    });
    const medium = activation.locator('[data-size-preference-choice][data-size-value="M"]');
    assert.strictEqual(await medium.getAttribute('type'), 'button', 'size choices must be semantic buttons');
    const mediumBox = await medium.boundingBox();
    assert.ok(mediumBox.width >= 44 && mediumBox.height >= 44, 'the full size button must be a 44px touch target');
    await medium.click({ position: { x: 2, y: 2 } });
    assert.strictEqual(await medium.getAttribute('aria-pressed'), 'true', 'the first edge tap must select immediately');
    assert.strictEqual(await activation.isEnabled('[data-size-preference-confirm]'), true, 'selection must enable Save immediately');
    assert.strictEqual(await activation.isVisible('[data-size-preference-dialog]'), true, 'selection must not close the popup');
    assert.strictEqual(await activation.evaluate(() => window.__preferenceEvents), 0, 'selection alone must not synchronize preference state');
    await activation.evaluate(() => {
      window.__sizeSelectionMutations = 0;
      const target = document.querySelector('[data-size-preference-choice][data-size-value="L"]');
      new MutationObserver(records => { window.__sizeSelectionMutations += records.length; }).observe(target, { attributes: true, attributeFilter: ['aria-pressed'] });
    });
    await activation.locator('[data-size-preference-choice][data-size-value="L"]').dispatchEvent('touchstart');
    await activation.locator('[data-size-preference-choice][data-size-value="L"]').dispatchEvent('touchend');
    await activation.locator('[data-size-preference-choice][data-size-value="L"]').click();
    assert.strictEqual(await activation.locator('[data-size-preference-choice][aria-pressed="true"]').count(), 1, 'touch plus click must select exactly once');
    assert.strictEqual(await activation.locator('[data-size-preference-choice][data-size-value="L"]').getAttribute('aria-pressed'), 'true');
    assert.strictEqual(await activation.evaluate(() => window.__sizeSelectionMutations), 1, 'touch plus click must execute one selection update');
    await activation.addScriptTag({ url: '/size-preference.js' });
    await activation.locator('[data-size-preference-confirm]').dblclick();
    await activation.waitForFunction(() => document.querySelector('[data-size-preference-dialog]').hidden);
    assert.strictEqual(await activation.evaluate(() => window.__preferenceEvents), 1, 'rapid Save activation must synchronize once');
    assert.strictEqual(await activation.evaluate(() => window.__sessionWrites), 2, 'Save must write completion and selected size once each');
    assert.deepStrictEqual(await activation.evaluate(() => JSON.parse(sessionStorage.getItem('entitled:size-preference:selected-filters:v1')).values), ['L'], 'Save must store the exact visibly selected size');
    await activation.close();

    const keyboard = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await keyboard.goto(url);
    await keyboard.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    await keyboard.focus('[data-size-preference-choice][data-size-value="M"]');
    await keyboard.keyboard.press('Enter');
    assert.strictEqual(await keyboard.getAttribute('[data-size-preference-choice][data-size-value="M"]', 'aria-pressed'), 'true', 'Enter must select a size');
    await keyboard.focus('[data-size-preference-choice][data-size-value="L"]');
    await keyboard.keyboard.press('Space');
    assert.strictEqual(await keyboard.getAttribute('[data-size-preference-choice][data-size-value="L"]', 'aria-pressed'), 'true', 'Space must select a size');
    await keyboard.focus('[data-size-preference-confirm]');
    await keyboard.keyboard.press('Enter');
    await keyboard.waitForFunction(() => document.querySelector('[data-size-preference-dialog]').hidden);
    await keyboard.close();

    const rerenderPage = await browser.newPage();
    await rerenderPage.goto(url + 'collections/all');
    await rerenderPage.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    await rerenderPage.click('[data-size-preference-close]');
    await rerenderPage.evaluate(() => document.dispatchEvent(new CustomEvent('entitled:collection-rendered')));
    await rerenderPage.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    await rerenderPage.click('[data-size-preference-close]');
    await rerenderPage.evaluate(() => document.dispatchEvent(new CustomEvent('shopify:section:load')));
    await rerenderPage.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    await rerenderPage.close();

    const legacySessionPage = await browser.newPage();
    await legacySessionPage.goto(url);
    await legacySessionPage.evaluate(() => sessionStorage.setItem('entitled:size-preference:session:v2', JSON.stringify({ version: 1, state: 'selected', value: 'M', display: 'M' })));
    await legacySessionPage.reload();
    await legacySessionPage.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    assert.deepStrictEqual(await legacySessionPage.evaluate(() => JSON.parse(sessionStorage.getItem('entitled:size-preference:selected-filters:v1')).values), ['M']);
    assert.strictEqual(await legacySessionPage.evaluate(() => sessionStorage.getItem('entitled:size-preference:prompt-completed:v1')), null, 'legacy scalar migration must not suppress required popup confirmation');
    await legacySessionPage.close();

    for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 1000 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(url);
      await page.evaluate(() => localStorage.setItem('entitled:size-preference:v1', JSON.stringify({ version: 1, state: 'skipped', value: '', display: '' })));
      await page.reload();
      assert.strictEqual(await page.evaluate(() => localStorage.getItem('entitled:size-preference:v1')), null, 'legacy persistent preference must be removed');
      await page.click('#opener');
      assert.strictEqual(await page.getAttribute('[data-size-preference-dialog]', 'hidden'), null);
      assert.strictEqual(await page.isDisabled('[data-size-preference-confirm]'), true);
      const visualDirectory = path.join(themeRoot, 'output', 'playwright');
      fs.mkdirSync(visualDirectory, { recursive: true });
      if (viewport.width === 375) {
        await page.locator('[data-size-preference-dialog]').screenshot({ path: path.join(visualDirectory, 'size-popup-mobile-unselected.png') });
      }
      const initialChoiceStyles = await page.$$eval('[data-size-preference-choice]', buttons => buttons.map(button => {
        const style = getComputedStyle(button);
        return { pressed: button.getAttribute('aria-pressed'), color: style.color, background: style.backgroundColor, borderColor: style.borderColor, borderWidth: style.borderWidth, opacity: style.opacity };
      }));
      console.log('size popup computed before selection', viewport.width, initialChoiceStyles[0]);
      assert.ok(initialChoiceStyles.every(style => style.pressed === 'false'), 'all sizes must start unselected');
      const allChoicesVisiblyUnselected = initialChoiceStyles.every(style => style.color === 'rgb(23, 24, 27)' && style.background === 'rgb(255, 255, 255)' && style.borderColor === 'rgb(23, 24, 27)' && style.opacity === '1');
      const disabledButtonStyle = await page.$eval('[data-size-preference-confirm]', button => {
        const style = getComputedStyle(button);
        return { color: style.color, fill: style.webkitTextFillColor, background: style.backgroundColor, opacity: style.opacity, border: style.borderColor, disabled: button.disabled };
      });
      const expectedDisabledButtonStyle = {
        color: 'rgb(90, 86, 80)',
        fill: 'rgb(90, 86, 80)',
        background: 'rgb(214, 209, 202)',
        opacity: '1',
        border: 'rgb(214, 209, 202)',
        disabled: true
      };
      assert.ok(await page.$eval('[data-size-preference-confirm]', button => {
        const rgb = value => (value.match(/\d+/g) || []).slice(0, 3).map(Number);
        const luminance = value => {
          const channels = rgb(value).map(channel => {
            const normalized = channel / 255;
            return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const style = getComputedStyle(button);
        const light = Math.max(luminance(style.color), luminance(style.backgroundColor));
        const dark = Math.min(luminance(style.color), luminance(style.backgroundColor));
        return (light + 0.05) / (dark + 0.05) >= 4.5;
      }), 'disabled Save text must meet WCAG AA contrast');
      await page.click('[data-size-preference-choice][data-size-value="M"]');
      if (viewport.width === 375) {
        await page.locator('[data-size-preference-dialog]').screenshot({ path: path.join(visualDirectory, 'size-popup-mobile-m-selected-save-enabled.png') });
        await page.locator('[data-size-preference-confirm]').screenshot({ path: path.join(visualDirectory, 'size-popup-mobile-save-enabled.png') });
      } else {
        await page.locator('[data-size-preference-dialog]').screenshot({ path: path.join(visualDirectory, 'size-popup-desktop-m-selected-save-enabled.png') });
      }
      assert.strictEqual(await page.getAttribute('[data-size-preference-choice][data-size-value="M"]', 'aria-pressed'), 'true');
      assert.strictEqual(await page.locator('[data-size-preference-choice][data-size-value="M"]').evaluate(button => button.classList.contains('is-selected')), true, 'selected class must be applied immediately');
      const selectedCheckmark = await page.$eval('[data-size-preference-choice][data-size-value="M"]', button => getComputedStyle(button, '::after').content);
      assert.strictEqual(await page.locator('[data-size-preference-choice][aria-pressed="true"]').count(), 1);
      const selectedChoiceStyle = await page.$eval('[data-size-preference-choice][data-size-value="M"]', button => {
        const style = getComputedStyle(button);
        return { color: style.color, fill: style.webkitTextFillColor, background: style.backgroundColor, border: style.border };
      });
      const enabledSaveStyle = await page.$eval('[data-size-preference-confirm]', button => {
        const style = getComputedStyle(button);
        return { color: style.color, fill: style.webkitTextFillColor, background: style.backgroundColor, opacity: style.opacity, disabled: button.disabled, fontSize: style.fontSize };
      });
      console.log('size popup computed after M selection', viewport.width, { selectedChoiceStyle, enabledSaveStyle });
      assert.ok(allChoicesVisiblyUnselected, 'all unselected sizes must be light with dark text and border');
      assert.deepStrictEqual(disabledButtonStyle, expectedDisabledButtonStyle, 'disabled Save my size must remain readable at mobile and desktop widths');
      assert.strictEqual(selectedCheckmark, '"✓"', 'selected size must show a checkmark');
      assert.deepStrictEqual(selectedChoiceStyle, { color: 'rgb(255, 255, 255)', fill: 'rgb(255, 255, 255)', background: 'rgb(23, 24, 27)', border: '2px solid rgb(91, 10, 25)' });
      assert.ok(await page.$$eval('[data-size-preference-choice]:not([aria-pressed="true"])', buttons => buttons.every(button => {
        const style = getComputedStyle(button);
        return style.color === 'rgb(23, 24, 27)' && style.backgroundColor === 'rgb(255, 255, 255)';
      })), 'other sizes must remain visibly unselected');
      assert.deepStrictEqual(enabledSaveStyle, { color: 'rgb(255, 255, 255)', fill: 'rgb(255, 255, 255)', background: 'rgb(23, 24, 27)', opacity: '1', disabled: false, fontSize: '16px' }, 'enabled Save my size must preserve its high-contrast primary state');
      for (const state of ['hover', 'focus', 'active']) {
        const save = page.locator('[data-size-preference-confirm]');
        if (state === 'hover') await save.hover();
        if (state === 'focus') await save.focus();
        if (state === 'active') {
          const box = await save.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
        }
        assert.deepStrictEqual(await save.evaluate(button => {
          const style = getComputedStyle(button);
          return { color: style.color, fill: style.webkitTextFillColor, background: style.backgroundColor, opacity: style.opacity };
        }), { color: 'rgb(255, 255, 255)', fill: 'rgb(255, 255, 255)', background: 'rgb(23, 24, 27)', opacity: '1' }, `Save must remain readable in ${state} state`);
        if (state === 'active') {
          await page.mouse.move(0, 0);
          await page.mouse.up();
        }
      }
      assert.ok(await page.$eval('[data-size-preference-confirm]', button => {
        const channels = value => (value.match(/\d+/g) || []).slice(0, 3).map(Number).map(channel => {
          const normalized = channel / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
        });
        const luminance = value => { const c = channels(value); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
        const style = getComputedStyle(button);
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) >= 4.5;
      }), 'enabled Save text must meet WCAG AA contrast');
      await page.click('[data-size-preference-choice][data-size-value="L"]');
      assert.deepStrictEqual(await page.$$eval('[data-size-preference-choice][aria-pressed="true"]', buttons => buttons.map(button => button.dataset.sizeValue)), ['L'], 'selecting L must move the single selected state from M to L');
      assert.deepStrictEqual(await page.$eval('[data-size-preference-confirm]', button => ({
        height: button.getBoundingClientRect().height,
        nowrap: getComputedStyle(button).whiteSpace,
        clipped: button.scrollWidth > button.clientWidth || button.scrollHeight > button.clientHeight
      })), { height: 48, nowrap: 'nowrap', clipped: false }, 'Save label must remain a readable, unclipped 44px+ touch target');
      assert.strictEqual(await page.locator('[data-size-preference-choice]').evaluateAll(buttons => buttons.every(button => button.dataset.sizeValue.length <= 64)), true, 'unsaveable catalogue labels must not render as choices');
      assert.strictEqual(await page.evaluate(() => document.querySelector('#PageContainer').inert || document.querySelector('#PageContainer').getAttribute('aria-hidden') === 'true'), true, 'background must be isolated');
      await page.focus('[data-size-preference-confirm]');
      await page.keyboard.press('Tab');
      assert.strictEqual(await page.evaluate(() => document.activeElement.hasAttribute('data-size-preference-close')), true, 'Tab must wrap inside the dialog');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'opener');
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'opener');
      assert.strictEqual(await page.evaluate(() => sessionStorage.getItem('entitled:size-preference:session:v2')), null, 'dismissal must not save a decision');
      await page.goto(url + 'collections/round-necks');
      await page.waitForSelector('[data-size-preference-dialog]:not([hidden])');
      await page.click('[data-size-preference-close]');
      assert.strictEqual(await page.evaluate(() => sessionStorage.getItem('entitled:size-preference:session:v2')), null, 'Close must not save a decision');
      await page.goto(url + 'collections/polos');
      await page.waitForSelector('[data-size-preference-dialog]:not([hidden])');
      assert.strictEqual(await page.locator('[data-size-preference-skip], [data-size-preference-clear]').count(), 0, 'initial popup must only expose size choices, Save, and Close');
      await page.click('[data-size-preference-close]');
      assert.strictEqual(await page.evaluate(() => sessionStorage.getItem('entitled:size-preference:session:v2')), null, 'Close must not save a decision');
      await page.goto(url + 'collections/shirts');
      await page.waitForSelector('[data-size-preference-dialog]:not([hidden])');
      await page.keyboard.press('Escape');
      const restoredBackground = await page.evaluate(() => ({ inert: document.querySelector('#PageContainer').inert, inertAttribute: document.querySelector('#PageContainer').getAttribute('inert'), ariaHidden: document.querySelector('#PageContainer').getAttribute('aria-hidden') }));
      assert.deepStrictEqual(restoredBackground, { inert: false, inertAttribute: null, ariaHidden: null }, 'background state must be restored');
      await page.close();
    }

    const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
    await page.goto(url);
    await page.evaluate(() => {
      sessionStorage.setItem('entitled:size-preference:selected-filters:v1', JSON.stringify({ version: 1, values: ['M'], displays: ['M'] }));
      sessionStorage.setItem('entitled:size-preference:prompt-completed:v1', 'true');
    });
    await page.reload();
    assert.deepStrictEqual(await page.$$eval('[data-size-preference-status]', nodes => nodes.map(node => node.getAttribute('data-size-state'))), ['available', 'sold_out', 'unavailable', 'not_applicable']);
    await page.evaluate(() => {
      const replacement = document.createElement('article');
      replacement.setAttribute('data-size-product', '');
      replacement.setAttribute('data-product-options', '[{"name":"Size","values":["M"]}]');
      replacement.setAttribute('data-product-variants', '[{"id":20,"available":true,"options":["M"]}]');
      replacement.innerHTML = '<p data-size-preference-status hidden></p>';
      document.getElementById('cards').replaceChildren(replacement);
      document.dispatchEvent(new CustomEvent('entitled:collection-rendered'));
    });
    assert.strictEqual(await page.getAttribute('[data-size-preference-status]', 'data-size-state'), 'available');

    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const color = document.createElement('select'); color.className = 'single-option-selector'; color.innerHTML = '<option>Black</option><option>Blue</option>'; color.value = 'Black';
      const size = document.createElement('select'); size.className = 'single-option-selector'; size.innerHTML = '<option>M</option><option>L</option>'; size.value = 'L';
      document.querySelector('[data-size-product-page]').append(color, size);
      window.jQuery = function (selector) {
        const nodes = typeof selector === 'string' ? Array.from(document.querySelectorAll(selector)) : [selector];
        function valueFor(node, value) { if (value === undefined) return node && node.value; node.value = value; return { trigger: name => node.dispatchEvent(new Event(name, { bubbles: true })) }; }
        return { each: cb => nodes.forEach((node, index) => cb.call(node, index)), val: value => valueFor(nodes[0], value), eq: index => ({ length: nodes[index] ? 1 : 0, val: value => valueFor(nodes[index], value) }) };
      };
      document.dispatchEvent(new CustomEvent('entitled:variant-selectors-ready'));
    });
    await page.waitForFunction(() => document.querySelectorAll('.single-option-selector')[1].value === 'M');
    assert.strictEqual(await page.evaluate(() => document.querySelectorAll('.single-option-selector')[0].value), 'Black');
    assert.strictEqual(await page.evaluate(() => window.__submits), 0);

    await page.evaluate(() => {
      const container = document.getElementById('PageContainer');
      container.setAttribute('aria-hidden', 'false');
      document.getElementById('opener').click();
      document.querySelector('[data-size-preference-close]').click();
    });
    await page.waitForFunction(() => document.getElementById('PageContainer').getAttribute('aria-hidden') === 'false');
    assert.strictEqual(await page.getAttribute('#PageContainer', 'aria-hidden'), 'false', 'pre-existing aria-hidden value must be restored exactly');
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('entitled:size-preference:selected-filters:v1')).values), ['M'], 'cancelling change-size must preserve selected filters');

    await page.evaluate(() => {
      document.querySelector('[data-size-product-page]').outerHTML = '<section data-size-product-page><p data-size-preference-product-status hidden></p><select class="single-option-selector"><option>Black</option><option>Blue</option></select><select class="single-option-selector"><option>L</option><option>M</option></select><form><button id="AddToCart" type="submit">Add</button></form></section>';
      document.dispatchEvent(new CustomEvent('shopify:section:load'));
    });
    await page.waitForFunction(() => document.querySelectorAll('.single-option-selector')[1].value === 'M');
    assert.strictEqual(await page.evaluate(() => document.querySelectorAll('.single-option-selector')[0].value), 'Black');

    const persistence = await browser.newPage();
    await persistence.goto(url);
    await persistence.evaluate(() => {
      sessionStorage.removeItem('entitled:size-preference:session:v2');
      sessionStorage.removeItem('entitled:size-preference:selected-filters:v1');
      sessionStorage.removeItem('entitled:size-preference:prompt-completed:v1');
    });
    await persistence.reload();
    await persistence.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    await persistence.click('[data-size-preference-choice][data-size-value="M"]');
    await persistence.click('[data-size-preference-confirm]');
    await persistence.reload();
    await persistence.waitForTimeout(350);
    assert.strictEqual(await persistence.getAttribute('[data-size-preference-dialog]', 'hidden'), '');
    assert.strictEqual(await persistence.textContent('[data-size-preference-control-label]'), 'Size: M');
    assert.strictEqual(await persistence.getAttribute('[data-size-preference-open]', 'aria-label'), 'Size: M');

    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } } });
    });
    await fallback.goto(url);
    await fallback.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    await fallback.click('[data-size-preference-choice][data-size-value="M"]');
    await fallback.click('[data-size-preference-confirm]');
    assert.strictEqual(await fallback.getAttribute('[data-size-preference-status]', 'data-size-state'), 'available');
    await fallback.evaluate(() => document.dispatchEvent(new CustomEvent('entitled:collection-rendered')));
    await fallback.waitForTimeout(350);
    assert.strictEqual(await fallback.getAttribute('[data-size-preference-dialog]', 'hidden'), '', 'memory completion must prevent AJAX prompt loops when storage is blocked');
    await fallback.reload();
    await fallback.waitForSelector('[data-size-preference-dialog]:not([hidden])');

    const hostile = await browser.newPage();
    await hostile.goto(url);
    await hostile.evaluate(() => sessionStorage.setItem('entitled:size-preference:session:v2', JSON.stringify({ version: 1, state: 'selected', value: 'M', display: '</span><img id="injected" src=x>' })));
    await hostile.reload();
    assert.strictEqual(await hostile.locator('#injected').count(), 0, 'stored labels must remain text, not markup');

    const explicit = await browser.newPage();
    await explicit.goto(url + '?variant=12');
    await explicit.evaluate(() => sessionStorage.setItem('entitled:size-preference:session:v2', JSON.stringify({ version: 1, state: 'selected', value: 'M', display: 'M' })));
    await explicit.reload();
    await explicit.evaluate(() => {
      const color = document.createElement('select'); color.className = 'single-option-selector'; color.innerHTML = '<option>Black</option>'; color.value = 'Black';
      const size = document.createElement('select'); size.className = 'single-option-selector'; size.innerHTML = '<option>M</option><option>L</option>'; size.value = 'L';
      document.querySelector('[data-size-product-page]').append(color, size);
      document.dispatchEvent(new CustomEvent('entitled:variant-selectors-ready'));
    });
    await explicit.waitForTimeout(300);
    assert.strictEqual(await explicit.evaluate(() => document.querySelectorAll('.single-option-selector')[1].value), 'L');
    console.log('size preference DOM integration ok');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
