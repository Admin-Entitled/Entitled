const assert = require('assert');
const fs = require('fs');

const layout = fs.readFileSync('layout/theme.liquid', 'utf8');
const collection = fs.readFileSync('sections/collection.liquid', 'utf8');
const search = fs.readFileSync('sections/search.liquid', 'utf8');
const filters = fs.readFileSync('assets/collection-filters.js', 'utf8');
const script = fs.readFileSync('assets/collection-infinite-scroll.js', 'utf8');
const css = fs.readFileSync('assets/entitled-overrides.css', 'utf8');

assert.ok(/collection-infinite-scroll\.js/.test(layout), 'theme must load the shared infinite-scroll enhancement');
assert.ok(/data-infinite-scroll-list/.test(collection), 'collection grid must expose an infinite-scroll list hook');
assert.ok(/data-infinite-scroll-pagination/.test(collection), 'collection pagination must remain in HTML as fallback');
assert.ok(/data-search-product-list/.test(search) && /data-infinite-scroll-list/.test(search), 'search product grid must expose an infinite-scroll list hook');
assert.ok(/data-search-pagination/.test(search) && /data-infinite-scroll-pagination/.test(search), 'search pagination must remain in HTML as fallback');
assert.ok(/data-product-id="\{\{ item\.id \}\}"/.test(search), 'search cards need stable product ids for duplicate prevention');
assert.ok(/IntersectionObserver/.test(script), 'infinite scroll must use IntersectionObserver');
assert.ok(/ROOT_MARGIN = '800px 0px'/.test(script), 'observer must prefetch before the final visible row');
assert.ok(/querySelector\(NEXT_SELECTOR\)/.test(script), 'next-page URL must come from Shopify pagination');
assert.ok(/context\.list\.appendChild\(item\)/.test(script), 'next pages must append cards instead of replacing the grid');
assert.ok(/context\.status\.hidden = false/.test(script) && /is-idle/.test(script), 'the observed sentinel must remain measurable while idle');
assert.ok(/AbortController/.test(script), 'in-flight requests must be abortable when state resets');
assert.ok(/existingKeys\(context\.list\)/.test(script), 'duplicate products must be guarded');
assert.ok(/entitled:products-appended/.test(script), 'new cards must trigger product-card reinitialization');
assert.ok(/entitled:collection-rendered/.test(script), 'new cards must trigger existing size and Buy Now lifecycle');
assert.ok(/refreshProductCards/.test(script), 'appended cards must explicitly refresh size-preference card actions');
assert.ok(/EntitledBuyNow\.initialize/.test(script), 'appended cards must explicitly initialize Buy Now buttons after size refresh');
assert.ok(/event\.detail && event\.detail\.source === SOURCE/.test(script), 'the script must not reset itself after its own append event');
assert.ok(/entitled:products-appended/.test(filters), 'collection media galleries must initialize for appended cards');
assert.ok(/document\.addEventListener\('submit'/.test(filters) && /closest\('\.product_card_form'\)/.test(filters), 'appended product-card Add to Cart forms must use delegated submission');
assert.ok(/event\.defaultPrevented/.test(filters), 'delegated Add to Cart must not duplicate existing initial-page ajax-cart bindings');
assert.ok(/data-size-preference-card-form/.test(filters), 'delegated Add to Cart must not compete with size-preference generated forms');
assert.ok(/ShopifyAPI\.addItemFromForm/.test(filters), 'delegated Add to Cart must reuse the Shopify AJAX cart API');
assert.ok(/\.infinite-scroll-status/.test(css), 'loading UI must be styled');
assert.ok(/\.buy_now_stack \{[\s\S]*?gap: 0 !important;/.test(css), 'Add to Cart and Buy Now must have zero vertical gap');
assert.ok(/\.template-product \.submit_row\.buy_now_stack \{[\s\S]*?gap: 0 !important;/.test(css), 'PDP Add to Cart and Buy Now must have zero vertical gap');

console.log('infinite scroll source ok');
