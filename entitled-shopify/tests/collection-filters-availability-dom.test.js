const assert = require('assert');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const filterScript = fs.readFileSync('assets/collection-filters.js');

function product(id, color, variants) {
  const sizes = [...new Set(variants.map(variant => variant.size))];
  const available = variants.some(variant => variant.available);
  const options = [{ name: 'Colour', values: [color] }, { name: 'Size', values: sizes }];
  const dataVariants = variants.map(variant => ({ available: variant.available, option1: color, option2: variant.size }));
  const card = `<div><article data-collection-product data-product-id="${id}"><span>${id}</span></article></div>`;
  return { id, title: `Product ${id}`, vendor: 'Entitled', product_type: 'Tee', tags: [`Color: ${color}`], available, options_with_values: options, variants: dataVariants, html: card };
}

const products = [
  product(1, 'Black', [{ size: 'M', available: true }, { size: 'L', available: false }]),
  product(2, 'Black', [{ size: 'L', available: false }]),
  product(3, 'Black', [{ size: 'M', available: true }]),
  product(4, 'Blue', [{ size: 'L', available: true }])
];

function html() {
  return `<!doctype html><html><body><header></header>
    <button data-filter-drawer-open aria-expanded="false">Filters <span data-filter-trigger-count hidden></span></button>
    <aside data-collection-filters data-collection-url="/collections/all">
      <div data-filter-combobox><input data-filter-search><button data-filter-dropdown-toggle></button><div data-filter-dropdown><div data-client-filter-groups></div><p data-filter-empty hidden></p></div></div>
      <span data-filter-selected-count></span><div data-active-filters hidden></div>
      <button data-client-filter-apply>Apply</button><button data-client-filter-clear>Clear</button><button data-filter-drawer-close>Close</button>
    </aside>
    <p data-collection-product-count>4 products</p>
    <div data-collection-product-list>${products.map(item => item.html).join('')}</div>
    <nav data-collection-pagination>Pagination</nav><pre id="result">PENDING</pre>
    <script>
      window.EntitledSizePreference={normalizeSizeLabel:value=>({m:'M',medium:'M'}[String(value).toLowerCase()]||String(value).toLowerCase())};
      window.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({collection:{products_count:4},products:${JSON.stringify(products)}})});
    </script>
    <script src="/filters.js" defer></script>
    <script>
      window.addEventListener('load', async function () {
        const result = document.getElementById('result');
        const wait = condition => new Promise((resolve, reject) => {
          let attempts = 0; const timer = setInterval(() => {
            if (condition()) { clearInterval(timer); resolve(); }
            else if (++attempts > 100) { clearInterval(timer); reject(new Error('Timed out')); }
          }, 20);
        });
        const ids = () => [...document.querySelectorAll('[data-collection-product]')].map(node => node.dataset.productId).join(',');
        const check = (group, value, checked) => {
          const input = [...document.querySelectorAll('[data-filter-value]')].find(node => node.dataset.filterGroupKey === group && node.dataset.filterValue === value);
          if (!input) throw new Error('Missing ' + group + ': ' + value);
          input.checked = checked; input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        try {
          await wait(() => document.querySelector('[data-filter-group-key="availability"]'));
          const availabilityInput = document.querySelector('[data-filter-group-key="availability"]');
          if (!availabilityInput.closest('label')) throw new Error('Availability input has no label');
          if (!document.querySelector('[data-filter-group-toggle][aria-expanded]')) throw new Error('Filter accordion state is not accessible');
          if (document.documentElement.scrollWidth > window.innerWidth) throw new Error('Horizontal overflow detected');
          if (location.search.includes('ec_filter_')) {
            await wait(() => document.querySelector('[data-collection-product-list]').classList.contains('is-loading') === false);
            const expected = location.search.includes('Medium') ? '1,3' : '4';
            if (ids() !== expected) throw new Error('URL restore did not enforce variant availability: ' + ids());
            result.textContent = 'PASS_URL'; return;
          }
          if (ids() !== '1,2,3,4') throw new Error('Default products changed');
          check('availability', 'Available now', true);
          document.querySelector('[data-client-filter-apply]').click();
          await wait(() => ids() === '1,3,4');
          if (!location.search.includes('ec_filter_availability=Available+now')) throw new Error('Availability missing from URL');
          if (!document.querySelector('[data-collection-pagination]').hidden) throw new Error('Filtered pagination remains active');
          check('size', 'L', true); check('color', 'Black', true);
          document.querySelector('[data-client-filter-apply]').click();
          await wait(() => ids() === '');
          if (!/No matching products/.test(document.querySelector('[data-collection-product-list]').textContent)) throw new Error('Empty state missing');
          check('availability', 'Available now', false); check('availability', 'Out of stock', true);
          document.querySelector('[data-client-filter-apply]').click();
          await wait(() => ids() === '1,2');
          if (new Set(ids().split(',')).size !== ids().split(',').length) throw new Error('Duplicate products rendered');
          if (!document.querySelector('[data-filter-chip-remove][data-filter-group-key="availability"]')) throw new Error('Availability chip missing');
          history.back();
          await wait(() => document.querySelector('[data-filter-group-key="availability"][data-filter-value="Available now"]').checked);
          await wait(() => ids() === '');
          document.querySelector('[data-client-filter-clear]').click();
          await wait(() => ids() === '1,2,3,4');
          if (location.search.includes('ec_filter_')) throw new Error('Clear all left filter query state');
          document.querySelector('[data-filter-drawer-open]').click();
          if (!document.querySelector('[data-collection-filters]').classList.contains('is-drawer-open')) throw new Error('Drawer did not open');
          result.textContent = 'PASS_INTERACTION';
        } catch (error) { result.textContent = 'FAIL: ' + error.message; }
      });
    </script></body></html>`;
}

async function runChrome(url, windowSize) {
  return new Promise((resolve, reject) => {
    const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--window-size=${windowSize}`, '--virtual-time-budget=5000', '--dump-dom', url]);
    let stdout = '';
    let stderr = '';
    chrome.stdout.on('data', chunk => { stdout += chunk; });
    chrome.stderr.on('data', chunk => { stderr += chunk; });
    chrome.on('error', reject);
    chrome.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Chrome exited ${code}`)));
  });
}

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/filters.js') return response.end(filterScript);
    response.setHeader('Content-Type', 'text/html');
    response.end(html());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/collections/all`;
  try {
    const interaction = await runChrome(base, '390,844');
    assert.match(interaction, /<pre id="result">PASS_INTERACTION<\/pre>/);
    const restored = await runChrome(`${base}?ec_filter_size=L&ec_filter_availability=Available+now`, '1440,900');
    assert.match(restored, /<pre id="result">PASS_URL<\/pre>/);
    const aliasRestored = await runChrome(`${base}?ec_filter_size=Medium&ec_filter_availability=Available+now`, '1440,900');
    assert.match(aliasRestored, /<pre id="result">PASS_URL<\/pre>/);
    console.log('collection filter availability DOM integration ok');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
