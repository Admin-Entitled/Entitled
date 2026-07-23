const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const themeLayout = read('layout/theme.liquid');
const overridesCss = read('assets/entitled-overrides.css');
const settingsJson = read('config/settings_data.json').replace(/\/\*[\s\S]*?\*\//g, '');
const settings = JSON.parse(settingsJson).current;

assert(!/fonts\.googleapis/i.test(themeLayout), 'theme layout should not request Google Fonts');
assert(!/google_font_url/i.test(themeLayout), 'legacy dynamic Google Fonts builder should be removed');
assert(!/Ubuntu/i.test(themeLayout), 'theme layout should not load Ubuntu');

assert(
  /rel="preload"[\s\S]*hanken-grotesk-latin-400-700\.woff2/i.test(themeLayout),
  'primary Hanken Grotesk font should be preloaded'
);

assert.strictEqual(settings.body_custom_font, "'Hanken Grotesk', sans-serif");
assert.strictEqual(settings.heading_custom_font, "'Tenor Sans', serif");

for (const weight of ['400', '500', '600', '700']) {
  assert(
    new RegExp(`font-family:\\s*"Hanken Grotesk"[\\s\\S]*?font-weight:\\s*${weight}`, 'i').test(overridesCss),
    `Hanken Grotesk ${weight} face should be declared`
  );
}

assert(
  /font-family:\s*"Tenor Sans"[\s\S]*?font-weight:\s*400/i.test(overridesCss),
  'Tenor Sans 400 face should be declared'
);
assert(
  (overridesCss.match(/font-display:\s*swap/g) || []).length >= 5,
  'all storefront font faces should use font-display: swap'
);
assert(
  /--font-display:\s*"Tenor Sans"/.test(overridesCss) && /--font-body:\s*"Hanken Grotesk"/.test(overridesCss),
  'shared typography tokens should be present'
);
assert(
  /body,[\s\S]*?\.product_card_button,[\s\S]*?font-family:\s*var\(--font-body\)/.test(overridesCss),
  'product-card UI and buttons should inherit the body/UI font'
);
assert(
  /h1,[\s\S]*?h2,[\s\S]*?font-family:\s*var\(--font-display\)/.test(overridesCss),
  'major headings should use the display font'
);
assert(
  !/h1,[\s\S]*?\.product_item \.product_desc h3,[\s\S]*?font-family:\s*var\(--font-display\)/.test(overridesCss),
  'product-card titles should not be promoted to the display font'
);

for (const fontFile of ['assets/hanken-grotesk-latin-400-700.woff2', 'assets/tenor-sans-latin-400.woff2']) {
  const buffer = fs.readFileSync(path.join(root, fontFile));
  assert(buffer.length > 1000, `${fontFile} should exist and be non-empty`);
  assert.strictEqual(buffer.toString('ascii', 0, 4), 'wOF2', `${fontFile} should be a WOFF2 font`);
}

console.log('Typography CSS checks passed');
