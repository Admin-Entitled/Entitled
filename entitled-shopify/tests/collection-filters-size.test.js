const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('assets/collection-filters.js', 'utf8');
const start = source.indexOf('function normalizeSizes(product) {');

if (start === -1) {
  throw new Error('normalizeSizes not found');
}

let depth = 0;
let end = -1;
for (let index = start; index < source.length; index += 1) {
  const char = source[index];
  if (char === '{') depth += 1;
  if (char === '}') {
    depth -= 1;
    if (depth === 0) {
      end = index;
      break;
    }
  }
}

if (end === -1) {
  throw new Error('normalizeSizes function is not balanced');
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end + 1) + '\nthis.normalizeSizes = normalizeSizes;', sandbox);

const normalizeSizes = sandbox.normalizeSizes;

assert.deepStrictEqual(
  Array.from(normalizeSizes({
    options_with_values: [{ name: 'Size', values: ['Small', 'Medium', 'Large'] }],
    variants: [
      { available: true, option1: 'Medium', option2: 'Black', option3: null, title: 'Medium / Black' },
      { available: true, option1: '32', option2: 'Black', option3: null, title: '32 / Black' },
      { available: false, option1: 'Large', option2: 'Black', option3: null, title: 'Large / Black' }
    ]
  })),
  ['Small', 'Medium', 'Large', '32']
);

assert.deepStrictEqual(
  Array.from(normalizeSizes({
    variants: [
      { available: true, option1: 'Black', option2: 'XL', option3: null, title: 'Black / XL' },
      { available: true, option1: 'White', option2: null, option3: null, title: 'White / M' }
    ]
  })),
  []
);

console.log('collection-filters size normalization ok');
