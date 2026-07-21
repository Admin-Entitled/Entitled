(function () {
  'use strict';

  function initHeaderSearch() {
    var toggle = document.querySelector('.header-search-toggle');
    var panel = document.getElementById('HeaderSearchPanel');

    if (!toggle || !panel || toggle.getAttribute('data-search-ready') === 'true') {
      return;
    }

    var input = panel.querySelector('input[type="search"]');

    function setOpen(open, returnFocus) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      panel.classList.toggle('is-open', open);

      if (open && input) {
        window.setTimeout(function () {
          input.focus();
        }, 0);
      } else if (returnFocus) {
        toggle.focus();
      }
    }

    toggle.setAttribute('data-search-ready', 'true');

    toggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(toggle.getAttribute('aria-expanded') !== 'true', false);
    });

    panel.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    document.addEventListener('click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false, false);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false, true);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeaderSearch);
  } else {
    initHeaderSearch();
  }
}());
