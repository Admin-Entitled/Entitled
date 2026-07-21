const { test, expect } = require('playwright/test');

test('size filter keeps products visible', async ({ page }) => {
  await page.goto('http://127.0.0.1:9292/collections/all-products-1', { waitUntil: 'networkidle' });
  await page.locator('[data-filter-search]').click();
  await page.locator('[data-filter-option-group="size"]').first().waitFor();
  await page.locator('[data-filter-option-group="size"][data-filter-option-value="S"] input').check();
  await page.locator('[data-client-filter-apply]').click();
  await expect(page.locator('[data-collection-product]')).toHaveCount(25);
  await expect(page.locator('[data-collection-product]').first()).toBeVisible();
  await expect(page.locator('[data-collection-product-count]')).toHaveText(/25 products?/);
});
