const assert = require('assert');
const fs = require('fs');

const layout = fs.readFileSync('layout/theme.liquid', 'utf8');
const script = fs.readFileSync('assets/buy-now.js', 'utf8');
const css = fs.readFileSync('assets/entitled-overrides.css', 'utf8');

assert.ok(/buy-now\.js/.test(layout), 'theme layout must load the shared buy-now script');
assert.ok(/ShopifyAPI\.addItemFromForm/.test(script), 'Buy Now must reuse the existing Shopify form submission path');
assert.ok(/window\.location\.assign\(CHECKOUT_URL\)/.test(script), 'Buy Now must redirect to checkout only after add succeeds');
assert.ok(/form\.getAttribute\('data-buy-now-pending'\)/.test(script), 'Buy Now must guard against duplicate submissions');
assert.ok(/selectedVariantField\(form\)/.test(script), 'Buy Now must validate the active form variant instead of inventing its own source of truth');
assert.ok(/window\.EntitledBuyNow\.initialize = initialize/.test(script), 'Buy Now must expose an idempotent initializer for appended cards');
assert.ok(/shopify:section:load/.test(script) && /entitled:collection-rendered/.test(script) && /entitled:size-filter-change/.test(script), 'Buy Now must reinitialize on section and card rerender events');
assert.ok(/\.template-product \.submit_row\.buy_now_stack/.test(css), 'PDP Buy Now must stack directly under Add to Cart');
assert.ok(/\.product_card_form\.buy_now_stack/.test(css), 'card Buy Now must stack directly under Add to Cart');
assert.ok(/\.product_card_button\.buy_now_button/.test(css), 'card Buy Now must reuse product card button sizing with a secondary style');
assert.ok(/\.buy_now_stack \{[\s\S]*?gap: 0 !important;/.test(css), 'card Buy Now must sit directly against Add to Cart');

console.log('buy now source ok');
