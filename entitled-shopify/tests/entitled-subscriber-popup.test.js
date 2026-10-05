const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('theme loads one configurable popup instance and its namespaced assets', () => {
  const layout = read('layout/theme.liquid');
  const snippet = read('snippets/entitled-subscriber-popup.liquid');
  const settings = JSON.parse(read('config/settings_schema.json'));

  assert.match(layout, /entitled-subscriber-popup\.css/);
  assert.match(layout, /render 'entitled-subscriber-popup'/);
  assert.match(layout, /entitled-subscriber-popup\.js/);
  assert.match(snippet, /data-api-base=/);
  assert.match(snippet, /data-homepage=/);
  assert.equal((layout.match(/render 'entitled-subscriber-popup'/g) || []).length, 1);
  assert.ok(settings.some(section => section.settings?.some(setting => setting.id === 'entitled_subscriber_api_base')));
});

test('popup source contains the required browser states, API payload, and accessibility behavior', () => {
  const snippet = read('snippets/entitled-subscriber-popup.liquid');
  const script = read('assets/entitled-subscriber-popup.js');
  const css = read('assets/entitled-subscriber-popup.css');

  for (const field of ['name', 'age', 'phone', 'city', 'preferredTypes', 'preferredBrand', 'email', 'heardAboutUs', 'marketingConsent']) {
    assert.ok(snippet.includes(`name="${field}"`), `missing ${field} control`);
  }
  const typeList = snippet.match(/entitled_preferred_types = '([^']+)'/)[1].split(',');
  assert.deepEqual(typeList, ['Polos', 'T-Shirts', 'Shirts', 'Sweatshirts', 'Jackets', 'Lowers']);
  assert.doesNotMatch(snippet, /value="Accessories"/);
  assert.match(snippet, /role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(snippet, /type="checkbox"[^>]*required/);
  assert.match(script, /entitled_marketing_registered_v1/);
  assert.match(script, /entitled_marketing_dismissed_at_v1/);
  assert.match(script, /3500/);
  assert.match(script, /12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(script, /window\.EntitledSubscriberPopup/);
  assert.match(script, /preferredTypes/);
  assert.match(script, /marketingConsent:\s*true/);
  assert.match(script, /You're in\./);
  assert.match(script, /collections\/all-products-1/);
  assert.match(script, /429/);
  assert.match(script, /textContent/);
  assert.match(css, /max-height:[^;]*(?:dvh|vh)/);
  assert.match(css, /focus-visible/);
});
