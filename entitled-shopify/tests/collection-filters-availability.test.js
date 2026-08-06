const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('assets/collection-filters.js', 'utf8');
const sorting = fs.readFileSync('snippets/collection-sorting.liquid', 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found`);

  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`${name} function is not balanced`);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  `${extractFunction('matchesVariantAvailability')}\nthis.matchesVariantAvailability = matchesVariantAvailability;`,
  sandbox
);

const matches = sandbox.matchesVariantAvailability;
const normalizeSize = value => ({ m: 'M', medium: 'M' }[String(value).toLowerCase()] || String(value).toLowerCase());
const product = {
  available: true,
  options_with_values: [
    { name: 'Colour', values: ['Black', 'Blue'] },
    { name: 'Size', values: ['M', 'L'] }
  ],
  variants: [
    { available: true, option1: 'Black', option2: 'M' },
    { available: false, option1: 'Black', option2: 'L' },
    { available: true, option1: 'Blue', option2: 'L' }
  ]
};

assert.strictEqual(matches(product, { size: ['L'], color: [], availability: [] }), true, 'size alone must retain the existing non-hiding behaviour');
assert.strictEqual(matches(product, { size: ['L'], color: ['Black'], availability: ['Available now'] }), false, 'a different available variant must not satisfy the selected size and colour');
assert.strictEqual(matches(product, { size: ['L'], color: ['Black'], availability: ['Out of stock'] }), true, 'out of stock must match when all scoped variants are unavailable');
assert.strictEqual(matches(product, { size: ['L'], color: ['Blue'], availability: ['Available now'] }), true, 'the same available variant must satisfy size, colour, and availability');
assert.strictEqual(matches(product, { size: ['M', 'L'], color: ['Black'], availability: ['Available now'] }), true, 'multiple sizes must use OR semantics within the size group');
assert.strictEqual(matches(product, { size: [], color: [], availability: ['Available now'] }), true, 'available now without variant options must use any purchasable variant');
assert.strictEqual(matches(product, { size: [], color: [], availability: ['Out of stock'] }), false, 'mixed availability is not out of stock when any matching variant is purchasable');
assert.strictEqual(matches(product, { size: ['L'], color: ['Black'], availability: ['Available now', 'Out of stock'] }), true, 'availability options must use OR semantics');
assert.strictEqual(matches({ available: false, options_with_values: [], variants: [{ available: false }] }, { size: [], color: [], availability: ['Out of stock'] }), true, 'fully sold-out products must match out of stock');
assert.strictEqual(matches({ available: true, options_with_values: [], variants: [{ available: true }] }, { size: [], color: [], availability: ['Available now'] }), true, 'continue-selling variants must follow variant.available');
assert.strictEqual(matches({ available: true, options_with_values: [{ name: 'Size' }], variants: [{ available: true, option1: 'Medium' }] }, { size: ['M'], color: [], availability: ['Available now'] }, normalizeSize), true, 'availability matching must reuse size aliases');

assert.ok(/key: 'availability', label: 'Availability'/.test(source), 'Availability must use the existing generated filter-group UI');
assert.ok(/'Available now': 0/.test(source) && /'Out of stock': 0/.test(source), 'Availability must expose both required options');
assert.ok(/FILTER_QUERY_PREFIX/.test(source), 'custom filter query parameters must be namespaced');
assert.ok(/history\.pushState/.test(source), 'applied filter state must be written to browser history');
assert.ok(/addEventListener\('popstate'/.test(source), 'back and forward navigation must restore filter state');
assert.ok(/restoreSelectionsFromUrl/.test(source), 'filter state must restore from the collection URL');
assert.ok(/new URLSearchParams\(window\.location\.search\)/.test(sorting), 'sorting must preserve repeated custom filter parameters');
assert.ok(/searchParams\.delete\('page'\)/.test(source), 'changing filters must reset stale pagination state');
assert.ok(/function clearFilters\(\) \{[\s\S]*?applyGeneration \+= 1;[\s\S]*?setProductListLoading\(false\)/.test(source), 'clear all must invalidate an in-flight filtered render');

console.log('collection filter availability logic ok');
