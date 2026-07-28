const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const sizeScript = fs.readFileSync(path.join(root, 'assets/size-preference.js'));
const filterScript = fs.readFileSync(path.join(root, 'assets/collection-filters.js'));

function card(id, brand, sizes, type = 'Tee', color = 'Black') {
  const options = sizes.length ? [{ name: 'Size', values: sizes.map(size => size.value) }] : [{ name: 'Color', values: ['Black'] }];
  const variants = sizes.map((size, index) => ({ id: id * 10 + index, available: size.available, options: [size.value], option1: size.value }));
  return `<div><article data-collection-product data-size-product data-product-id="${id}" data-product-vendor="${brand}" data-product-type="${type}" data-product-tags='["Color: ${color}"]' data-product-options='${JSON.stringify(options)}' data-product-variants='${JSON.stringify(variants)}'><span>${brand}-${id}</span><p data-size-preference-status hidden></p></article></div>`;
}

const products = [
  { id: 1, vendor: 'A', type: 'Tee', color: 'Black', sizes: [{ value: 'M', available: true }] },
  { id: 2, vendor: 'A', type: 'Polo', color: 'Blue', sizes: [{ value: 'M', available: false }, { value: 'L', available: true }] },
  { id: 3, vendor: 'B', type: 'Tee', color: 'Black', sizes: [{ value: 'L', available: true }] },
  { id: 4, vendor: 'B', type: 'Accessory', color: 'Black', sizes: [] }
];

function html() {
  const cards = products.map(product => card(product.id, product.vendor, product.sizes, product.type, product.color)).join('');
  return `<!doctype html><html><body><header></header><main id="PageContainer">
    <button data-filter-drawer-open>Filters <span data-filter-trigger-count hidden></span></button>
    <button id="opener" data-size-preference-open><span data-size-preference-control-label>Choose size</span></button>
    <aside data-collection-filters data-collection-url="/collections/all"><div data-filter-combobox><input data-filter-search><button data-filter-dropdown-toggle></button><div data-filter-dropdown><div data-client-filter-groups></div><p data-filter-empty hidden></p></div></div><span data-filter-selected-count></span><div data-active-filters hidden></div><button data-client-filter-apply>Apply</button><button data-client-filter-clear>Clear</button></aside>
    <p data-collection-product-count>4 products</p><div data-collection-product-list>${cards}</div><nav data-collection-pagination>Pagination</nav>
    </main><div data-size-preference-root data-status-available="Available {{ size }}" data-status-sold-out="Sold out in {{ size }}" data-status-unavailable="{{ size }} unavailable" data-status-not-applicable="Not applicable"><div data-size-preference-dialog aria-modal="true" tabindex="-1" hidden><button data-size-preference-close>Close</button><form data-size-preference-form><div data-size-preference-choices></div><button data-size-preference-confirm>Confirm</button></form></div><p data-size-preference-live></p></div>
    <script>window.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({collection:{products_count:4},products:${JSON.stringify(products.map(product => ({ id: product.id, vendor: product.vendor, product_type: product.type, tags: ['Color: ' + product.color], options_with_values: product.sizes.length ? [{ name: 'Size', values: product.sizes.map(size => size.value) }] : [{ name: 'Color', values: ['Black'] }], variants: product.sizes.map((size,index)=>({id:product.id*10+index,available:size.available,option1:size.value,options:[size.value]})), html: card(product.id, product.vendor, product.sizes, product.type, product.color) })))} })});</script>
    <script src="/size.js"></script><script src="/filters.js"></script></body></html>`;
}

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/size.js') return response.end(sizeScript);
    if (request.url === '/filters.js') return response.end(filterScript);
    response.setHeader('Content-Type', 'text/html'); response.end(html());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', error => console.error(error));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      window.__preferenceEvents = 0;
      window.__filterEvents = 0;
      document.addEventListener('entitled:size-preference-change', () => { window.__preferenceEvents += 1; });
      document.addEventListener('entitled:size-filter-change', () => { window.__filterEvents += 1; });
    });
    assert.strictEqual(await page.getAttribute('[data-size-preference-dialog]', 'hidden'), '', 'prompt must stay hidden until explicitly opened');
    await page.click('#opener');
    await page.waitForSelector('[data-size-preference-dialog]:not([hidden])');
    await page.click('[data-size-preference-choice][data-size-value="M"]');
    await page.click('[data-size-preference-confirm]');
    await page.waitForFunction(() => document.querySelector('[data-filter-group-key="size"][value="M"]').checked);
    assert.strictEqual(await page.getAttribute('[data-filter-group-key="size"][value="M"]', 'type'), 'checkbox');
    assert.deepStrictEqual(await page.evaluate(() => [window.__preferenceEvents, window.__filterEvents]), [1, 0], 'preference-driven filter sync must not loop');
    assert.strictEqual(await page.textContent('[data-filter-trigger-count]'), '1');
    assert.deepStrictEqual(await page.$$eval('[data-collection-product]', nodes => nodes.map(node => node.dataset.productId)), ['1', '2', '3', '4']);
    assert.deepStrictEqual(await page.$$eval('[data-size-preference-status]', nodes => nodes.map(node => node.dataset.sizeState)), ['available', 'sold_out', 'unavailable', 'not_applicable']);
    await page.click('[data-client-filter-apply]');
    assert.strictEqual(await page.textContent('[data-collection-product-count]'), '4 products');
    assert.strictEqual(await page.isVisible('[data-collection-pagination]'), true);
    await page.check('[data-filter-group-key="size"][value="L"]');
    assert.deepStrictEqual(await page.$$eval('[data-filter-group-key="size"]:checked', nodes => nodes.map(node => node.value)), ['L', 'M']);
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('entitled:size-preference:selected-filters:v1')).values), ['M', 'L']);
    assert.strictEqual(await page.textContent('[data-filter-trigger-count]'), '2');
    assert.deepStrictEqual(await page.$$eval('[data-filter-chip-remove][data-filter-group-key="size"]', nodes => nodes.map(node => node.getAttribute('data-filter-value'))), ['L', 'M']);
    assert.deepStrictEqual(await page.evaluate(() => [window.__preferenceEvents, window.__filterEvents]), [2, 1], 'one filter change must produce one preference update');
    await page.click('[data-filter-chip-remove][data-filter-group-key="size"][data-filter-value="M"]');
    assert.deepStrictEqual(await page.$$eval('[data-filter-group-key="size"]:checked', nodes => nodes.map(node => node.value)), ['L']);
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('entitled:size-preference:selected-filters:v1')).values), ['L']);
    assert.strictEqual(await page.textContent('[data-filter-trigger-count]'), '1');
    await page.check('[data-filter-group-key="brand"][value="A"]');
    await page.click('[data-client-filter-apply]');
    assert.deepStrictEqual(await page.$$eval('[data-collection-product]', nodes => nodes.map(node => node.dataset.productId)), ['1', '2'], 'non-size filters must still match products');
    await page.click('[data-client-filter-clear]');
    await page.check('[data-filter-group-key="color"][value="Blue"]');
    await page.check('[data-filter-group-key="type"][value="Polo"]');
    await page.click('[data-client-filter-apply]');
    assert.deepStrictEqual(await page.$$eval('[data-collection-product]', nodes => nodes.map(node => node.dataset.productId)), ['2'], 'type and colour filters must retain AND semantics');
    await page.click('[data-client-filter-clear]');
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('entitled:size-preference:selected-filters:v1')).values), []);
    assert.strictEqual(await page.evaluate(() => sessionStorage.getItem('entitled:size-preference:prompt-completed:v1')), 'true');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('entitled:collection-rendered')));
    await page.waitForTimeout(350);
    assert.strictEqual(await page.getAttribute('[data-size-preference-dialog]', 'hidden'), '', 'clear and AJAX render must not reopen a completed popup');
    assert.deepStrictEqual(await page.$$eval('[data-collection-product]', nodes => nodes.map(node => node.dataset.productId)), ['1', '2', '3', '4']);

    await page.check('[data-filter-group-key="size"][value="M"]');
    await page.check('[data-filter-group-key="size"][value="L"]');
    await page.goto(`http://127.0.0.1:${server.address().port}/?sort_by=price-ascending&page=2`);
    await page.waitForFunction(() => document.querySelectorAll('input[data-filter-group-key="size"]:checked').length === 2);
    assert.deepStrictEqual(await page.$$eval('input[data-filter-group-key="size"]:checked', nodes => nodes.map(node => node.value)), ['L', 'M'], 'sorting and pagination navigation must restore all sizes');
    assert.strictEqual(await page.getAttribute('[data-size-preference-dialog]', 'hidden'), '', 'sorting and pagination must not reopen a completed popup');

    const fresh = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await fresh.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.strictEqual(await fresh.getAttribute('[data-size-preference-dialog]', 'hidden'), '', 'fresh sessions must not auto-open the popup');
    await fresh.close();
    console.log('size preference filter DOM integration ok');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
