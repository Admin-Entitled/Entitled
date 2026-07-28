(function (root, factory) {
  var api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.EntitledSizePreference = api;
  }
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var STORAGE_KEY = 'entitled:size-preference:selected-filters:v1';
  var PROMPT_COMPLETED_KEY = 'entitled:size-preference:prompt-completed:v1';
  var LEGACY_SESSION_KEY = 'entitled:size-preference:session:v2';
  var LEGACY_STORAGE_KEY = 'entitled:size-preference:v1';
  // Temporarily paused. Set to true to restore automatic size-preference prompts.
  var SIZE_PREFERENCE_PROMPT_ENABLED = false;
  var MAX_LABEL_LENGTH = 64;
  var PDP_MAX_ATTEMPTS = 10;
  var PDP_RETRY_DELAY = 100;
  var ONE_SIZE_VALUES = ['one size', 'one-size', 'onesize', 'one size fits all', 'os', 'osfa', 'free size'];
  var ALIASES = {
    'xs': 'XS',
    'extra small': 'XS',
    'x-small': 'XS',
    's': 'S',
    'small': 'S',
    'm': 'M',
    'medium': 'M',
    'l': 'L',
    'large': 'L',
    'xl': 'XL',
    'x large': 'XL',
    'x-large': 'XL',
    'extra large': 'XL',
    'xxl': 'XXL',
    '2xl': 'XXL',
    'xx large': 'XXL',
    'xx-large': 'XXL',
    'double xl': 'XXL',
    'extra extra large': 'XXL',
    'xxxl': 'XXXL',
    '3xl': 'XXXL',
    'xxx-large': 'XXXL'
  };
  var publicApi = {};

  function cleanLabel(value) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
  }

  function safeDisplayLabel(value, fallback) {
    var label = cleanLabel(value);
    if (!label || label.length > MAX_LABEL_LENGTH) {
      label = cleanLabel(fallback);
    }
    return label.length <= MAX_LABEL_LENGTH ? label : label.slice(0, MAX_LABEL_LENGTH);
  }

  function normalizeSizeLabel(value) {
    var cleaned = cleanLabel(value);
    var key;

    if (!cleaned || cleaned.length > MAX_LABEL_LENGTH) {
      return '';
    }

    key = cleaned.toLowerCase();
    return ALIASES[key] || key;
  }

  function hasValidSessionSizePreference(record) {
    return selectedSizeValues(record).length > 0;
  }

  function selectedSizeValues(record) {
    var raw = record && Array.isArray(record.values) ? record.values : record && record.value ? [record.value] : [];
    var values = [];
    raw.forEach(function (value) {
      var normalized = normalizeSizeLabel(value);
      if (normalized && values.indexOf(normalized) === -1) {
        values.push(normalized);
      }
    });
    return values;
  }

  function findSizeOptionIndex(options) {
    var list = options || [];

    for (var index = 0; index < list.length; index += 1) {
      var name = typeof list[index] === 'string' ? list[index] : list[index] && list[index].name;
      if (cleanLabel(name).toLowerCase() === 'size') {
        return index;
      }
    }

    return -1;
  }

  function optionValue(variant, optionIndex) {
    if (!variant || optionIndex < 0) {
      return '';
    }

    if (variant.options && variant.options.length > optionIndex) {
      return variant.options[optionIndex];
    }

    return variant['option' + (optionIndex + 1)] || '';
  }

  function sizeValues(product, optionIndex) {
    var option = product && product.options_with_values && product.options_with_values[optionIndex];
    if (option && Array.isArray(option.values)) {
      return option.values.map(cleanLabel).filter(Boolean);
    }

    var values = [];
    (product && product.variants || []).forEach(function (variant) {
      var value = cleanLabel(optionValue(variant, optionIndex));
      if (value && values.indexOf(value) === -1) {
        values.push(value);
      }
    });
    return values;
  }

  function isOneSize(values) {
    return values.length === 1 && ONE_SIZE_VALUES.indexOf(values[0].toLowerCase()) !== -1;
  }

  function displayForPreference(values, preference) {
    var canonical = normalizeSizeLabel(preference);
    for (var index = 0; index < values.length; index += 1) {
      if (normalizeSizeLabel(values[index]) === canonical) {
        return values[index];
      }
    }
    return cleanLabel(preference);
  }

  function classifyPreferredSize(product, preferredSize) {
    var optionIndex = findSizeOptionIndex(product && product.options_with_values || product && product.options || []);
    var preference = normalizeSizeLabel(preferredSize);

    if (optionIndex < 0 || !preference) {
      return { state: 'not_applicable', display: '', optionIndex: -1 };
    }

    var values = sizeValues(product, optionIndex);
    if (isOneSize(values)) {
      return { state: 'not_applicable', display: values[0], optionIndex: optionIndex };
    }

    var matching = (product.variants || []).filter(function (variant) {
      return normalizeSizeLabel(optionValue(variant, optionIndex)) === preference;
    });
    var display = displayForPreference(values, preferredSize);

    if (!matching.length) {
      return { state: 'unavailable', display: display, optionIndex: optionIndex };
    }

    return {
      state: matching.some(function (variant) { return !!variant.available; }) ? 'available' : 'sold_out',
      display: display,
      optionIndex: optionIndex
    };
  }

  function resolvePreferredVariant(options) {
    var product = options && options.product || {};
    var variants = product.variants || [];
    var explicitVariantId = options && options.explicitVariantId;

    if (explicitVariantId) {
      for (var explicitIndex = 0; explicitIndex < variants.length; explicitIndex += 1) {
        if (String(variants[explicitIndex].id) === String(explicitVariantId)) {
          return variants[explicitIndex];
        }
      }
    }

    var optionIndex = findSizeOptionIndex(product.options_with_values || product.options || []);
    var preference = normalizeSizeLabel(options && options.preferredSize);
    if (optionIndex < 0 || !preference) {
      return null;
    }

    var selected = options && options.selectedOptions || [];
    var candidates = variants.filter(function (variant) {
      if (!variant.available || normalizeSizeLabel(optionValue(variant, optionIndex)) !== preference) {
        return false;
      }

      for (var index = 0; index < selected.length; index += 1) {
        if (index !== optionIndex && selected[index] && cleanLabel(optionValue(variant, index)) !== cleanLabel(selected[index])) {
          return false;
        }
      }
      return true;
    });

    return candidates.length ? candidates[0] : null;
  }

  function resolveProductCardAction(product, record) {
    var variants = product && product.variants || [];
    var sellable = variants.filter(function (variant) { return !!variant.available; });
    var optionIndex = findSizeOptionIndex(product && product.options_with_values || product && product.options || []);
    var values = optionIndex < 0 ? [] : sizeValues(product, optionIndex);
    var meaningfulSize = optionIndex >= 0 && !isOneSize(values);
    var options = product && product.options_with_values || [];
    var hasUnresolvedOption = options.some(function (option, index) {
      if (index === optionIndex) {
        return false;
      }
      var unique = [];
      (option && option.values || []).forEach(function (value) {
        var cleaned = cleanLabel(value);
        if (cleaned && unique.indexOf(cleaned) === -1) {
          unique.push(cleaned);
        }
      });
      return unique.length !== 1;
    });

    if (!sellable.length) {
      return { state: 'sold_out', variantId: null };
    }

    if (!meaningfulSize) {
      return !hasUnresolvedOption && sellable.length === 1 ?
        { state: 'add', variantId: sellable[0].id } :
        { state: 'choose_options', variantId: null };
    }

    var selectedValues = selectedSizeValues(record);
    if (!selectedValues.length) {
      return { state: 'select_size', variantId: null };
    }

    var classifications = selectedValues.map(function (value) { return classifyPreferredSize(product, value); });
    var classification = classifications.some(function (item) { return item.state === 'available'; }) ? { state: 'available' } :
      classifications.some(function (item) { return item.state === 'sold_out'; }) ? { state: 'sold_out' } : { state: 'unavailable' };
    if (classification.state === 'sold_out') {
      return { state: 'size_sold_out', variantId: null };
    }
    if (classification.state !== 'available') {
      return { state: 'unavailable', variantId: null };
    }

    if (hasUnresolvedOption) {
      return { state: 'choose_options', variantId: null };
    }

    var matching = variants.filter(function (variant) {
      return !!variant.available && selectedValues.indexOf(normalizeSizeLabel(optionValue(variant, optionIndex))) !== -1;
    });
    return matching.length === 1 ?
      { state: 'add', variantId: matching[0].id } :
      { state: 'choose_options', variantId: null };
  }

  function createStorageAdapter(storage) {
    function unset() {
      return { state: 'unset', values: [], displays: [], value: '', display: '' };
    }

    function normalizeSelections(values) {
      var normalized = [];
      (values || []).forEach(function (entry) {
        var rawValue = entry && typeof entry === 'object' ? entry.value : entry;
        var rawDisplay = entry && typeof entry === 'object' ? entry.display : entry;
        var value = normalizeSizeLabel(rawValue);
        if (value && !normalized.some(function (item) { return item.value === value; })) {
          normalized.push({ value: value, display: safeDisplayLabel(rawDisplay, value) });
        }
      });
      return normalized;
    }

    function recordFor(values) {
      var normalized = normalizeSelections(values);
      return {
        state: normalized.length ? 'selected' : 'unset',
        values: normalized.map(function (item) { return item.value; }),
        displays: normalized.map(function (item) { return item.display; }),
        value: normalized.length ? normalized[0].value : '',
        display: normalized.length ? normalized[0].display : ''
      };
    }

    function writeFilters(values) {
      var record = recordFor(values);
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, values: record.values, displays: record.displays }));
        return true;
      } catch (error) {
        return false;
      }
    }

    return {
      read: function () {
        try {
          var raw = storage.getItem(STORAGE_KEY);
          if (!raw) {
            var legacyRaw = storage.getItem(LEGACY_SESSION_KEY);
            if (legacyRaw) {
              var legacy = JSON.parse(legacyRaw);
              if (legacy && legacy.version === 1 && normalizeSizeLabel(legacy.value)) {
                writeFilters([{ value: legacy.value, display: legacy.display }]);
                storage.removeItem(LEGACY_SESSION_KEY);
                return recordFor([{ value: legacy.value, display: legacy.display }]);
              }
            }
            return unset();
          }
          var record = JSON.parse(raw);
          if (record.version !== 1 || !Array.isArray(record.values)) {
            return unset();
          }
          return recordFor(record.values.map(function (value, index) {
            return { value: value, display: (record.displays || [])[index] };
          }));
        } catch (error) {
          return unset();
        }
      },
      isPromptCompleted: function () {
        try { return storage.getItem(PROMPT_COMPLETED_KEY) === 'true'; } catch (error) { return false; }
      },
      complete: function (value) {
        var normalized = normalizeSelections([value]);
        if (!normalized.length) { return false; }
        try {
          storage.setItem(PROMPT_COMPLETED_KEY, 'true');
          return writeFilters(normalized);
        } catch (error) { return false; }
      },
      setFilters: function (values) {
        return writeFilters(values);
      },
      select: function (value) {
        return writeFilters([value]);
      },
      clear: function () {
        return writeFilters([]);
      }
    };
  }

  function parseJson(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function productFromElement(element) {
    var variantsNode = element.querySelector('[data-product-variants]');
    return {
      options_with_values: parseJson(element.getAttribute('data-product-options') || '[]', []),
      variants: parseJson(element.getAttribute('data-product-variants') || (variantsNode ? variantsNode.textContent : '[]'), [])
    };
  }

  function isFullySoldOut(product) {
    var variants = product && product.variants || [];
    return !!variants.length && !variants.some(function (variant) { return !!variant.available; });
  }

  function formatStatus(template, value) {
    return String(template || '').replace(/\{\{\s*size\s*\}\}/g, value);
  }

  function hasProductContext(scope) {
    var context = scope && scope.querySelector ? scope : document;
    return !!context.querySelector('[data-size-product], [data-size-product-page], .product_item');
  }

  function initDom() {
    var rootElement = document.querySelector('[data-size-preference-root]');
    if (!rootElement || rootElement.getAttribute('data-size-preference-initialized') === 'true') {
      return;
    }
    rootElement.setAttribute('data-size-preference-initialized', 'true');

    var memoryValues = {};
    try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (legacyStorageError) {}
    var storage = {
      getItem: function (key) {
        try {
          var value = window.sessionStorage.getItem(key);
          return value == null && Object.prototype.hasOwnProperty.call(memoryValues, key) ? memoryValues[key] : value;
        } catch (sessionError) {
          return Object.prototype.hasOwnProperty.call(memoryValues, key) ? memoryValues[key] : null;
        }
      },
      setItem: function (key, value) {
        memoryValues[key] = String(value);
        try { window.sessionStorage.setItem(key, value); } catch (sessionError) {}
      },
      removeItem: function (key) {
        delete memoryValues[key];
        try {
          window.sessionStorage.removeItem(key);
          return true;
        } catch (sessionError) {
          return false;
        }
      }
    };
    var adapter = createStorageAdapter(storage);
    var dialog = rootElement.querySelector('[data-size-preference-dialog]');
    var form = rootElement.querySelector('[data-size-preference-form]');
    var choices = rootElement.querySelector('[data-size-preference-choices]');
    var confirmButton = rootElement.querySelector('[data-size-preference-confirm]');
    var live = rootElement.querySelector('[data-size-preference-live]');
    var lastTrigger = null;
    var previousOverflow = '';
    var backgroundState = [];
    var dialogOpen = false;
    var dialogFocusTimer = null;
    var returnFocusTimer = null;
    var promptTimer = null;
    var productRenderGeneration = 0;
    var dismissedRenderGeneration = -1;
    var productRetryTimer = null;
    var productRetryGeneration = 0;
    var selectedSize = '';
    var savePending = false;
    var fallbackSizes = ['S', 'M', 'L', 'XL', 'XXL'];
    var strings = {
      choose: rootElement.getAttribute('data-label-choose') || 'Choose size',
      selected: rootElement.getAttribute('data-label-selected') || 'Size: {{ size }}',
      available: rootElement.getAttribute('data-status-available') || 'Your size {{ size }} is available',
      soldOut: rootElement.getAttribute('data-status-sold-out') || 'Size {{ size }} is sold out',
      currentlySoldOut: rootElement.getAttribute('data-status-currently-sold-out') || 'Currently sold out',
      selectSize: rootElement.getAttribute('data-status-select-size') || 'Select a size to continue',
      unavailable: rootElement.getAttribute('data-status-unavailable') || '{{ size }} unavailable',
      oneSize: rootElement.getAttribute('data-status-one-size') || 'One size',
      notApplicable: rootElement.getAttribute('data-status-not-applicable') || 'Size preference not applicable',
      saved: rootElement.getAttribute('data-status-saved') || 'Preferred size updated to {{ size }}',
      cardAdd: rootElement.getAttribute('data-card-add-label') || 'Add to cart',
      cardSoldOut: rootElement.getAttribute('data-card-sold-out-label') || 'Sold out',
      cardChooseAnotherSize: rootElement.getAttribute('data-card-choose-another-size-label') || 'Choose another size',
      cardChooseOptions: rootElement.getAttribute('data-card-choose-options-label') || 'Choose options',
      cardViewProduct: rootElement.getAttribute('data-card-view-product-label') || 'View product'
    };
    var cartAddUrl = rootElement.getAttribute('data-cart-add-url') || '/cart/add';

    function current() {
      return adapter.read();
    }

    function collectSizes() {
      var labels = [];
      function mergeProductSizes(product) {
        var index = findSizeOptionIndex(product.options_with_values || product.options || []);
        if (index < 0) {
          return;
        }
        sizeValues(product, index).forEach(function (value) {
          var normalized = normalizeSizeLabel(value);
          if (normalized && !isOneSize([value]) && !labels.some(function (label) { return normalizeSizeLabel(label) === normalized; })) {
            labels.push(value);
          }
        });
      }
      Array.prototype.forEach.call(document.querySelectorAll('[data-product-options]'), function (element) {
        mergeProductSizes(productFromElement(element));
      });
      if (window.productData) {
        mergeProductSizes(window.productData);
      }
      return labels.length ? labels : fallbackSizes.slice();
    }

    function renderChoices() {
      var record = current();
      selectedSize = hasValidSessionSizePreference(record) ? record.value : '';
      choices.innerHTML = collectSizes().map(function (value, index) {
        var selected = normalizeSizeLabel(selectedSize) === normalizeSizeLabel(value);
        var attributeValue = String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        var textValue = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        return '<button type="button" class="size-preference__choice needsclick' + (selected ? ' is-selected' : '') + '" data-size-preference-choice data-size-value="' + attributeValue + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' + textValue + '</button>';
      }).join('');
      confirmButton.disabled = !selectedSize;
      confirmButton.removeAttribute('aria-busy');
      confirmButton.classList.remove('is-loading');
      savePending = false;
    }

    function selectChoice(button) {
      var value = button && button.getAttribute('data-size-value');
      if (!normalizeSizeLabel(value)) {
        return;
      }
      selectedSize = value;
      Array.prototype.forEach.call(choices.querySelectorAll('[data-size-preference-choice]'), function (choice) {
        var isSelected = choice === button;
        choice.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        choice.classList.toggle('is-selected', isSelected);
      });
      confirmButton.disabled = false;
    }

    function focusable() {
      return dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
    }

    function isolateBackground() {
      backgroundState = [];
      Array.prototype.forEach.call(document.querySelectorAll('#PageContainer, #CartDrawer'), function (element) {
        var supportsInert = 'inert' in element;
        backgroundState.push({
          element: element,
          supportsInert: supportsInert,
          inert: !!element.inert,
          hadInertAttribute: element.hasAttribute('inert'),
          hadAriaHidden: element.hasAttribute('aria-hidden'),
          ariaHidden: element.getAttribute('aria-hidden')
        });
        if (supportsInert) {
          element.inert = true;
        } else {
          element.setAttribute('aria-hidden', 'true');
        }
      });
    }

    function restoreBackground() {
      backgroundState.forEach(function (state) {
        if (state.supportsInert) {
          state.element.inert = state.inert;
          if (!state.hadInertAttribute && !state.inert) {
            state.element.removeAttribute('inert');
          }
        }
        if (state.hadAriaHidden) {
          state.element.setAttribute('aria-hidden', state.ariaHidden);
        } else {
          state.element.removeAttribute('aria-hidden');
        }
      });
      backgroundState = [];
    }

    function openDialog(trigger) {
      if (dialogOpen) {
        return;
      }
      if (returnFocusTimer) {
        window.clearTimeout(returnFocusTimer);
        returnFocusTimer = null;
      }
      lastTrigger = trigger || document.activeElement;
      renderChoices();
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      isolateBackground();
      dialog.hidden = false;
      dialog.classList.add('is-open');
      dialogOpen = true;
      var selected = choices.querySelector('[data-size-preference-choice][aria-pressed="true"]') || choices.querySelector('[data-size-preference-choice]');
      dialogFocusTimer = window.setTimeout(function () {
        dialogFocusTimer = null;
        if (dialogOpen) { (selected || dialog).focus(); }
      }, 0);
    }

    function closeDialog() {
      if (!dialogOpen) {
        return;
      }
      dialog.classList.remove('is-open');
      if (dialogFocusTimer) {
        window.clearTimeout(dialogFocusTimer);
        dialogFocusTimer = null;
      }
      dialog.hidden = true;
      document.documentElement.style.overflow = previousOverflow;
      restoreBackground();
      dialogOpen = false;
      if (lastTrigger && lastTrigger.focus) {
        var focusTarget = lastTrigger;
        returnFocusTimer = window.setTimeout(function () {
          returnFocusTimer = null;
          focusTarget.focus();
        }, 0);
      }
    }

    function dispatchChange() {
      var record = current();
      document.dispatchEvent(new CustomEvent('entitled:size-preference-change', { detail: record }));
    }

    function maybeOpenPrompt() {
      if (!SIZE_PREFERENCE_PROMPT_ENABLED) {
        return;
      }
      var designMode = !!(window.Shopify && window.Shopify.designMode);
      var generation = productRenderGeneration;
      if (!dialogOpen && !promptTimer && !adapter.isPromptCompleted() && hasProductContext(document) && !designMode && dismissedRenderGeneration !== generation) {
        promptTimer = window.setTimeout(function () {
          promptTimer = null;
          if (!dialogOpen && !adapter.isPromptCompleted() && hasProductContext(document) && dismissedRenderGeneration !== generation) {
            openDialog(null);
          }
        }, 250);
      }
    }

    function dismissDialog() {
      dismissedRenderGeneration = productRenderGeneration;
      closeDialog();
    }

    function updateControls() {
      var record = current();
      Array.prototype.forEach.call(document.querySelectorAll('[data-size-preference-open]'), function (control) {
        var label = hasValidSessionSizePreference(record) ? formatStatus(strings.selected, record.display || record.value) : strings.choose;
        var value = control.querySelector('[data-size-preference-control-label]');
        if (value) {
          value.textContent = label;
        }
        control.setAttribute('aria-label', label);
      });
    }

    function updateCards() {
      var record = current();
      Array.prototype.forEach.call(document.querySelectorAll('[data-size-product]'), function (card) {
        var status = card.querySelector('[data-size-preference-status]');
        if (!status) {
          return;
        }
        status.className = 'product-size-status';
        var product = productFromElement(card);
        var fullySoldOut = isFullySoldOut(product);
        var action = updateCardAction(card, record);
        card.classList.toggle('product_item--sold-out', fullySoldOut);
        card.setAttribute('data-product-card-state', fullySoldOut ? 'sold_out' : 'available');
        if (fullySoldOut) {
          status.hidden = false;
          status.classList.add('product-size-status--sold_out');
          status.setAttribute('data-size-state', 'sold_out');
          status.textContent = strings.currentlySoldOut;
          return;
        }
        if (!hasValidSessionSizePreference(record)) {
          status.hidden = !action || action.state !== 'select_size';
          status.classList.toggle('product-size-status--select_size', !status.hidden);
          status.textContent = status.hidden ? '' : strings.selectSize;
          return;
        }
        var selectedValues = selectedSizeValues(record);
        var results = selectedValues.map(function (value) { return classifyPreferredSize(product, value); });
        var result = results.some(function (item) { return item.state === 'available'; }) ? { state: 'available' } :
          results.some(function (item) { return item.state === 'sold_out'; }) ? { state: 'sold_out' } :
          results.some(function (item) { return item.state === 'unavailable'; }) ? { state: 'unavailable' } : results[0];
        var selectedDisplays = record.displays && record.displays.length ? record.displays : selectedValues;
        var matchingDisplays = selectedDisplays.filter(function (label, index) { return results[index] && results[index].state === result.state; });
        var display = (matchingDisplays.length ? matchingDisplays : selectedDisplays).join(', ');
        status.hidden = false;
        status.classList.add('product-size-status--' + result.state);
        status.setAttribute('data-size-state', result.state);
        if (result.state === 'available') {
          status.textContent = formatStatus(strings.available, display);
        } else if (result.state === 'sold_out') {
          card.setAttribute('data-product-card-state', 'size_sold_out');
          status.textContent = formatStatus(strings.soldOut, display);
        } else if (result.state === 'unavailable') {
          card.setAttribute('data-product-card-state', 'size_sold_out');
          status.textContent = formatStatus(strings.soldOut, display);
        } else {
          status.textContent = result.display ? strings.oneSize : strings.notApplicable;
        }
      });
    }

    function updateCardAction(card, record) {
      var host = card.querySelector('[data-size-preference-card-action]');
      if (!host) {
        return null;
      }
      var action = resolveProductCardAction(productFromElement(card), record);
      var productUrl = card.getAttribute('data-product-url') || '#';
      var form = host.querySelector('[data-product-card-form]');
      var variantInput = host.querySelector('[data-product-card-variant]');
      var quantityInput = host.querySelector('[data-product-card-quantity]');
      var primary = host.querySelector('[data-product-card-primary]');
      var primaryLink = host.querySelector('[data-product-card-primary-link]');
      var buyNow = host.querySelector('[data-buy-now-trigger]');
      var viewProduct = host.querySelector('[data-product-card-view]');
      var isAdd = action.state === 'add';
      var isSoldOut = action.state === 'sold_out';
      var isSizeChoice = action.state === 'select_size' || action.state === 'size_sold_out' || action.state === 'unavailable';

      host.setAttribute('data-card-action-state', action.state);

      if (!form || !variantInput || !quantityInput || !primary || !primaryLink || !buyNow || !viewProduct) {
        return action;
      }

      form.action = cartAddUrl;
      form.method = 'post';
      form.toggleAttribute('data-size-preference-card-form', isAdd);
      variantInput.disabled = !isAdd;
      variantInput.value = isAdd && action.variantId ? String(action.variantId) : '';
      quantityInput.disabled = !isAdd;
      quantityInput.value = quantityInput.value || '1';

      primary.hidden = action.state === 'choose_options';
      primary.type = isAdd ? 'submit' : 'button';
      primary.disabled = isSoldOut;
      primary.classList.toggle('is-disabled', isSoldOut);
      if (isSoldOut) {
        primary.setAttribute('aria-disabled', 'true');
      } else {
        primary.removeAttribute('aria-disabled');
      }
      primary.toggleAttribute('data-size-preference-card-select', isSizeChoice);
      if (isAdd) {
        primary.setAttribute('name', 'add');
      } else {
        primary.removeAttribute('name');
      }
      primary.textContent = isAdd ? strings.cardAdd :
        isSoldOut ? strings.cardSoldOut :
        action.state === 'select_size' ? strings.choose : strings.cardChooseAnotherSize;

      primaryLink.hidden = action.state !== 'choose_options';
      primaryLink.href = productUrl;
      primaryLink.textContent = strings.cardChooseOptions;

      buyNow.hidden = !isAdd;
      buyNow.disabled = !isAdd;
      buyNow.setAttribute('aria-disabled', isAdd ? 'false' : 'true');

      viewProduct.hidden = isAdd;
      viewProduct.href = productUrl;
      viewProduct.textContent = strings.cardViewProduct;
      return action;
    }

    function selectedProductOptions() {
      var values = [];
      if (window.jQuery) {
        window.jQuery('.single-option-selector').each(function () { values.push(window.jQuery(this).val()); });
      }
      return values;
    }

    function updateProductPage(allowPreselect) {
      var productRoot = document.querySelector('[data-size-product-page]');
      if (!productRoot || !window.productData) {
        return 'blocked';
      }
      var record = current();
      var status = productRoot.querySelector('[data-size-preference-product-status]');
      if (!hasValidSessionSizePreference(record)) {
        status.hidden = true;
        status.textContent = '';
        return 'blocked';
      }
      var selectedValues = selectedSizeValues(record);
      var results = selectedValues.map(function (value) { return classifyPreferredSize(window.productData, value); });
      var result = results.some(function (item) { return item.state === 'available'; }) ? { state: 'available', optionIndex: findSizeOptionIndex(window.productData.options_with_values || window.productData.options || []) } :
        results.some(function (item) { return item.state === 'sold_out'; }) ? { state: 'sold_out' } :
        results.some(function (item) { return item.state === 'unavailable'; }) ? { state: 'unavailable' } : results[0];
      var selectedDisplays = record.displays && record.displays.length ? record.displays : selectedValues;
      var matchingDisplays = selectedDisplays.filter(function (label, index) { return results[index] && results[index].state === result.state; });
      var display = (matchingDisplays.length ? matchingDisplays : selectedDisplays).join(', ');
      status.hidden = false;
      status.className = 'product-size-preference product-size-status--' + result.state;
      status.textContent = result.state === 'available' ? formatStatus(strings.available, display) :
        result.state === 'sold_out' ? formatStatus(strings.soldOut, display) :
        result.state === 'unavailable' ? formatStatus(strings.unavailable, display) : (result.display ? strings.oneSize : strings.notApplicable);

      var explicitVariantId = new URL(window.location.href).searchParams.get('variant');
      if (!allowPreselect || explicitVariantId || result.state !== 'available' || selectedValues.length !== 1) {
        return 'blocked';
      }
      if (productRoot.getAttribute('data-size-preference-applied') === record.value) {
        return 'done';
      }
      var optionNames = window.productData.options_with_values || window.productData.options || [];
      var selectedOptions = selectedProductOptions();
      if (optionNames.length > 1 && selectedOptions.length < optionNames.length) {
        return 'pending';
      }
      var preferredVariant = resolvePreferredVariant({
        product: window.productData,
        preferredSize: selectedValues[0],
        selectedOptions: selectedOptions
      });
      if (!preferredVariant || result.optionIndex < 0 || !window.jQuery) {
        return window.jQuery ? 'blocked' : 'pending';
      }
      var rawSize = optionValue(preferredVariant, result.optionIndex);
      var selector = window.jQuery('.single-option-selector').eq(result.optionIndex);
      if (!selector.length) {
        return 'pending';
      }
      productRoot.setAttribute('data-size-preference-applied', record.value);
      if (selector.val() !== rawSize) {
        selector.val(rawSize).trigger('change');
      }
      return 'done';
    }

    function scheduleProductPreselection() {
      var generation = ++productRetryGeneration;
      var attempts = 0;
      if (productRetryTimer) {
        window.clearTimeout(productRetryTimer);
        productRetryTimer = null;
      }

      function attempt() {
        if (generation !== productRetryGeneration) {
          return;
        }
        attempts += 1;
        var result = updateProductPage(true);
        if (result !== 'pending' || attempts >= PDP_MAX_ATTEMPTS) {
          productRetryTimer = null;
          return;
        }
        productRetryTimer = window.setTimeout(attempt, PDP_RETRY_DELAY);
      }
      attempt();
    }

    function refresh(allowPreselect) {
      updateControls();
      updateCards();
      updateProductPage(allowPreselect);
    }

    publicApi.refreshProductCards = function () {
      refresh(false);
    };

    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-size-preference-open]');
      if (trigger) {
        event.preventDefault();
        openDialog(trigger);
      }
      var cardSelect = event.target.closest('[data-size-preference-card-select]');
      if (cardSelect) {
        event.preventDefault();
        openDialog(cardSelect);
      }
      if (event.target.closest('[data-size-preference-close]')) {
        event.preventDefault();
        dismissDialog();
      }
      if (event.target.closest('[data-size-preference-skip]')) {
        event.preventDefault();
        dismissDialog();
      }
      if (event.target.closest('[data-size-preference-clear]')) {
        event.preventDefault();
        adapter.clear();
        closeDialog();
        dispatchChange();
      }
    });

    document.addEventListener('submit', function (event) {
      var cardForm = event.target.closest && event.target.closest('[data-size-preference-card-form]');
      if (!cardForm || !window.ShopifyAPI || typeof window.ShopifyAPI.addItemFromForm !== 'function') {
        return;
      }
      event.preventDefault();
      if (cardForm.getAttribute('data-cart-request-pending') === 'true') {
        return;
      }

      var button = cardForm.querySelector('.product_card_button');
      cardForm.setAttribute('data-cart-request-pending', 'true');
      if (button) {
        button.disabled = true;
        button.classList.remove('is-added');
        button.classList.add('is-adding');
      }

      function finish(success) {
        cardForm.removeAttribute('data-cart-request-pending');
        if (button) {
          button.disabled = false;
          button.classList.remove('is-adding');
          button.classList.toggle('is-added', !!success);
        }
      }

      window.ShopifyAPI.addItemFromForm(cardForm, function () {
        if (window.ajaxCart && typeof window.ajaxCart.load === 'function') {
          window.ajaxCart.load();
        }
        window.setTimeout(function () { finish(true); }, 800);
      }, function (request) {
        var message = 'Unable to add this item. Please try again.';
        try {
          var payload = JSON.parse(request && request.responseText || '{}');
          message = payload.description || payload.message || message;
        } catch (parseError) {}
        var error = cardForm.querySelector('[data-product-card-error]') || document.createElement('p');
        error.className = 'errors qty-error product_card_error';
        error.setAttribute('data-product-card-error', '');
        error.setAttribute('role', 'alert');
        error.textContent = message;
        if (!error.parentNode) {
          cardForm.insertBefore(error, button || null);
        }
        finish(false);
      });
    });

    choices.addEventListener('click', function (event) {
      var choice = event.target.closest && event.target.closest('[data-size-preference-choice]');
      if (!choice || !choices.contains(choice)) {
        return;
      }
      selectChoice(choice);
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (savePending || !normalizeSizeLabel(selectedSize)) {
        confirmButton.disabled = true;
        return;
      }
      savePending = true;
      confirmButton.disabled = true;
      confirmButton.setAttribute('aria-busy', 'true');
      confirmButton.classList.add('is-loading');
      if (!adapter.complete(selectedSize)) {
        savePending = false;
        confirmButton.disabled = false;
        confirmButton.removeAttribute('aria-busy');
        confirmButton.classList.remove('is-loading');
        return;
      }
      dispatchChange();
      closeDialog();
      var record = current();
      live.textContent = formatStatus(strings.saved, record.display || record.value);
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissDialog();
      }
      if (event.key === 'Tab') {
        var items = focusable();
        if (!items.length) {
          event.preventDefault();
          return;
        }
        var first = items[0];
        var last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    document.addEventListener('entitled:size-preference-change', function () {
      var productRoot = document.querySelector('[data-size-product-page]');
      if (productRoot) { productRoot.removeAttribute('data-size-preference-applied'); }
      refresh(false);
      if (SIZE_PREFERENCE_PROMPT_ENABLED) {
        scheduleProductPreselection();
      }
      maybeOpenPrompt();
    });
    document.addEventListener('entitled:size-filter-change', function (event) {
      var detail = event.detail || {};
      var nextValues = detail.values || (detail.value ? [{ value: detail.value, display: detail.display }] : []);
      if (detail.changedValue) {
        var changed = normalizeSizeLabel(detail.changedValue);
        nextValues = current().values.map(function (value, index) {
          return { value: value, display: current().displays[index] || value };
        }).filter(function (item) {
          return detail.checked || normalizeSizeLabel(item.value) !== changed;
        });
        if (detail.checked && !nextValues.some(function (item) { return normalizeSizeLabel(item.value) === changed; })) {
          nextValues.push({ value: detail.changedValue, display: detail.changedValue });
        }
      }
      adapter.setFilters(nextValues);
      dispatchChange();
    });
    if (SIZE_PREFERENCE_PROMPT_ENABLED) {
      document.addEventListener('entitled:size-filter-ready', dispatchChange);
    }
    document.addEventListener('entitled:collection-rendered', function () {
      productRenderGeneration += 1;
      refresh(false);
      if (SIZE_PREFERENCE_PROMPT_ENABLED) {
        scheduleProductPreselection();
        maybeOpenPrompt();
      }
    });
    if (SIZE_PREFERENCE_PROMPT_ENABLED) {
      document.addEventListener('entitled:variant-selectors-ready', scheduleProductPreselection);
    }
    document.addEventListener('shopify:section:load', function (event) {
      if (hasProductContext(event.target)) {
        productRenderGeneration += 1;
      }
      refresh(false);
      if (SIZE_PREFERENCE_PROMPT_ENABLED) {
        scheduleProductPreselection();
        maybeOpenPrompt();
      }
    });
    refresh(false);
    if (SIZE_PREFERENCE_PROMPT_ENABLED) {
      scheduleProductPreselection();
      maybeOpenPrompt();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDom);
    } else {
      initDom();
    }
  }

  publicApi.STORAGE_KEY = STORAGE_KEY;
  publicApi.PROMPT_COMPLETED_KEY = PROMPT_COMPLETED_KEY;
  publicApi.LEGACY_SESSION_KEY = LEGACY_SESSION_KEY;
  publicApi.LEGACY_STORAGE_KEY = LEGACY_STORAGE_KEY;
  publicApi.normalizeSizeLabel = normalizeSizeLabel;
  publicApi.findSizeOptionIndex = findSizeOptionIndex;
  publicApi.classifyPreferredSize = classifyPreferredSize;
  publicApi.resolvePreferredVariant = resolvePreferredVariant;
  publicApi.createStorageAdapter = createStorageAdapter;
  publicApi.hasProductContext = hasProductContext;
  publicApi.hasValidSessionSizePreference = hasValidSessionSizePreference;
  publicApi.resolveProductCardAction = resolveProductCardAction;

  return publicApi;
}));
