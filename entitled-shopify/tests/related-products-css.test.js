const assert = require('assert');
const fs = require('fs');

const css = fs.readFileSync('assets/entitled-overrides.css', 'utf8');

assert.match(
  css,
  /\.template-product \.popular_product_section \.product_list \{\s*display: grid !important;\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important;\s*gap: 26px !important;/m,
  'PDP related product rows must keep the original grid card layout'
);

assert.match(
  css,
  /\.template-product \.popular_product_section \.product_list >? \.grid__item[\s\S]*?width: 100% !important;\s*max-width: 100% !important;/m,
  'PDP related product grid items must fill their grid track instead of forcing narrow card widths'
);

assert.match(
  css,
  /@media screen and \(max-width: 767px\) \{[\s\S]*?\.template-product \.popular_product_section \.product_list \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;\s*gap: 22px 14px !important;/m,
  'PDP related product cards must switch through the original two-column mobile grid'
);

assert.doesNotMatch(
  css,
  /\.template-product \.popular_product_section \.product_image img \{[\s\S]*?width: 90% !important;[\s\S]*?height: 90% !important;/m,
  'PDP related product images must not be artificially inset inside the image frame'
);

assert.match(
  css,
  /\.template-product \.popular_product_section \.product_image img \{[\s\S]*?width: 100% !important;\s*height: 100% !important;\s*max-width: 100% !important;\s*max-height: 100% !important;/m,
  'PDP related product image elements must not be scaled down inside the image frame'
);

assert.doesNotMatch(
  css,
  /\.related_products \.popular_product_section \.product_list \{\s*display: flex !important;/m,
  'PDP related product list must not be pulled into the shared flex card layout'
);

assert.doesNotMatch(
  css,
  /@media screen and \(max-width: 767px\) \{[\s\S]*?\.related_products \.popular_product_section \.product_list > \.grid__item[\s\S]*?max-width: 50% !important;/m,
  'PDP related product grid items must not be halved inside their own two-column grid tracks'
);

console.log('related products css ok');
