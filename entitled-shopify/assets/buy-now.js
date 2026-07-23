(function () {
  'use strict';

  var BUY_NOW_LABEL = 'Buy Now';
  var CHECKOUT_URL = '/checkout';
  var BUY_NOW_SELECTOR = '[data-buy-now-trigger]';
  var FORM_SELECTOR = 'form[action="/cart/add"], form[action^="/cart/add?"]';
  var REINIT_EVENTS = [
    'shopify:section:load',
    'entitled:collection-rendered',
    'entitled:size-filter-change',
    'entitled:variant-selectors-ready'
  ];

  function forms() {
    return document.querySelectorAll(FORM_SELECTOR);
  }

  function primaryButton(form) {
    return form.querySelector('#AddToCart, button[type="submit"], input[type="submit"], .product_card_button[type="submit"], .js-add-to-cart, .submit_row .btn');
  }

  function cleanupText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isDirectPurchaseForm(form, button) {
    if (!form || !button) {
      return false;
    }
    if (button.matches(BUY_NOW_SELECTOR)) {
      return false;
    }
    return cleanupText(button.textContent || button.value).indexOf('select options') === -1;
  }

  function iconMarkup(node) {
    var icon = node && node.querySelector ? node.querySelector('span') : null;
    return icon ? icon.outerHTML : '';
  }

  function createBuyNowButton(button) {
    var buyNow = document.createElement('button');
    var classes = button.className ? button.className.split(/\s+/).filter(function (name) {
      return !!name && name !== 'js-add-to-cart';
    }) : [];
    buyNow.type = 'button';
    buyNow.className = classes.join(' ');
    if (!buyNow.className && button.id === 'AddToCart') {
      buyNow.className = 'btn';
    }
    buyNow.classList.add('buy_now_button');
    buyNow.setAttribute('data-buy-now-trigger', '');
    buyNow.setAttribute('aria-disabled', 'false');
    buyNow.innerHTML = BUY_NOW_LABEL + iconMarkup(button);
    return buyNow;
  }

  function selectedVariantField(form) {
    return form.querySelector('[name="id"]');
  }

  function hasValidVariant(form) {
    var field = selectedVariantField(form);
    if (!field) {
      return false;
    }
    if (field.tagName === 'SELECT') {
      var option = field.options[field.selectedIndex];
      return !!field.value && !!option && !option.disabled;
    }
    return !!field.value;
  }

  function errorAnchor(form, button) {
    var actionHost = form.closest('[data-size-preference-card-action]');
    if (actionHost) {
      return button || form;
    }
    return form;
  }

  function clearError(form) {
    var error = form.parentNode && form.parentNode.querySelector('[data-buy-now-error]');
    if (error) {
      error.parentNode.removeChild(error);
    }
  }

  function showError(form, button, message) {
    clearError(form);
    var error = document.createElement('div');
    error.className = 'errors qty-error buy_now_error';
    error.setAttribute('data-buy-now-error', '');
    error.setAttribute('role', 'alert');
    error.textContent = message;
    var anchor = errorAnchor(form, button);
    anchor.insertAdjacentElement('afterend', error);
  }

  function syncButtonState(form) {
    var button = form.querySelector(BUY_NOW_SELECTOR);
    var primary = primaryButton(form);
    if (!button || !primary) {
      return;
    }
    var disabled = primary.disabled || primary.classList.contains('disabled') || primary.classList.contains('is-disabled') || !hasValidVariant(form);
    button.disabled = disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    button.classList.toggle('disabled', disabled);
    button.classList.toggle('is-disabled', disabled);
  }

  function ensureButton(form) {
    var primary = primaryButton(form);
    if (!isDirectPurchaseForm(form, primary)) {
      return;
    }

    var existing = form.querySelector(BUY_NOW_SELECTOR);
    if (!existing) {
      existing = createBuyNowButton(primary);
      if (primary.parentNode && primary.parentNode.classList) {
        primary.parentNode.classList.add('buy_now_stack');
        if (primary.classList.contains('product_card_button')) {
          primary.parentNode.classList.add('buy_now_stack--card');
        }
      }
      primary.insertAdjacentElement('afterend', existing);
    }

    if (!form.__buyNowObserver && window.MutationObserver && primary) {
      form.__buyNowObserver = new MutationObserver(function () {
        syncButtonState(form);
      });
      form.__buyNowObserver.observe(primary, {
        attributes: true,
        attributeFilter: ['class', 'disabled', 'value'],
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    syncButtonState(form);
  }

  function initialize() {
    Array.prototype.forEach.call(forms(), ensureButton);
  }

  window.EntitledBuyNow = window.EntitledBuyNow || {};
  window.EntitledBuyNow.initialize = initialize;

  function setPending(form, button, pending) {
    form.setAttribute('data-buy-now-pending', pending ? 'true' : 'false');
    button.disabled = pending;
    button.setAttribute('aria-disabled', pending ? 'true' : 'false');
    button.setAttribute('aria-busy', pending ? 'true' : 'false');
    button.classList.toggle('is-adding', pending);
  }

  function submitFormToCart(form, success, failure) {
    if (window.ShopifyAPI && typeof window.ShopifyAPI.addItemFromForm === 'function') {
      window.ShopifyAPI.addItemFromForm(form, success, failure);
      return;
    }

    var payload = new URLSearchParams(new FormData(form)).toString();
    var request = new XMLHttpRequest();
    request.open('POST', '/cart/add.js', true);
    request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
    request.setRequestHeader('Accept', 'application/json');
    request.onreadystatechange = function () {
      if (request.readyState !== 4) {
        return;
      }
      if (request.status >= 200 && request.status < 300) {
        success();
        return;
      }
      failure(request);
    };
    request.send(payload);
  }

  function checkoutWithForm(form, button) {
    clearError(form);

    if (!hasValidVariant(form)) {
      syncButtonState(form);
      showError(form, button, 'Please select an available option before continuing.');
      var field = selectedVariantField(form);
      if (field && typeof field.focus === 'function') {
        field.focus();
      }
      return;
    }

    if (form.getAttribute('data-buy-now-pending') === 'true') {
      return;
    }

    setPending(form, button, true);

    submitFormToCart(form, function () {
      window.location.assign(CHECKOUT_URL);
    }, function (request) {
      var message = 'Unable to continue to checkout. Please try again.';
      try {
        var payload = JSON.parse(request && request.responseText || '{}');
        message = payload.description || payload.message || message;
      } catch (error) {}
      setPending(form, button, false);
      syncButtonState(form);
      showError(form, button, message);
    });
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest(BUY_NOW_SELECTOR);
    if (!button) {
      return;
    }
    event.preventDefault();
    var form = button.closest('form');
    if (!form) {
      return;
    }
    checkoutWithForm(form, button);
  });

  document.addEventListener('change', function (event) {
    var form = event.target.closest && event.target.closest(FORM_SELECTOR);
    if (form) {
      syncButtonState(form);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  REINIT_EVENTS.forEach(function (name) {
    document.addEventListener(name, function () {
      window.setTimeout(initialize, 0);
    });
  });
}());
