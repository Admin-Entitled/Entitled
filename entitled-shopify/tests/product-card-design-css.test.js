const assert = require('assert');
const fs = require('fs');

const css = fs.readFileSync('assets/entitled-overrides.css', 'utf8');

assert.match(css, /--product-card-radius: 8px;/, 'product cards should use a sharper premium shell radius');
assert.match(css, /--product-card-action-radius: 4px;/, 'product-card actions must cap button radius at 4px');
assert.match(css, /--product-card-title-slot: 34\.72px;/, 'product cards must reserve a stable two-line title slot');
assert.match(css, /--product-card-status-slot: 28px;/, 'product cards must reserve a stable availability slot');
assert.match(css, /--product-card-action-slot: 88px;/, 'product cards must reserve one shared two-action CTA slot');
assert.match(css, /\.product_card_button \{[\s\S]*?height: 44px !important;[\s\S]*?border-radius: 0 !important;[\s\S]*?font-size: 11px !important;[\s\S]*?font-weight: 800 !important;/m, 'card buttons must keep matching dimensions and typography while the wrapper owns radius');
assert.match(css, /\.product_item \.product_desc h3,[\s\S]*?height: var\(--product-card-title-slot\) !important;[\s\S]*?min-height: var\(--product-card-title-slot\) !important;/m, 'product titles must occupy a normalized slot');
assert.match(css, /\.product_item \.product-size-status \{[\s\S]*?min-height: var\(--product-card-status-slot\) !important;[\s\S]*?display: flex !important;/m, 'availability text must occupy a normalized slot');
assert.match(css, /\.product_item \.product-size-status\[hidden\] \{[\s\S]*?display: flex !important;[\s\S]*?visibility: hidden !important;/m, 'empty status slots must preserve the normalized six-row rhythm without visible duplicate text');
assert.doesNotMatch(css, /\.product_item \.product-size-status--sold_out \{[\s\S]*?visibility: hidden !important;/m, 'sold-out status must be rendered once at the source, not hidden by CSS');
assert.match(css, /\[data-size-preference-card-action\] \{[\s\S]*?margin: 0 !important;[\s\S]*?display: block !important;[\s\S]*?min-height: 0 !important;/m, 'card action hosts must expose the shared two-row form without an extra layout system');
assert.doesNotMatch(css, /\[data-card-action-state="unavailable"\] > \.product_card_button,[\s\S]*?height: var\(--product-card-action-slot\) !important;/m, 'single-action states must stay compact');
assert.match(css, /\.product_card_form \{[\s\S]*?display: grid !important;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;[\s\S]*?grid-template-rows: repeat\(2, 44px\) !important;[\s\S]*?justify-content: stretch !important;[\s\S]*?border-top: 1px solid var\(--product-card-action-border\) !important;/m, 'the shared form must define one full-width column and two deterministic action rows');
assert.match(css, /\.product_card_form,[\s\S]*?\.product_card_button \{[\s\S]*?width: 100% !important;[\s\S]*?min-width: 0 !important;[\s\S]*?max-width: none !important;[\s\S]*?box-sizing: border-box !important;/m, 'the complete action width chain must fill the card');
assert.match(css, /\.product_card_button\.buy_now_button,\s*\.product_card_button--secondary \{[\s\S]*?background: #fcfaf7 !important;[\s\S]*?border: 0 !important;[\s\S]*?border-top: 1px solid var\(--product-card-action-divider\) !important;[\s\S]*?margin: 0 !important;/m, 'secondary card actions must share only the internal action divider');
assert.match(css, /\.product_card_button\[hidden\] \{[\s\S]*?display: none !important;/m, 'inactive server-rendered actions must not occupy a grid row');
assert.match(css, /\.product_item \.product_image \.sold_out \{[\s\S]*?height: 22px !important;[\s\S]*?box-sizing: border-box !important;[\s\S]*?padding: 0 7px !important;[\s\S]*?border-radius: 3px !important;[\s\S]*?box-shadow: none !important;/m, 'sold-out media badges must be compact, sharp, and non-pills');
assert.match(css, /\.product_item--sold-out \{[\s\S]*?--product-card-border: rgba\(91, 10, 25, 0\.42\);[\s\S]*?box-shadow: inset 0 2px 0 rgba\(91, 10, 25, 0\.82\) !important;/m, 'fully sold-out cards must have a restrained semantic state accent');
assert.match(css, /\.product_item--sold-out \.product_image__track,[\s\S]*?\.product_item--sold-out \.product_image > img \{[\s\S]*?opacity: 0\.84 !important;[\s\S]*?filter: grayscale\(14%\) saturate\(0\.86\) !important;/m, 'fully sold-out media must be subtly de-emphasized');
assert.match(css, /\.product-size-status--sold_out \{\s*color: #5B0A19;\s*\}/m, 'sold-out size status must use restrained oxblood, not orange');
assert.match(css, /\.product_card_button\.is-disabled,[\s\S]*?\.product_card_button\[disabled\] \{[\s\S]*?background: var\(--product-card-sold-out-surface\) !important;[\s\S]*?border-color: var\(--product-card-sold-out-border\) !important;[\s\S]*?color: var\(--product-card-sold-out-ink\) !important;/m, 'sold-out CTAs must use the refined disabled action tokens');
assert.match(css, /--product-card-sold-out-surface: #3a1118;/, 'sold-out CTA should use an intentional dark disabled fill');
assert.match(css, /\.product_card_button--secondary \{[\s\S]*?background: #fcfaf7 !important;[\s\S]*?border: 0 !important;[\s\S]*?border-top: 1px solid var\(--product-card-action-divider\) !important;/m, 'View Product must share the joined secondary action treatment');
assert.doesNotMatch(css, /\.product_card_button \{[\s\S]*?border-radius: 0 0 15px 15px !important;/m, 'product-card buttons must not use the previous pill-like bottom radius');
assert.doesNotMatch(css, /\.product_card_form\.buy_now_stack \.product_card_button \{\s*border-radius: 15px !important;/m, 'Buy Now stack must not restore the previous pill radius');
assert.doesNotMatch(css, /\.product-size-status--sold_out \{\s*color: #8a4a12;\s*\}/m, 'sold-out status must not use the previous orange/brown warning tone');
assert.doesNotMatch(css, /\[data-card-action-state="sold_out"\] \{[\s\S]*?min-height: 88px !important;/m, 'sold-out actions must not reserve the old empty 88px block');
assert.doesNotMatch(css, /margin-top: -1px !important;/m, 'joined action borders must not rely on negative margins');

[
  'snippets/product-grid-item.liquid',
  'snippets/product-home-grid-item.liquid',
  'snippets/product-related-loop.liquid',
  'sections/search.liquid'
].forEach(function (file) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /product_item--sold-out/, file + ' must mark fully sold-out cards with a semantic state class');
  assert.match(source, /data-product-card-state="\{% if sold_out %\}sold_out\{% else %\}available\{% endif %\}"/, file + ' must expose a stable product-card state attribute');
  assert.match(source, /status_currently_sold_out/, file + ' must render one fully sold-out status message at the source');
  assert.match(source, /render 'product-card-actions'/, file + ' must use the shared server-rendered action component');
});

const actionSnippet = fs.readFileSync('snippets/product-card-actions.liquid', 'utf8');
const sizePreferenceScript = fs.readFileSync('assets/size-preference.js', 'utf8');
assert.match(actionSnippet, /data-product-card-primary/, 'the shared action component must expose one primary state control');
assert.match(actionSnippet, /data-buy-now-trigger/, 'Buy Now must be server-rendered in the shared action component');
assert.match(actionSnippet, /data-product-card-view/, 'View Product must be server-rendered in the shared action component');
assert.match(actionSnippet, /data-product-card-variant/, 'the shared action component must expose the selected variant field');
assert.match(actionSnippet, /aria-disabled="true"/, 'the shared action component must mark sold-out buttons as disabled for assistive tech');
assert.match(actionSnippet, /product_card_button product_card_button--secondary/, 'the shared action component must render View Product as the second action row');
assert.doesNotMatch(sizePreferenceScript, /host\.replaceChildren\(/, 'card state updates must not replace the server-rendered action component');
assert.doesNotMatch(sizePreferenceScript, /document\.createElement\(['"]form['"]\)/, 'card state updates must not generate product-card forms');

console.log('product card design css ok');
