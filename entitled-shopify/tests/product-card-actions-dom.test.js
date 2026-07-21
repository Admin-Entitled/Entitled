const assert = require('assert');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const script = fs.readFileSync('assets/size-preference.js');
function card(name, options, variants, url = '/products/test') {
  return `<article data-size-product data-product-url="${url}" data-product-options='${JSON.stringify(options)}' data-product-variants='${JSON.stringify(variants)}'><span>${name}</span><p data-size-preference-status hidden></p><div data-size-preference-card-action></div></article>`;
}
const cards = [
  card('available', [{ name: 'Size', values: ['M', 'L'] }], [{ id: 101, available: true, options: ['M'] }, { id: 102, available: true, options: ['L'] }]),
  card('sold', [{ name: 'Size', values: ['M', 'L'] }], [{ id: 201, available: false, options: ['M'] }, { id: 202, available: true, options: ['L'] }]),
  card('unavailable', [{ name: 'Size', values: ['L'] }], [{ id: 301, available: true, options: ['L'] }]),
  card('one-size', [{ name: 'Size', values: ['One Size'] }], [{ id: 401, available: true, options: ['One Size'] }]),
  card('ambiguous', [{ name: 'Size', values: ['M'] }, { name: 'Color', values: ['Black', 'Blue'] }], [{ id: 501, available: true, options: ['M', 'Black'] }, { id: 502, available: false, options: ['M', 'Blue'] }]),
  card('one-size-ambiguous', [{ name: 'Size', values: ['One Size'] }, { name: 'Color', values: ['Black', 'Blue'] }], [{ id: 511, available: true, options: ['One Size', 'Black'] }, { id: 512, available: false, options: ['One Size', 'Blue'] }]),
  card('no-size-ambiguous', [{ name: 'Color', values: ['Black', 'Blue'] }], [{ id: 521, available: true, options: ['Black'] }, { id: 522, available: false, options: ['Blue'] }]),
  card('error', [{ name: 'Size', values: ['M'] }], [{ id: 999, available: true, options: ['M'] }])
].join('');

function fixture(withPreference = true) {
  return `<!doctype html><html><body><main id="PageContainer"><span id="CartCount">0</span><div id="CartDrawer"></div><div id="cards">${cards}</div></main><div data-size-preference-root data-card-add-label="Add to cart" data-card-sold-out-label="Sold out" data-card-choose-options-label="Choose options" data-cart-add-url="/cart/add" data-status-available="Available {{ size }}" data-status-sold-out="Sold out in {{ size }}" data-status-unavailable="{{ size }} unavailable" data-status-not-applicable="Not applicable"><div data-size-preference-dialog hidden tabindex="-1"><button data-size-preference-close>Close</button><form data-size-preference-form><div data-size-preference-choices></div><button data-size-preference-confirm>Confirm</button><button data-size-preference-skip>Skip</button></form></div><p data-size-preference-live></p></div><script>
  ${withPreference ? "sessionStorage.setItem('entitled:size-preference:selected-filters:v1', JSON.stringify({version:1,values:['M'],displays:['M']}));sessionStorage.setItem('entitled:size-preference:prompt-completed:v1','true');" : "sessionStorage.removeItem('entitled:size-preference:selected-filters:v1');sessionStorage.removeItem('entitled:size-preference:prompt-completed:v1');"}
  window.__adds=[]; window.__loads=0; window.__drawerOpens=0;
  window.ShopifyAPI={addItemFromForm(form,success,error){const id=Number(new FormData(form).get('id'));window.__adds.push(id);setTimeout(()=>id===999?error({responseText:JSON.stringify({description:'Inventory changed'})}):success({variant_id:id}),50)}};
  window.ajaxCart={load(){window.__loads++;document.getElementById('CartCount').textContent=String(window.__loads);window.__drawerOpens++;}};
  </script><script src="/size.js"></script></body></html>`;
}

async function main() {
  const server = http.createServer((request, response) => { response.setHeader('Content-Type', request.url === '/size.js' ? 'application/javascript' : 'text/html'); response.end(request.url === '/size.js' ? script : fixture(request.url !== '/unset')); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      assert.strictEqual(await page.inputValue('article:nth-child(1) input[name="id"]'), '101');
      assert.strictEqual(await page.isDisabled('article:nth-child(2) button'), true);
      assert.strictEqual(await page.getAttribute('article:nth-child(2) [data-size-preference-card-action]', 'data-card-action-state'), 'sold_out');
      assert.strictEqual(await page.getAttribute('article:nth-child(3) [data-size-preference-card-action]', 'data-card-action-state'), 'unavailable');
      assert.strictEqual(await page.inputValue('article:nth-child(4) input[name="id"]'), '401');
      assert.strictEqual(await page.getAttribute('article:nth-child(5) [data-size-preference-card-action]', 'data-card-action-state'), 'choose_options');
      assert.strictEqual(await page.getAttribute('article:nth-child(6) [data-size-preference-card-action]', 'data-card-action-state'), 'choose_options');
      assert.strictEqual(await page.getAttribute('article:nth-child(7) [data-size-preference-card-action]', 'data-card-action-state'), 'choose_options');
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('entitled:size-filter-change', { detail: { values: [{ value: 'M', display: 'M' }, { value: 'L', display: 'L' }] } })));
      assert.strictEqual(await page.getAttribute('article:nth-child(1) [data-size-preference-card-action]', 'data-card-action-state'), 'choose_options', 'multiple sellable selected sizes must never pick an arbitrary variant');
      assert.strictEqual(await page.locator('article:nth-child(1) input[name="id"]').count(), 0);
      assert.strictEqual(await page.inputValue('article:nth-child(2) input[name="id"]'), '202', 'OR resolution may direct-add only when the selected sizes yield one exact sellable variant');
      assert.strictEqual(await page.textContent('article:nth-child(2) [data-size-preference-status]'), 'Available L', 'multi-size status must name only the size supporting its winning state');
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('entitled:size-filter-change', { detail: { values: [{ value: 'M', display: 'M' }] } })));
      await page.$eval('article:nth-child(1) form', form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      await page.waitForFunction(() => window.__loads === 1);
      assert.deepStrictEqual(await page.evaluate(() => window.__adds), [101]);
      assert.strictEqual(await page.textContent('#CartCount'), '1');
      assert.strictEqual(await page.evaluate(() => window.__drawerOpens), 1);
      await page.click('article:nth-child(8) button');
      await page.waitForSelector('article:nth-child(8) [role="alert"]');
      assert.strictEqual(await page.textContent('article:nth-child(8) [role="alert"]'), 'Inventory changed');
      assert.strictEqual(await page.isEnabled('article:nth-child(8) button'), true);
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('entitled:size-filter-change', { detail: { value: 'L', display: 'L' } })));
      assert.strictEqual(await page.inputValue('article:nth-child(1) input[name="id"]'), '102');
      await page.evaluate(() => {
        const replacement = document.querySelector('article:nth-child(1)').cloneNode(true);
        document.getElementById('cards').replaceChildren(replacement);
        document.dispatchEvent(new CustomEvent('entitled:collection-rendered'));
      });
      assert.strictEqual(await page.inputValue('article input[name="id"]'), '102');
      await page.close();
    }

    const unset = await browser.newPage();
    await unset.goto(`http://127.0.0.1:${server.address().port}/unset`);
    await unset.waitForSelector('article:nth-child(1) [data-size-preference-card-select]');
    await unset.click('article:nth-child(1) [data-size-preference-card-select]');
    await unset.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    assert.deepStrictEqual(await unset.evaluate(() => window.__adds), []);
    console.log('product card actions DOM integration ok');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
