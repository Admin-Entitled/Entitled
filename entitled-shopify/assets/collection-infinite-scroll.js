(function () {
  'use strict';

  var ROOT_MARGIN = '800px 0px';
  var LIST_SELECTOR = '[data-infinite-scroll-list]';
  var PAGINATION_SELECTOR = '[data-infinite-scroll-pagination]';
  var STATUS_SELECTOR = '[data-infinite-scroll-status]';
  var NEXT_SELECTOR = 'a.next_page';
  var DISABLED_ATTR = 'data-infinite-scroll-disabled';
  var ENHANCED_ATTR = 'data-infinite-scroll-enhanced';
  var SOURCE = 'infinite-scroll';

  function supportsInfiniteScroll() {
    return 'IntersectionObserver' in window && 'fetch' in window && 'DOMParser' in window;
  }

  function contextFor(list) {
    var root = list.closest('.product_grid, .search_section') || document;
    return {
      root: root,
      list: list,
      pagination: root.querySelector(PAGINATION_SELECTOR),
      status: root.querySelector(STATUS_SELECTOR),
      listSelector: list.hasAttribute('data-collection-product-list') ? '[data-collection-product-list]' : '[data-search-product-list]'
    };
  }

  function getNextUrl(context) {
    var link = context.pagination && context.pagination.querySelector(NEXT_SELECTOR);
    return link ? link.href : '';
  }

  function setStatus(context, message, visible) {
    if (!context.status) {
      return;
    }
    context.status.textContent = message;
    context.status.hidden = false;
    context.status.classList.toggle('is-idle', !visible);
    context.status.classList.toggle('is-loading', visible && /loading/i.test(message));
    context.status.classList.toggle('is-complete', visible && !/loading/i.test(message));
  }

  function itemKey(item) {
    var product = item.querySelector('[data-product-id], [data-collection-product]');
    if (product && product.getAttribute('data-product-id')) {
      return 'id:' + product.getAttribute('data-product-id');
    }
    var link = item.querySelector('a[href*="/products/"]');
    return link ? 'url:' + link.href.split('?')[0] : '';
  }

  function existingKeys(list) {
    var keys = {};
    Array.prototype.forEach.call(list.children, function (item) {
      var key = itemKey(item);
      if (key) {
        keys[key] = true;
      }
    });
    return keys;
  }

  function parsePage(html, context) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var nextList = doc.querySelector(context.listSelector);
    var nextPagination = doc.querySelector(PAGINATION_SELECTOR) || doc.querySelector('.pagination');
    var nextLink = nextPagination && nextPagination.querySelector(NEXT_SELECTOR);

    return {
      items: nextList ? Array.prototype.slice.call(nextList.children) : [],
      nextUrl: nextLink ? nextLink.href : '',
      paginationHtml: nextPagination ? nextPagination.innerHTML : ''
    };
  }

  function dispatchAppended(context, items) {
    document.dispatchEvent(new CustomEvent('entitled:products-appended', {
      detail: {
        source: SOURCE,
        container: context.list,
        products: items
      }
    }));
    document.dispatchEvent(new CustomEvent('entitled:collection-rendered', {
      detail: {
        source: SOURCE,
        container: context.list,
        products: items
      }
    }));
    if (window.EntitledSizePreference && typeof window.EntitledSizePreference.refreshProductCards === 'function') {
      window.EntitledSizePreference.refreshProductCards(context.list);
    }
    if (window.EntitledBuyNow && typeof window.EntitledBuyNow.initialize === 'function') {
      window.setTimeout(window.EntitledBuyNow.initialize, 0);
    }
  }

  function initList(list) {
    var context = contextFor(list);
    var nextUrl = getNextUrl(context);
    var state = list.__entitledInfiniteScroll;

    if (state) {
      state.abort();
      state.observer.disconnect();
    }

    if (!supportsInfiniteScroll() || !context.pagination || !nextUrl || context.pagination.hasAttribute(DISABLED_ATTR)) {
      return;
    }

    state = {
      loading: false,
      nextUrl: nextUrl,
      requestedUrls: {},
      controller: null,
      observer: null,
      abort: function () {
        if (this.controller) {
          this.controller.abort();
          this.controller = null;
        }
        this.loading = false;
      }
    };
    list.__entitledInfiniteScroll = state;

    context.pagination.hidden = false;
    context.pagination.setAttribute(ENHANCED_ATTR, 'true');
    setStatus(context, '', false);

    function finish(message) {
      state.nextUrl = '';
      state.observer.disconnect();
      setStatus(context, message || 'All products loaded', !!message);
    }

    function loadNext() {
      if (state.loading || !state.nextUrl) {
        return;
      }

      if (state.requestedUrls[state.nextUrl]) {
        finish('All products loaded');
        return;
      }

      var requestedUrl = state.nextUrl;
      state.loading = true;
      state.controller = 'AbortController' in window ? new AbortController() : null;
      setStatus(context, 'Loading more products...', true);

      window.fetch(state.nextUrl, {
        credentials: 'same-origin',
        signal: state.controller ? state.controller.signal : undefined
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Next product page fetch failed');
          }
          return response.text();
        })
        .then(function (html) {
          state.requestedUrls[requestedUrl] = true;
          var page = parsePage(html, context);
          var keys = existingKeys(context.list);
          var appended = [];

          page.items.forEach(function (item) {
            var key = itemKey(item);
            if (key && keys[key]) {
              return;
            }
            if (key) {
              keys[key] = true;
            }
            context.list.appendChild(item);
            appended.push(item);
          });

          if (context.pagination) {
            context.pagination.innerHTML = page.paginationHtml;
            context.pagination.setAttribute(ENHANCED_ATTR, 'true');
          }

          state.nextUrl = page.nextUrl;
          state.loading = false;
          state.controller = null;

          if (appended.length) {
            dispatchAppended(context, appended);
          }

          if (!state.nextUrl) {
            finish('All products loaded');
            return;
          }

          setStatus(context, '', false);
          if (!appended.length) {
            window.setTimeout(loadNext, 0);
          }
        })
        .catch(function (error) {
          state.loading = false;
          state.controller = null;
          if (error && error.name === 'AbortError') {
            return;
          }
          context.pagination.removeAttribute(ENHANCED_ATTR);
          context.pagination.hidden = false;
          setStatus(context, 'Unable to load more products. Use pagination below.', true);
          if (context.status) {
            var retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'infinite-scroll-retry';
            retry.textContent = 'Retry';
            retry.addEventListener('click', function () {
              context.pagination.setAttribute(ENHANCED_ATTR, 'true');
              setStatus(context, '', false);
              loadNext();
            });
            context.status.appendChild(retry);
          }
        });
    }

    state.observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        loadNext();
      }
    }, { rootMargin: ROOT_MARGIN });

    state.observer.observe(context.status || context.pagination);
  }

  function initInfiniteScroll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    Array.prototype.forEach.call(scope.querySelectorAll(LIST_SELECTOR), initList);
  }

  document.addEventListener('entitled:collection-rendered', function (event) {
    if (event.detail && event.detail.source === SOURCE) {
      return;
    }
    initInfiniteScroll(document);
  });
  document.addEventListener('shopify:section:load', function (event) {
    initInfiniteScroll(event.target || document);
  });

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'auto';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initInfiniteScroll(document);
    });
  } else {
    initInfiniteScroll(document);
  }
}());
