const assert = require('assert');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const css = `${fs.readFileSync('assets/style.css', 'utf8')}\n${fs.readFileSync('assets/entitled-overrides.css', 'utf8')}`;
function actionMarkup(type) {
  if (type === 'sold') return '<form class="product_card_form"><button class="product_card_button" disabled>Sold out</button><a class="product_card_button product_card_button--secondary" href="/products/test">View product</a></form>';
  if (type === 'view') return '<form class="product_card_form"><button class="product_card_button">Choose another size</button><a class="product_card_button product_card_button--secondary" href="/products/test">View product</a></form>';
  if (type === 'choose') return '<form class="product_card_form"><button class="product_card_button">Choose size</button><a class="product_card_button product_card_button--secondary" href="/products/test">View product</a></form>';
  return '<form class="product_card_form buy_now_stack"><button class="product_card_button">Add to cart</button><button class="product_card_button buy_now_button">Buy now</button></form>';
}
function card(title, type) {
  return `<div class="grid__item" style="width:50%"><article class="product_item"><div class="product_image" style="height:140px"></div><div class="product_desc"><div class="product_card_copy"><h3>${title}</h3><h4>₹1,000</h4><p class="product-size-status">Available M</p></div><div data-size-preference-card-action>${actionMarkup(type)}</div></div></article></div>`;
}

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/style.css' ? 'text/css' : 'text/html');
    response.end(request.url === '/style.css' ? css : `<!doctype html><link rel="stylesheet" href="/style.css"><div class="template-collection"><div class="shop_product_section"><div class="product_list">${card('Short', 'add')}${card('A deliberately longer title wrapping across two lines', 'sold')}${card('Short', 'view')}${card('Another title with uneven content height', 'choose')}</div></div></div>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const metrics = await page.$$eval('.product_item', cards => cards.map(card => {
        const action = card.querySelector('[data-size-preference-card-action]');
        const form = card.querySelector('.product_card_form');
        const buttons = form.querySelectorAll('.product_card_button');
        const cardBox = card.getBoundingClientRect();
        const actionBox = action.getBoundingClientRect();
        const formBox = form.getBoundingClientRect();
        const firstBox = buttons[0].getBoundingClientRect();
        const secondBox = buttons[1].getBoundingClientRect();
        const style = getComputedStyle(card);
        const actionStyle = getComputedStyle(action);
        const formStyle = getComputedStyle(form);
        return {
          height: cardBox.height,
          innerWidth: cardBox.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
          actionWidth: actionBox.width,
          formWidth: formBox.width,
          firstWidth: firstBox.width,
          secondWidth: secondBox.width,
          actionGap: secondBox.top - firstBox.bottom,
          bottomGap: cardBox.bottom - parseFloat(style.borderBottomWidth) - secondBox.bottom,
          actionMarginBottom: actionStyle.marginBottom,
          actionPaddingBottom: actionStyle.paddingBottom,
          radius: style.borderBottomLeftRadius,
          actionDisplay: actionStyle.display,
          formDisplay: formStyle.display,
          buttonHeight: firstBox.height,
          overflow: style.overflow,
          horizontalOverflow: card.scrollWidth > card.clientWidth
        };
      }));
      metrics.forEach(metric => {
        assert.ok(Math.abs(metric.bottomGap) <= 0.5, `final action must reach the card's inner bottom edge, got ${metric.bottomGap}px`);
        assert.ok(Math.abs(metric.innerWidth - metric.actionWidth) <= 0.5, 'action host must fill the card inner width');
        assert.ok(Math.abs(metric.innerWidth - metric.formWidth) <= 0.5, 'form must fill the card inner width');
        assert.ok(Math.abs(metric.innerWidth - metric.firstWidth) <= 0.5, 'primary action must fill the card inner width');
        assert.ok(Math.abs(metric.innerWidth - metric.secondWidth) <= 0.5, 'secondary action must fill the card inner width');
        assert.ok(Math.abs(metric.actionGap) <= 0.5, 'action rows must have zero gap');
        assert.strictEqual(metric.actionMarginBottom, '0px');
        assert.strictEqual(metric.actionPaddingBottom, '0px');
        assert.notStrictEqual(metric.radius, '0px');
        assert.strictEqual(metric.actionDisplay, 'block');
        assert.strictEqual(metric.formDisplay, 'grid');
        assert.ok(metric.buttonHeight >= 44, 'action touch target must remain at least 44px');
        assert.strictEqual(metric.overflow, 'hidden');
        assert.strictEqual(metric.horizontalOverflow, false);
      });
      assert.ok(Math.max(...metrics.map(metric => metric.height)) - Math.min(...metrics.map(metric => metric.height)) <= 1, 'all product states must preserve equal card heights');
      await page.close();
    }
    console.log('product card bottom layout ok');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
