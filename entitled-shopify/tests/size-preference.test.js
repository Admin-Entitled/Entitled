const assert = require('assert');
const fs = require('fs');

const {
  STORAGE_KEY,
  PROMPT_COMPLETED_KEY,
  LEGACY_SESSION_KEY,
  LEGACY_STORAGE_KEY,
  normalizeSizeLabel,
  findSizeOptionIndex,
  classifyPreferredSize,
  resolvePreferredVariant,
  createStorageAdapter,
  hasValidSessionSizePreference,
  resolveProductCardAction
} = require('../assets/size-preference.js');

function product(options, variants) {
  return { options_with_values: options, variants: variants };
}

function variant(id, available, options) {
  return {
    id: id,
    available: available,
    options: options,
    option1: options[0],
    option2: options[1],
    option3: options[2]
  };
}

// Canonical aliases are case-insensitive and whitespace-tolerant. Unknown
// catalogue labels remain comparable rather than being discarded.
[
  [' S ', 'S'],
  ['small', 'S'],
  ['M', 'M'],
  [' Medium ', 'M'],
  ['large', 'L'],
  ['xL', 'XL'],
  ['Extra   Large', 'XL'],
  ['x-large', 'XL'],
  ['2XL', 'XXL'],
  ['XX-Large', 'XXL'],
  ['double xl', 'XXL'],
  ['  Tall   Medium ', 'tall medium']
].forEach(function (testCase) {
  assert.strictEqual(normalizeSizeLabel(testCase[0]), testCase[1]);
});
assert.strictEqual(normalizeSizeLabel(null), '');
assert.strictEqual(normalizeSizeLabel('M'.repeat(65)), '');

// Size must be found by its actual option name, never assumed to be option 1.
assert.strictEqual(findSizeOptionIndex([{ name: 'Size' }, { name: 'Color' }]), 0);
assert.strictEqual(findSizeOptionIndex([{ name: 'Color' }, { name: ' size ' }]), 1);
assert.strictEqual(findSizeOptionIndex([{ name: 'Color' }, { name: 'Style' }, { name: 'SIZE' }]), 2);
assert.strictEqual(findSizeOptionIndex([{ name: 'Color' }]), -1);

const multiOption = product(
  [
    { name: 'Color', values: ['Black', 'White'] },
    { name: 'Size', values: ['Small', 'Medium', 'Tall Medium'] }
  ],
  [
    variant(1, true, ['Black', 'Small']),
    variant(2, true, ['Black', 'Medium']),
    variant(3, false, ['White', 'Medium']),
    variant(4, false, ['Black', 'Tall Medium']),
    variant(5, false, ['White', 'Tall Medium'])
  ]
);

assert.deepStrictEqual(classifyPreferredSize(multiOption, 'm'), {
  state: 'available',
  display: 'Medium',
  optionIndex: 1
});
assert.deepStrictEqual(classifyPreferredSize(multiOption, ' tall  medium '), {
  state: 'sold_out',
  display: 'Tall Medium',
  optionIndex: 1
});
assert.deepStrictEqual(classifyPreferredSize(multiOption, 'XXL'), {
  state: 'unavailable',
  display: 'XXL',
  optionIndex: 1
});

// Duplicate aliases do not change the result: any sellable matching variant
// makes the preference available.
const duplicateLabels = product(
  [{ name: 'Size', values: ['M', 'Medium'] }],
  [variant(10, false, ['M']), variant(11, true, ['Medium'])]
);
assert.strictEqual(classifyPreferredSize(duplicateLabels, 'm').state, 'available');

// Products without a named Size option and one-size products are not
// applicable; unrelated option values must never be interpreted as sizes.
const noSize = product(
  [{ name: 'Color', values: ['Medium Blue'] }],
  [variant(20, true, ['Medium Blue'])]
);
const oneSize = product(
  [{ name: 'Size', values: ['One Size'] }],
  [variant(21, true, ['One Size'])]
);
assert.deepStrictEqual(classifyPreferredSize(noSize, 'M'), {
  state: 'not_applicable',
  display: '',
  optionIndex: -1
});
assert.deepStrictEqual(classifyPreferredSize(oneSize, 'M'), {
  state: 'not_applicable',
  display: 'One Size',
  optionIndex: 0
});
assert.strictEqual(classifyPreferredSize(product(
  [{ name: 'Size', values: ['OSFA'] }],
  [variant(22, true, ['OSFA'])]
), 'M').state, 'not_applicable');

// Explicit variant intent always wins, including a sold-out explicit variant.
assert.strictEqual(resolvePreferredVariant({
  product: multiOption,
  preferredSize: 'M',
  explicitVariantId: '3',
  selectedOptions: ['Black', 'Small']
}).id, 3);

// Compatible non-size choices are preserved while selecting an available
// preferred size. A resolver must not silently switch color/style.
assert.strictEqual(resolvePreferredVariant({
  product: multiOption,
  preferredSize: 'M',
  selectedOptions: ['Black', 'Small']
}).id, 2);
assert.strictEqual(resolvePreferredVariant({
  product: multiOption,
  preferredSize: 'M',
  selectedOptions: ['White', 'Small']
}), null);
assert.strictEqual(resolvePreferredVariant({
  product: multiOption,
  preferredSize: 'Tall Medium',
  selectedOptions: ['Black', 'Small']
}), null);
assert.strictEqual(resolvePreferredVariant({
  product: noSize,
  preferredSize: 'M',
  selectedOptions: ['Medium Blue']
}), null);

function memoryStorage(initial) {
  const values = Object.assign({}, initial || {});
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; }
  };
}

const storage = memoryStorage();
const adapter = createStorageAdapter(storage);
assert.strictEqual(adapter.isPromptCompleted(), false);
assert.deepStrictEqual(adapter.read().values, []);
assert.strictEqual(adapter.complete(' Medium '), true);
assert.strictEqual(adapter.isPromptCompleted(), true);
assert.deepStrictEqual(adapter.read().values, ['M']);
assert.deepStrictEqual(adapter.read().displays, ['Medium']);
assert.strictEqual(adapter.setFilters(['M', ' Medium ', 'L', 'L']), true);
assert.deepStrictEqual(adapter.read().values, ['M', 'L'], 'selected sizes must be normalized and deduplicated');
assert.strictEqual(adapter.clear(), true);
assert.deepStrictEqual(adapter.read().values, []);
assert.strictEqual(adapter.isPromptCompleted(), true, 'clearing filters must not clear popup completion');
assert.strictEqual(adapter.select(' Medium '), true);
assert.strictEqual(adapter.read().value, 'M');
assert.strictEqual(hasValidSessionSizePreference(adapter.read()), true);
assert.strictEqual(hasValidSessionSizePreference({ values: ['M'] }), true);
assert.strictEqual(storage.getItem(PROMPT_COMPLETED_KEY), 'true');

const legacySessionStorage = memoryStorage();
legacySessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify({ version: 1, state: 'selected', value: 'Medium', display: 'Medium' }));
const migratedAdapter = createStorageAdapter(legacySessionStorage);
assert.deepStrictEqual(migratedAdapter.read().values, ['M']);
assert.strictEqual(migratedAdapter.isPromptCompleted(), false, 'legacy filter state must not imply popup confirmation');
assert.strictEqual(legacySessionStorage.getItem(LEGACY_SESSION_KEY), null);

const preferredM = { state: 'selected', value: 'M', display: 'M' };
const preferredML = { state: 'selected', values: ['M', 'L'], displays: ['M', 'L'], value: 'M', display: 'M' };
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['M', 'L'] }],
  [variant(101, true, ['M']), variant(102, true, ['L'])]
), preferredM), { state: 'add', variantId: 101 });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['M', 'L'] }],
  [variant(111, true, ['M']), variant(112, true, ['L'])]
), preferredML), { state: 'choose_options', variantId: null });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['M', 'L'] }],
  [variant(121, false, ['M']), variant(122, true, ['L'])]
), preferredML), { state: 'add', variantId: 122 });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['M', 'L'] }],
  [variant(201, false, ['M']), variant(202, true, ['L'])]
), preferredM), { state: 'sold_out', variantId: null });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['L'] }],
  [variant(301, true, ['L'])]
), preferredM), { state: 'unavailable', variantId: null });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['One Size'] }],
  [variant(401, true, ['One Size'])]
), { state: 'unset', value: '', display: '' }), { state: 'add', variantId: 401 });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['One Size'] }, { name: 'Color', values: ['Black', 'Blue'] }],
  [variant(411, true, ['One Size', 'Black']), variant(412, false, ['One Size', 'Blue'])]
), preferredM), { state: 'choose_options', variantId: null });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Color', values: ['Black', 'Blue'] }],
  [variant(421, true, ['Black']), variant(422, false, ['Blue'])]
), preferredM), { state: 'choose_options', variantId: null });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['M'] }, { name: 'Color', values: ['Black', 'Blue'] }],
  [variant(501, true, ['M', 'Black']), variant(502, false, ['M', 'Blue'])]
), preferredM), { state: 'choose_options', variantId: null });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Color', values: ['Black'] }, { name: 'Size', values: ['M', 'L'] }],
  [variant(511, true, ['Black', 'M']), variant(512, true, ['Black', 'L'])]
), preferredM), { state: 'add', variantId: 511 });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['M'] }, { name: 'Color' }],
  [variant(521, true, ['M', 'Black'])]
), preferredM), { state: 'choose_options', variantId: null });
assert.deepStrictEqual(resolveProductCardAction(product(
  [{ name: 'Size', values: ['M'] }],
  [variant(601, true, ['M'])]
), { state: 'unset', value: '', display: '' }), { state: 'select_size', variantId: null });
assert.notStrictEqual(STORAGE_KEY, LEGACY_STORAGE_KEY, 'session storage must use a new key');

const corrupt = memoryStorage({});
corrupt.setItem(STORAGE_KEY, '{not json');
assert.deepStrictEqual(createStorageAdapter(corrupt).read().values, []);
corrupt.setItem(STORAGE_KEY, JSON.stringify({ version: 99, values: ['M'] }));
assert.deepStrictEqual(createStorageAdapter(corrupt).read().values, []);

const throwingStorage = {
  getItem: function () { throw new Error('SecurityError'); },
  setItem: function () { throw new Error('QuotaExceededError'); },
  removeItem: function () { throw new Error('SecurityError'); }
};
const unavailableAdapter = createStorageAdapter(throwingStorage);
assert.deepStrictEqual(unavailableAdapter.read().values, []);
assert.strictEqual(unavailableAdapter.select('M'), false);
assert.strictEqual(unavailableAdapter.clear(), false);

const tamperedStorage = memoryStorage();
tamperedStorage.setItem(STORAGE_KEY, JSON.stringify({
  version: 1,
  values: ['M'],
  displays: ['M'.repeat(200)]
}));
const tamperedRecord = createStorageAdapter(tamperedStorage).read();
assert.strictEqual(tamperedRecord.value, 'M');
assert.ok(tamperedRecord.display.length <= 64, 'persisted display labels must be bounded');

const hostileStorage = memoryStorage();
hostileStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, values: ['M'], displays: ['\u0000</span><img src=x onerror=alert(1)>\n'] }));
const hostileRecord = createStorageAdapter(hostileStorage).read();
assert.ok(!/[\u0000-\u001f\u007f]/.test(hostileRecord.display), 'display labels must strip control characters');
assert.strictEqual(hostileRecord.value, 'M');

// Regression: preferred size is annotation only. It must not participate in
// the custom collection inclusion predicate or trigger product hiding.
const filterSource = fs.readFileSync('assets/collection-filters.js', 'utf8');
const matchStart = filterSource.indexOf('function matchesSelections(product, selections) {');
assert.notStrictEqual(matchStart, -1, 'matchesSelections must remain present');
const nextFunction = filterSource.indexOf('\n    function ', matchStart + 1);
const matchesBody = filterSource.slice(matchStart, nextFunction === -1 ? filterSource.length : nextFunction);
assert.ok(!/selections\.size|product\.sizes/.test(matchesBody), 'size preference must not filter product inclusion');
assert.ok(/key:\s*'size'/.test(filterSource), 'Size must be rendered inside the existing Filters interface');
assert.ok(/entitled:size-filter-change/.test(filterSource), 'filter changes must synchronize the session preference');
assert.ok(/hasValidSessionSizePreference/.test(filterSource), 'Filters must use the shared session-size validator');
assert.ok(!/collection-size-preference|role=\\?"radiogroup/.test(filterSource), 'Size must not retain single-select radio semantics');
assert.ok(/<input type=\\?"checkbox/.test(filterSource), 'Size must use checkbox controls');

const collectionCardSource = fs.readFileSync('snippets/product-grid-item.liquid', 'utf8');
const searchSource = fs.readFileSync('sections/search.liquid', 'utf8');
const collectionSource = fs.readFileSync('sections/collection.liquid', 'utf8');
assert.ok(/data-product-variants="\{\{ product_size_variants \| strip_newlines \| escape \}\}"/.test(collectionCardSource));
assert.ok(/data-product-variants="\{\{ search_product_size_variants \| strip_newlines \| escape \}\}"/.test(searchSource));
assert.ok(!/<script[^>]+data-product-variants/.test(collectionCardSource + searchSource));
assert.ok(/item\.has_only_default_variant/.test(searchSource), 'search direct-add must be limited to default variants');
assert.ok(/new URL\(window\.location\.href\)/.test(filterSource), 'collection requests must preserve current URL parameters');
assert.ok(!/baseUrl \+ '\?page='/.test(filterSource), 'collection page requests must not discard current URL parameters');
assert.ok(!/size-preference-control--toolbar|data-size-preference-open/.test(collectionSource), 'collection toolbar must not contain a separate size button');
['snippets/product-home-grid-item.liquid', 'snippets/product-related-loop.liquid'].forEach(function (snippet) {
  const source = fs.readFileSync(snippet, 'utf8');
  assert.ok(/product\.has_only_default_variant/.test(source), snippet + ' must not directly add multi-variant products');
  assert.ok(/products\.product\.choose_options/.test(source), snippet + ' must route multi-variant products to option selection');
});
['snippets/product-grid-item.liquid', 'snippets/product-home-grid-item.liquid', 'snippets/product-related-loop.liquid', 'sections/search.liquid'].forEach(function (file) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(/data-size-preference-card-action/.test(source), file + ' must expose a stable card action host');
});
assert.ok(/"id":\{\{ size_variant\.id \| json \}\}/.test(fs.readFileSync('snippets/product-size-data.liquid', 'utf8')), 'compact card metadata must include exact variant IDs');

const sizePreferenceSource = fs.readFileSync('assets/size-preference.js', 'utf8');
const sizePreferenceStyles = fs.readFileSync('assets/entitled-overrides.css', 'utf8');
assert.ok(/<button type="button" class="size-preference__choice needsclick/.test(sizePreferenceSource), 'popup sizes must render as semantic buttons excluded from legacy FastClick synthesis');
assert.ok(/size-preference__confirm needsclick/.test(fs.readFileSync('snippets/size-preference.liquid', 'utf8')), 'Save must bypass legacy FastClick synthesis');
const sizePreferenceMarkup = fs.readFileSync('snippets/size-preference.liquid', 'utf8');
assert.ok(!/data-size-preference-(?:skip|clear)/.test(sizePreferenceMarkup), 'initial popup must not render Skip or Clear actions');
assert.ok(!/<input type="radio" name="preferred-size"/.test(sizePreferenceSource), 'popup selection must not depend on label-forwarded hidden radios');
assert.ok(!/addEventListener\(['"]touch(?:start|end)['"]/.test(sizePreferenceSource), 'popup must not add competing touch activation handlers');
assert.ok(/data-size-preference-initialized/.test(sizePreferenceSource), 'DOM initialization must be idempotent');
assert.ok(/\.size-preference__choice[\s\S]*touch-action:\s*manipulation/.test(sizePreferenceStyles), 'size controls must opt into manipulation touch behavior');
assert.ok(/\.size-preference__confirm:active/.test(sizePreferenceStyles), 'Save must expose an active state');
assert.ok(/\.size-preference__confirm(?:\.is-loading|\[aria-busy="true"\])/.test(sizePreferenceStyles), 'Save must expose a non-colour loading state');
assert.ok(/env\(safe-area-inset-bottom\)/.test(sizePreferenceStyles), 'mobile bottom sheet must respect the iOS safe area');

console.log('size preference behavior ok');
