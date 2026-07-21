(function () {
  'use strict';

  function initProductCardMedia(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var tracks = scope.querySelectorAll('[data-product-card-track]');

    Array.prototype.forEach.call(tracks, function (track) {
      if (track._productCardMediaReady) {
        return;
      }

      var cardImage = track.closest('.product_image');
      var dots = cardImage ? cardImage.querySelectorAll('[data-product-card-indicator-dot]') : [];
      var indicator = cardImage ? cardImage.querySelector('[data-product-card-indicator]') : null;
      var slides = track.querySelectorAll('.product_image__slide');
      var total = slides.length;
      var resizeFrame = null;
      var touchStartX = 0;

      if (!cardImage || !dots.length || total < 2) {
        return;
      }

      function normalizeFrame() {
        cardImage.style.height = '';
        cardImage.style.minHeight = '';
        cardImage.style.maxHeight = '';
        track.style.height = '100%';
      }

      function renderIndex(index) {
        var safeIndex = Math.max(1, Math.min(total, index));

        Array.prototype.forEach.call(dots, function (dot, dotIndex) {
          dot.classList.toggle('is-active', dotIndex === safeIndex - 1);
        });
      }

      function syncFromScroll() {
        var width = track.clientWidth || cardImage.clientWidth || 1;
        renderIndex(Math.round(track.scrollLeft / width) + 1);
      }

      function syncOnResize() {
        if (resizeFrame) {
          window.cancelAnimationFrame(resizeFrame);
        }

        resizeFrame = window.requestAnimationFrame(function () {
          var width = track.clientWidth || cardImage.clientWidth || 1;
          var activeIndex = Math.round(track.scrollLeft / width);

          normalizeFrame();
          track.scrollLeft = width * activeIndex;
          syncFromScroll();
        });
      }

      track._productCardMediaReady = true;
      normalizeFrame();
      if (indicator) {
        indicator.style.setProperty('--product-card-dot-count', String(dots.length));
      }
      renderIndex(1);
      track.addEventListener('scroll', syncFromScroll, { passive: true });
      track.addEventListener('touchstart', function (event) {
        touchStartX = event.touches[0].clientX;
      }, { passive: true });
      track.addEventListener('touchend', function (event) {
        var width = track.clientWidth || cardImage.clientWidth || 1;
        var activeIndex = Math.round(track.scrollLeft / width);
        var swipedPastLast = activeIndex >= total - 1 && touchStartX - event.changedTouches[0].clientX > 24;

        if (swipedPastLast) {
          track.scrollTo({ left: 0, behavior: 'smooth' });
          renderIndex(1);
        }
      }, { passive: true });
      window.addEventListener('resize', syncOnResize, { passive: true });

      Array.prototype.forEach.call(dots, function (dot) {
        dot.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();

          var index = Number(event.currentTarget.getAttribute('data-product-card-indicator-index') || 0);
          var width = track.clientWidth || cardImage.clientWidth || 1;

          track.scrollTo({
            left: width * index,
            behavior: 'smooth'
          });
          renderIndex(index + 1);
        });
      });

      cardImage.addEventListener('mouseenter', function () {
        if (window.innerWidth >= 768 && total > 1) {
          renderIndex(2);
        }
      });

      cardImage.addEventListener('mouseleave', function () {
        if (window.innerWidth >= 768) {
          renderIndex(1);
        }
      });

      Array.prototype.forEach.call(slides, function (slide) {
        slide.setAttribute('draggable', 'false');
      });
    });
  }

  function initCollectionFilters() {
    initProductCardMedia(document);

    var filters = document.querySelector('[data-collection-filters]');

    if (!filters || filters.getAttribute('data-filters-ready') === 'true') {
      return;
    }

    var combobox = filters.querySelector('[data-filter-combobox]');
    var search = filters.querySelector('[data-filter-search]');
    var dropdown = filters.querySelector('[data-filter-dropdown]');
    var dropdownToggle = filters.querySelector('[data-filter-dropdown-toggle]');
    var empty = filters.querySelector('[data-filter-empty]');
    var groupsHost = filters.querySelector('[data-client-filter-groups]');
    var selectedCount = filters.querySelector('[data-filter-selected-count]');
    var drawerOpen = document.querySelector('[data-filter-drawer-open]');
    var drawerClose = document.querySelectorAll('[data-filter-drawer-close]');
    var triggerCount = document.querySelector('[data-filter-trigger-count]');
    var siteHeader = document.querySelector('header');
    var applyButton = filters.querySelector('[data-client-filter-apply]');
    var clearButton = filters.querySelector('[data-client-filter-clear]');
    var productList = document.querySelector('[data-collection-product-list]');
    var productCount = document.querySelector('[data-collection-product-count]');
    var pagination = document.querySelector('[data-collection-pagination]');
    var baseUrl = filters.getAttribute('data-collection-url') || window.location.pathname;
    var sortBy = new URL(window.location.href).searchParams.get('sort_by') || '';
    var stickyOffsetFrame = null;
    var originalProductMarkup = productList ? productList.innerHTML : '';
    var originalCountMarkup = productCount ? productCount.textContent : '';
    var filterData = null;
    var activeFiltersHost = filters.querySelector('[data-active-filters]');
    var productMarkupById = {};
    var renderProductsPromise = null;

    if (productList) {
      Array.prototype.forEach.call(productList.querySelectorAll('[data-collection-product]'), function (card) {
        var productId = String(card.getAttribute('data-product-id') || '').trim();

        if (productId && card.parentNode) {
          productMarkupById[productId] = card.parentNode.outerHTML;
        }
      });
    }

    filters.setAttribute('data-filters-ready', 'true');

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function slugify(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function parseJson(text) {
      try {
        return JSON.parse(text);
      } catch (error) {
        return null;
      }
    }

    function uniqueValues(values) {
      return values.filter(function (value, index) {
        return values.indexOf(value) === index;
      });
    }

    function getOptions() {
      return filters.querySelectorAll('[data-filter-option]');
    }

    function getGroups() {
      return filters.querySelectorAll('[data-filter-group]');
    }

    function getInputs() {
      return filters.querySelectorAll('input[data-filter-value]');
    }

    function setDropdown(open) {
      if (!combobox || !search) {
        return;
      }

      combobox.classList.toggle('is-open', open);
      search.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function updateSelectedCount() {
      var count = filters.querySelectorAll('[data-filter-value]:checked').length;

      if (selectedCount) {
        selectedCount.textContent = count;
        selectedCount.classList.toggle('is-empty', count === 0);
      }

      if (triggerCount) {
        triggerCount.textContent = count;
        triggerCount.hidden = count === 0;
      }

      renderActiveFilters();
    }

    function setDrawer(open) {
      filters.classList.toggle('is-drawer-open', open);
      document.documentElement.classList.toggle('collection-filter-drawer-open', open);

      if (drawerOpen) {
        drawerOpen.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      if (open && search) {
        window.setTimeout(function () {
          search.focus();
        }, 180);
      }
    }

    function updateStickyOffset() {
      stickyOffsetFrame = null;

      if (siteHeader) {
        document.documentElement.style.setProperty(
          '--collection-filter-sticky-top',
          Math.ceil(siteHeader.getBoundingClientRect().height + 16) + 'px'
        );
      }
    }

    function queueStickyOffset() {
      if (!stickyOffsetFrame) {
        stickyOffsetFrame = window.requestAnimationFrame(updateStickyOffset);
      }
    }

    function setGroupExpanded(group, expanded) {
      if (!group) {
        return;
      }

      group.classList.toggle('is-expanded', expanded);

      var toggle = group.querySelector('[data-filter-group-toggle]');
      if (toggle) {
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }
    }

    function filterOptions() {
      var query = search ? search.value.trim().toLowerCase() : '';
      var visibleTotal = 0;

      Array.prototype.forEach.call(getOptions(), function (option) {
        var input = option.querySelector('[data-filter-value]');
        var text = (option.getAttribute('data-filter-search-text') || '').toLowerCase();
        var available = option.getAttribute('data-filter-option-available') !== 'false';
        var visible = !!(input && input.checked) || (available && (!query || text.indexOf(query) !== -1));

        option.hidden = !visible;
        if (visible) {
          visibleTotal += 1;
        }
      });

      Array.prototype.forEach.call(getGroups(), function (group) {
        var visibleOptions = group.querySelectorAll('[data-filter-option]:not([hidden])');
        var hasVisibleOptions = visibleOptions.length > 0;

        group.hidden = !hasVisibleOptions;
        group.classList.toggle('is-search-open', !!query && hasVisibleOptions);

        var toggle = group.querySelector('[data-filter-group-toggle]');
        if (toggle) {
          toggle.setAttribute(
            'aria-expanded',
            group.classList.contains('is-expanded') || group.classList.contains('is-search-open') ? 'true' : 'false'
          );
        }

        var meta = group.querySelector('.collection-filter-group__meta');
        if (meta) {
          meta.textContent = visibleOptions.length + ' option' + (visibleOptions.length === 1 ? '' : 's');
        }
      });

      if (empty) {
        empty.hidden = visibleTotal !== 0;
      }
    }

    function getSelections(excludeGroupKey) {
      var selections = {
        brand: [],
        color: [],
        type: []
      };

      Array.prototype.forEach.call(getInputs(), function (input) {
        if (!input.checked) {
          return;
        }

        var key = input.getAttribute('data-filter-group-key');
        var value = input.getAttribute('data-filter-value');

        if (key && key !== excludeGroupKey && selections[key]) {
          selections[key].push(value);
        }
      });

      return selections;
    }

    function renderActiveFilters() {
      if (!activeFiltersHost) {
        return;
      }

      var chips = [];

      Array.prototype.forEach.call(getInputs(), function (input) {
        if (!input.checked) {
          return;
        }

        var group = input.closest('[data-filter-group]');
        var groupLabelEl = group ? group.querySelector('.collection-filter-group__title') : null;
        var groupLabel = groupLabelEl ? groupLabelEl.textContent.trim() : (input.getAttribute('data-filter-group-key') || '');
        var value = input.getAttribute('data-filter-value') || '';

        chips.push(
          '<button type="button" class="collection-filter-chip" data-filter-chip-remove data-filter-group-key="' +
            escapeHtml(input.getAttribute('data-filter-group-key') || '') +
            '" data-filter-value="' + escapeHtml(value) + '">' +
            '<span>' + escapeHtml(groupLabel + ': ' + value) + '</span>' +
            '<span aria-hidden="true">&times;</span>' +
          '</button>'
        );
      });

      activeFiltersHost.innerHTML = chips.join('');
      activeFiltersHost.hidden = chips.length === 0;
    }

    function updateAvailableOptions() {
      if (!filterData) {
        return;
      }

      Array.prototype.forEach.call(getOptions(), function (option) {
        var groupKey = option.getAttribute('data-filter-option-group');
        var value = option.getAttribute('data-filter-option-value');
        var input = option.querySelector('[data-filter-value]');
        var selections = getSelections(groupKey);
        var count = filterData.products.filter(function (product) {
          return matchesSelections(product, selections);
        }).filter(function (product) {
          if (groupKey === 'brand') {
            return product.vendor === value;
          }

          if (groupKey === 'type') {
            return product.type === value;
          }

          if (groupKey === 'color') {
            return product.color === value;
          }

          if (groupKey === 'size') {
            return product.sizes.some(function (size) {
              return normalizeSizeValue(size) === normalizeSizeValue(value);
            });
          }

          return true;
        }).length;

        option.setAttribute('data-filter-option-count', String(count));
        option.setAttribute('data-filter-option-available', groupKey === 'size' || count > 0 ? 'true' : 'false');

        if (input) {
          input.disabled = groupKey !== 'size' && count === 0 && !input.checked;
        }

        var countNode = option.querySelector('.collection-filter-option__count');
        if (countNode) {
          countNode.textContent = count;
        }
      });

      filterOptions();
    }

    function normalizeColor(product) {
      var tags = product.tags || [];
      var colorTag = tags.find(function (tag) {
        return /^colou?r\s*:/i.test(tag);
      });

      if (colorTag) {
        return colorTag.split(':').slice(1).join(':').trim();
      }

      var title = String(product.title || '');
      var pieces = title.split('|').map(function (part) {
        return part.trim();
      }).filter(Boolean);

      if (pieces.length >= 2) {
        var candidate = pieces[1];
        candidate = candidate.replace(/\b(round neck|t-?shirt|shirt|polo|tee|top)\b.*$/i, '').trim();
        if (candidate) {
          return candidate;
        }
      }

      return '';
    }

    function normalizeSizes(product) {
      var sizeValues = [];
      var sizeOptionIndexes = [];

      function canonicalSize(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
      }

      (product.options_with_values || []).forEach(function (option, index) {
        if (String(option && option.name || '').trim().toLowerCase() === 'size') {
          sizeOptionIndexes.push(index + 1);
        }
      });

      function pushSizeValue(value) {
        var normalized = String(value || '').trim();

        if (!normalized || normalized.toLowerCase() === 'default title' || /^(one[ -]?size|os|o\/s)$/i.test(normalized)) {
          return;
        }

        if (!sizeValues.some(function (value) { return canonicalSize(value) === canonicalSize(normalized); })) {
          sizeValues.push(normalized);
        }
      }

      sizeOptionIndexes.forEach(function (optionIndex) {
        var option = (product.options_with_values || [])[optionIndex - 1];
        (option && option.values || []).forEach(pushSizeValue);
        (product.variants || []).forEach(function (variant) {
          pushSizeValue(variant['option' + optionIndex]);
        });
      });

      return sizeValues;
    }

    function buildCollectionDataUrl(pageNumber) {
      var url = new URL(window.location.href);

      url.pathname = new URL(baseUrl, window.location.origin).pathname;
      url.searchParams.set('view', 'filters-data');
      if (pageNumber) {
        url.searchParams.set('page', pageNumber);
      }

      if (sortBy) {
        url.searchParams.set('sort_by', sortBy);
      }

      return url.toString();
    }

    function normalizeProduct(product) {
      var featuredImage = '';

      if (typeof product.featured_image === 'string') {
        featuredImage = product.featured_image;
      } else if (product.featured_image && product.featured_image.src) {
        featuredImage = product.featured_image.src;
      }

      return {
        id: product.id,
        title: product.title || '',
        url: product.url || '#',
        vendor: (product.vendor || '').trim(),
        type: (product.type || product.product_type || '').trim(),
        color: normalizeColor(product),
        sizes: normalizeSizes(product),
        price: Number(product.price || 0),
        featured_image: featuredImage,
        available: !!product.available,
        html: product.html || productMarkupById[String(product.id)] || ''
      };
    }

    function normalizeProductFromCard(card) {
      return normalizeProduct({
        id: card.getAttribute('data-product-id'),
        title: card.getAttribute('data-product-title') || '',
        url: card.getAttribute('data-product-url') || '#',
        vendor: card.getAttribute('data-product-vendor') || '',
        type: card.getAttribute('data-product-type') || '',
        tags: parseJson(card.getAttribute('data-product-tags')) || [],
        available: card.getAttribute('data-product-available') === 'true',
        price: card.getAttribute('data-product-price') || '0',
        featured_image: card.getAttribute('data-product-image') || '',
        options_with_values: parseJson(card.getAttribute('data-product-options')) || [],
        variants: parseJson(card.getAttribute('data-product-variants') || (card.querySelector('[data-product-variants]') || {}).textContent || '[]') || [],
        html: card.parentNode ? card.parentNode.outerHTML : ''
      });
    }

    function buildGroups(products) {
      var counts = {
        size: {},
        brand: {},
        color: {},
        type: {}
      };

      products.forEach(function (product) {
        product.sizes.forEach(function (size) {
          var existing = Object.keys(counts.size).find(function (value) {
            return normalizeSizeValue(value) === normalizeSizeValue(size);
          });
          var label = existing || size;
          counts.size[label] = (counts.size[label] || 0) + 1;
        });

        if (product.vendor) {
          counts.brand[product.vendor] = (counts.brand[product.vendor] || 0) + 1;
        }

        if (product.type) {
          counts.type[product.type] = (counts.type[product.type] || 0) + 1;
        }

        if (product.color) {
          counts.color[product.color] = (counts.color[product.color] || 0) + 1;
        }

      });

      return [
        { key: 'size', label: 'Size', expanded: true, values: counts.size },
        { key: 'brand', label: 'Brand', expanded: true, values: counts.brand },
        { key: 'color', label: 'Color', expanded: false, values: counts.color },
        { key: 'type', label: 'Type', expanded: false, values: counts.type }
      ].filter(function (group) {
        return Object.keys(group.values).length > 0;
      });
    }

    function renderGroups(groups) {
      if (!groupsHost) {
        return;
      }

      groupsHost.innerHTML = groups.map(function (group) {
        var values = Object.keys(group.values).sort(function (left, right) {
          return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
        });
        var groupId = 'CollectionFilterGroup-' + slugify(group.key);

        return '' +
          '<section class="collection-filter-group' + (group.expanded ? ' is-expanded' : '') + '" data-filter-group>' +
            '<button type="button" class="collection-filter-group__toggle" data-filter-group-toggle aria-expanded="' + (group.expanded ? 'true' : 'false') + '" aria-controls="' + groupId + '">' +
              '<span class="collection-filter-group__title" id="' + groupId + '-Title">' + escapeHtml(group.label) + '</span>' +
              '<span class="collection-filter-group__meta">' + values.length + ' options</span>' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg>' +
            '</button>' +
            '<div class="collection-filter-group__body" id="' + groupId + '" data-filter-group-body>' +
              values.map(function (value) {
                return '' +
                  '<label class="collection-filter-option" data-filter-option data-filter-option-group="' + escapeHtml(group.key) + '" data-filter-option-value="' + escapeHtml(value) + '" data-filter-search-text="' + escapeHtml(group.label + ' ' + value) + '">' +
                    '<input type="checkbox" value="' + escapeHtml(value) + '" data-filter-group-key="' + escapeHtml(group.key) + '" data-filter-value="' + escapeHtml(value) + '">' +
                    '<span class="collection-filter-option__check" aria-hidden="true"></span>' +
                    '<span class="collection-filter-option__label">' + escapeHtml(value) + '</span>' +
                    '<span class="collection-filter-option__count">' + group.values[value] + '</span>' +
                  '</label>';
              }).join('') +
            '</div>' +
          '</section>';
      }).join('');
    }

    function matchesSelections(product, selections) {
      return (
        (!selections.brand.length || selections.brand.indexOf(product.vendor) !== -1) &&
        (!selections.type.length || selections.type.indexOf(product.type) !== -1) &&
        (!selections.color.length || selections.color.indexOf(product.color) !== -1)
      );
    }

    function normalizeSizeValue(value) {
      if (window.EntitledSizePreference && window.EntitledSizePreference.normalizeSizeLabel) {
        return window.EntitledSizePreference.normalizeSizeLabel(value);
      }
      return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function dispatchSizeFilterChange(changedInput) {
      var values = [];
      Array.prototype.forEach.call(filters.querySelectorAll('input[data-filter-group-key="size"]:checked'), function (input) {
        var value = input.getAttribute('data-filter-value');
        var normalized = normalizeSizeValue(value);
        if (normalized && !values.some(function (item) { return normalizeSizeValue(item.value) === normalized; })) {
          values.push({ value: value, display: value });
        }
      });
      document.dispatchEvent(new CustomEvent('entitled:size-filter-change', {
        detail: {
          values: values,
          changedValue: changedInput ? changedInput.getAttribute('data-filter-value') : '',
          checked: changedInput ? !!changedInput.checked : false
        }
      }));
    }

    function syncSizePreference(record) {
      var isValid = !!(window.EntitledSizePreference &&
        window.EntitledSizePreference.hasValidSessionSizePreference &&
        window.EntitledSizePreference.hasValidSessionSizePreference(record));
      var selected = isValid ? (record.values || [record.value]).map(normalizeSizeValue) : [];
      Array.prototype.forEach.call(filters.querySelectorAll('input[data-filter-group-key="size"]'), function (input) {
        input.checked = selected.indexOf(normalizeSizeValue(input.getAttribute('data-filter-value'))) !== -1;
      });
      updateSelectedCount();
      updateAvailableOptions();
    }

    function renderProducts(products) {
      if (!productList) {
        return;
      }

      if (!products.length) {
        productList.innerHTML = '<p id="not-found">No matching products found.</p>';
        return;
      }

      productList.innerHTML = products.map(function (product) {
        return product.html || '';
      }).join('');
      initProductCardMedia(productList);
      document.dispatchEvent(new CustomEvent('entitled:collection-rendered'));
    }

    function setProductListLoading(loading) {
      if (!productList) {
        return;
      }

      productList.classList.toggle('is-loading', loading);

      if (loading) {
        productList.innerHTML = '<div class="collection-products-loading" aria-live="polite">Loading filtered products...</div>';
      }
    }

    function ensureRenderableProducts() {
      if (!filterData) {
        return Promise.resolve();
      }

      if (filterData.products.every(function (product) { return !!product.html; })) {
        return Promise.resolve();
      }

      if (renderProductsPromise) {
        return renderProductsPromise;
      }

      renderProductsPromise = buildFullCollectionDataset().then(function (products) {
        var productsById = {};

        products.forEach(function (product) {
          productsById[String(product.id)] = product;
        });

        filterData.products = filterData.products.map(function (product) {
          var renderableProduct = productsById[String(product.id)];

          if (!renderableProduct) {
            return product;
          }

          return Object.assign({}, product, {
            html: renderableProduct.html || product.html
          });
        });
      }).finally(function () {
        renderProductsPromise = null;
      });

      return renderProductsPromise;
    }

    function restoreOriginalProducts() {
      if (productList) {
        productList.innerHTML = originalProductMarkup;
        initProductCardMedia(productList);
        document.dispatchEvent(new CustomEvent('entitled:collection-rendered'));
      }

      if (productCount) {
        productCount.textContent = originalCountMarkup;
      }

      if (pagination) {
        pagination.hidden = false;
      }
    }

    function applyFilters() {
      if (!filterData) {
        return Promise.resolve();
      }

      var selections = getSelections();
      var hasFilters = Object.keys(selections).some(function (key) {
        return selections[key].length > 0;
      });

      if (!hasFilters) {
        restoreOriginalProducts();
        updateAvailableOptions();
        updateSelectedCount();
        return Promise.resolve();
      }

      if (!filterData.products.every(function (product) { return !!product.html; })) {
        setProductListLoading(true);
      }

      return ensureRenderableProducts().then(function () {
        var filteredProducts = filterData.products.filter(function (product) {
          return matchesSelections(product, selections);
        });

        renderProducts(filteredProducts);

        if (productCount) {
          productCount.textContent = filteredProducts.length + ' product' + (filteredProducts.length === 1 ? '' : 's');
        }

        if (pagination) {
          pagination.hidden = true;
        }

        updateAvailableOptions();
        updateSelectedCount();

        if (window.innerWidth <= 1024) {
          setDrawer(false);
        }
      }).finally(function () {
        setProductListLoading(false);
      });
    }

    function clearFilters() {
      var hadSize = !!filters.querySelector('input[data-filter-group-key="size"]:checked');
      Array.prototype.forEach.call(getInputs(), function (input) {
        input.checked = false;
      });

      if (search) {
        search.value = '';
      }

      restoreOriginalProducts();
      updateSelectedCount();
      updateAvailableOptions();
      if (hadSize) {
        dispatchSizeFilterChange();
      }
    }

    function parseCollectionPage(html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var cards = Array.prototype.slice.call(doc.querySelectorAll('[data-collection-product]'));
      var products = cards.map(normalizeProductFromCard);
      var nextLink = doc.querySelector('a.next_page');

      return {
        products: products,
        nextUrl: nextLink ? nextLink.href : ''
      };
    }

    function buildFullCollectionDataset() {
      var maxPages = 20;

      function fetchPage(pageNumber) {
        var pageUrl = new URL(window.location.href);
        pageUrl.pathname = new URL(baseUrl, window.location.origin).pathname;
        pageUrl.searchParams.delete('view');
        pageUrl.searchParams.set('page', pageNumber);

        return window.fetch(pageUrl.toString(), { credentials: 'same-origin' })
          .then(function (response) {
            if (!response.ok) {
              throw new Error('Collection page fetch failed');
            }

            return response.text();
          })
          .then(parseCollectionPage);
      }

      return fetchPage(1).then(function (firstPage) {
        var pages = [firstPage];
        var nextPageNumber = 2;

        function loadNext() {
          if (!firstPage.nextUrl || nextPageNumber > maxPages) {
            return Promise.resolve(pages);
          }

          return fetchPage(nextPageNumber).then(function (pageData) {
            if (!pageData.products.length) {
              return pages;
            }

            pages.push(pageData);
            nextPageNumber += 1;

            if (!pageData.nextUrl) {
              return pages;
            }

            return loadNext();
          });
        }

        return loadNext().then(function () {
          return pages.reduce(function (all, pageData) {
            return all.concat(pageData.products);
          }, []);
        });
      });
    }

    function hydrateFilterData(products) {
      var normalizedProducts = products.map(normalizeProduct);

      filterData = {
        products: normalizedProducts,
        groups: buildGroups(normalizedProducts)
      };

      renderGroups(filterData.groups);
      updateAvailableOptions();
      updateSelectedCount();
      document.dispatchEvent(new CustomEvent('entitled:size-filter-ready'));
      ensureRenderableProducts();
    }

    function fetchFilterDataPage(pageNumber) {
      return window.fetch(buildCollectionDataUrl(pageNumber), { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Collection filter data fetch failed');
          }

          return response.json();
        });
    }

    function loadFilterData() {
      return fetchFilterDataPage(1)
        .then(function (payload) {
          var products = payload && Array.isArray(payload.products) ? payload.products : [];
          var total = payload && payload.collection ? Number(payload.collection.products_count || 0) : products.length;
          var pageCount = Math.ceil(total / 250);

          if (!products.length) {
            throw new Error('No filter data products found');
          }

          if (pageCount <= 1 || products.length >= total) {
            hydrateFilterData(products);
            return;
          }

          var requests = [];
          for (var pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
            requests.push(fetchFilterDataPage(pageNumber));
          }

          return Promise.all(requests).then(function (pages) {
            pages.forEach(function (page) {
              if (page && Array.isArray(page.products)) {
                products = products.concat(page.products);
              }
            });

            hydrateFilterData(products);
          });
        })
        .catch(function () {
          return buildFullCollectionDataset();
        })
        .then(function (products) {
          if (!products) {
            return;
          }

          if (products.length) {
            hydrateFilterData(products);
            return;
          }

          throw new Error('No product data found');
        })
        .catch(function () {
          var fallbackProducts = Array.prototype.slice.call(document.querySelectorAll('[data-collection-product]')).map(normalizeProductFromCard);

          if (fallbackProducts.length) {
            hydrateFilterData(fallbackProducts);
            return;
          }

          if (groupsHost) {
            groupsHost.innerHTML = '';
          }

          if (empty) {
            empty.hidden = false;
            empty.textContent = 'Unable to load filters for this collection.';
          }
        });
    }

    if (search) {
      search.addEventListener('focus', function () {
        setDropdown(true);
        filterOptions();
      });

      search.addEventListener('click', function () {
        setDropdown(true);
      });

      search.addEventListener('input', function () {
        setDropdown(true);
        filterOptions();
      });

      search.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          setDropdown(false);
          search.blur();
        }
      });
    }

    if (dropdownToggle) {
      dropdownToggle.addEventListener('click', function () {
        var open = !combobox.classList.contains('is-open');
        setDropdown(open);

        if (open && search) {
          search.focus();
        }
      });
    }

    filters.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-filter-chip-remove]');

      if (chip) {
        var chipGroupKey = chip.getAttribute('data-filter-group-key');
        var chipValue = chip.getAttribute('data-filter-value');

        Array.prototype.forEach.call(getInputs(), function (input) {
          if (
            input.getAttribute('data-filter-group-key') === chipGroupKey &&
            input.getAttribute('data-filter-value') === chipValue
          ) {
            input.checked = false;
          }
        });

        updateSelectedCount();
        if (chipGroupKey === 'size') {
          dispatchSizeFilterChange();
        }
        applyFilters();
        return;
      }

      var groupToggle = event.target.closest('[data-filter-group-toggle]');

      if (!groupToggle) {
        return;
      }

      var group = groupToggle.closest('[data-filter-group]');
      if (group) {
        setGroupExpanded(group, !group.classList.contains('is-expanded'));
      }
    });

    filters.addEventListener('change', function (event) {
      updateSelectedCount();
      updateAvailableOptions();
      if (event.target && event.target.getAttribute('data-filter-group-key') === 'size') {
        dispatchSizeFilterChange(event.target);
      }
    });

    document.addEventListener('entitled:size-preference-change', function (event) {
      syncSizePreference(event.detail || {});
    });

    document.addEventListener('click', function (event) {
      if (combobox && !combobox.contains(event.target)) {
        setDropdown(false);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && filters.classList.contains('is-drawer-open')) {
        setDrawer(false);

        if (drawerOpen) {
          drawerOpen.focus();
        }
      }
    });

    if (drawerOpen) {
      drawerOpen.addEventListener('click', function () {
        setDrawer(true);
      });
    }

    Array.prototype.forEach.call(drawerClose, function (close) {
      close.addEventListener('click', function () {
        setDrawer(false);
      });
    });

    if (applyButton) {
      applyButton.addEventListener('click', applyFilters);
    }

    if (clearButton) {
      clearButton.addEventListener('click', clearFilters);
    }

    window.addEventListener('resize', queueStickyOffset);
    window.addEventListener('scroll', queueStickyOffset, { passive: true });

    if (siteHeader && window.MutationObserver) {
      new MutationObserver(queueStickyOffset).observe(siteHeader, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    queueStickyOffset();
    loadFilterData().then(function () {
      if (window.innerWidth > 1024) {
        setDropdown(true);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCollectionFilters);
  } else {
    initCollectionFilters();
  }
}());
