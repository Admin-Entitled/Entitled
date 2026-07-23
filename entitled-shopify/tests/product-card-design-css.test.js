const assert = require('assert');
const fs = require('fs');

const css = fs.readFileSync('assets/entitled-overrides.css', 'utf8');

assert.match(css, /--product-card-radius: 8px;/, 'product cards should use a sharper premium shell radius');
assert.match(css, /--product-card-action-radius: 4px;/, 'product-card actions must cap button radius at 4px');
assert.match(css, /--product-card-title-slot: 34\.72px;/, 'product cards must reserve a stable two-line title slot');
assert.match(css, /--product-card-status-slot: 28px;/, 'product cards must reserve a stable availability slot');
assert.match(css, /--product-card-action-slot: 87px;/, 'product cards must reserve one shared two-action CTA slot');
assert.match(css, /\.product_card_button \{[\s\S]*?height: 44px !important;[\s\S]*?border-radius: var\(--product-card-action-radius\) !important;[\s\S]*?font-size: 11px !important;[\s\S]*?font-weight: 800 !important;/m, 'card buttons must keep matching dimensions and typography');
assert.match(css, /\.product_item \.product_desc h3,[\s\S]*?height: var\(--product-card-title-slot\) !important;[\s\S]*?min-height: var\(--product-card-title-slot\) !important;/m, 'product titles must occupy a normalized slot');
assert.match(css, /\.product_item \.product-size-status \{[\s\S]*?min-height: var\(--product-card-status-slot\) !important;[\s\S]*?display: flex !important;/m, 'availability text must occupy a normalized slot');
assert.match(css, /\.product_item \.product-size-status\[hidden\],[\s\S]*?\.product_item \.product-size-status--sold_out \{[\s\S]*?visibility: hidden !important;/m, 'hidden or sold-out size status must preserve the slot without duplicate visible copy');
assert.match(css, /\[data-size-preference-card-action\] \{[\s\S]*?margin: 0 !important;[\s\S]*?justify-content: flex-end !important;[\s\S]*?min-height: var\(--product-card-action-slot\) !important;/m, 'card actions must use a normalized CTA slot without auto-margin gaps');
assert.match(css, /\[data-card-action-state="sold_out"\] > \.product_card_button,[\s\S]*?height: var\(--product-card-action-slot\) !important;/m, 'single-action states must fill the same CTA slot as the two-button stack');
assert.match(css, /\.product_card_form\.buy_now_stack \.product_card_button \{\s*border-radius: 0 !important;\s*\}/m, 'stacked Add to Cart and Buy Now buttons must behave as one action group');
assert.match(css, /\.product_card_form\.buy_now_stack \.product_card_button:first-child \{[\s\S]*?border-radius: var\(--product-card-action-radius\) var\(--product-card-action-radius\) 0 0 !important;/m, 'Add to Cart must own the top group corners');
assert.match(css, /\.product_card_form\.buy_now_stack \.product_card_button:last-child \{[\s\S]*?border-radius: 0 0 var\(--product-card-action-radius\) var\(--product-card-action-radius\) !important;/m, 'Buy Now must own the bottom group corners');
assert.match(css, /\.product_card_button\.buy_now_button \{[\s\S]*?background: transparent !important;[\s\S]*?border: 1px solid var\(--product-card-accent\) !important;[\s\S]*?margin-top: -1px !important;/m, 'Buy Now must remain a secondary outlined action with a joined border');
assert.match(css, /\.product_item \.product_image \.sold_out \{[\s\S]*?height: 22px !important;[\s\S]*?box-sizing: border-box !important;[\s\S]*?padding: 0 7px !important;[\s\S]*?border-radius: 3px !important;[\s\S]*?box-shadow: none !important;/m, 'sold-out media badges must be compact, sharp, and non-pills');
assert.match(css, /\.product-size-status--sold_out \{\s*color: #61564d;\s*\}/m, 'sold-out size status must use a restrained neutral tone');
assert.match(css, /\.product_card_button\.is-disabled,[\s\S]*?\.product_card_button\[disabled\] \{[\s\S]*?background: var\(--product-card-sold-out-surface\) !important;[\s\S]*?border-color: var\(--product-card-sold-out-border\) !important;[\s\S]*?color: var\(--product-card-sold-out-ink\) !important;/m, 'sold-out CTAs must use the refined disabled action tokens');
assert.match(css, /--product-card-sold-out-surface: transparent;/, 'sold-out CTA should not render as a beige slab');
assert.doesNotMatch(css, /\.product_card_button \{[\s\S]*?border-radius: 0 0 15px 15px !important;/m, 'product-card buttons must not use the previous pill-like bottom radius');
assert.doesNotMatch(css, /\.product_card_form\.buy_now_stack \.product_card_button \{\s*border-radius: 15px !important;/m, 'Buy Now stack must not restore the previous pill radius');
assert.doesNotMatch(css, /\.product-size-status--sold_out \{\s*color: #8a4a12;\s*\}/m, 'sold-out status must not use the previous orange/brown warning tone');
assert.doesNotMatch(css, /\[data-card-action-state="sold_out"\] \{[\s\S]*?min-height: 88px !important;/m, 'sold-out actions must not reserve the old empty 88px block');

console.log('product card design css ok');
