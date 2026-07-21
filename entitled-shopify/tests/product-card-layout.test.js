const assert = require('assert');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const css = `${fs.readFileSync('assets/style.css', 'utf8')}\n${fs.readFileSync('assets/entitled-overrides.css', 'utf8')}`;
function actionMarkup(type) {
  if (type === 'sold') return '<button class="product_card_button" disabled>Sold out</button>';
  if (type === 'view') return '<a class="product_card_button" href="/products/test">View product</a>';
  if (type === 'choose') return '<a class="product_card_button" href="/products/test">Choose options</a>';
  return '<form class="product_card_form"><button class="product_card_button">Add to cart</button></form>';
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
        const button = card.querySelector('.product_card_button');
        const cardBox = card.getBoundingClientRect();
        const actionBox = action.getBoundingClientRect();
        const style = getComputedStyle(card);
        const actionStyle = getComputedStyle(action);
        return {
          height: cardBox.height,
          bottomGap: Math.abs(cardBox.bottom - actionBox.bottom),
          actionMarginBottom: actionStyle.marginBottom,
          actionPaddingBottom: actionStyle.paddingBottom,
          radius: style.borderBottomLeftRadius,
          buttonRadius: getComputedStyle(button).borderBottomLeftRadius,
          actionDisplay: actionStyle.display,
          buttonHeight: button.getBoundingClientRect().height,
          overflow: style.overflow,
          horizontalOverflow: card.scrollWidth > card.clientWidth,
          buttonBottom: Math.abs(cardBox.bottom - button.getBoundingClientRect().bottom)
        };
      }));
      for (let index = 0; index < metrics.length; index += 2) {
        assert.strictEqual(Math.abs(metrics[index].height - metrics[index + 1].height) < 1, true, 'cards in each row must align');
      }
      metrics.forEach(metric => {
        assert.ok(metric.bottomGap <= 1.5, `action must reach card bottom, got ${metric.bottomGap}px`);
        assert.ok(metric.buttonBottom <= 1.5, `button must reach card bottom, got ${metric.buttonBottom}px`);
        assert.strictEqual(metric.actionMarginBottom, '0px');
        assert.strictEqual(metric.actionPaddingBottom, '0px');
        assert.notStrictEqual(metric.radius, '0px');
        assert.notStrictEqual(metric.buttonRadius, '0px', 'dark action must carry the rounded bottom corner');
        assert.strictEqual(metric.actionDisplay, 'flex');
        assert.ok(metric.buttonHeight >= 44, 'action touch target must remain at least 44px');
        assert.strictEqual(metric.overflow, 'hidden');
        assert.strictEqual(metric.horizontalOverflow, false);
      });
      await page.close();
    }
    console.log('product card bottom layout ok');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
