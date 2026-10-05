(function () {
  const dialog = document.querySelector('.entitled-subscriber');
  if (!dialog || dialog.dataset.initialized === 'true') return;
  dialog.dataset.initialized = 'true';

  const form = dialog.querySelector('form');
  const submitButton = form.querySelector('[type="submit"]');
  const message = dialog.querySelector('.entitled-subscriber__message');
  const title = dialog.querySelector('#entitled-subscriber-title');
  const intro = dialog.querySelector('.entitled-subscriber__intro');
  const registeredKey = 'entitled_marketing_registered_v1';
  const dismissedKey = 'entitled_marketing_dismissed_at_v1';
  const twelveHours = 12 * 60 * 60 * 1000;
  const destination = 'https://www.entitledclub.com/collections/all-products-1';
  const apiBase = (dialog.dataset.apiBase || '').replace(/\/+$/, '');
  const errors = {
    name: dialog.querySelector('#entitled-subscriber-error-name'),
    age: dialog.querySelector('#entitled-subscriber-error-age'),
    phone: dialog.querySelector('#entitled-subscriber-error-phone'),
    city: dialog.querySelector('#entitled-subscriber-error-city'),
    preferredTypes: dialog.querySelector('#entitled-subscriber-error-preferredTypes'),
    preferredBrand: dialog.querySelector('#entitled-subscriber-error-preferredBrand'),
    email: dialog.querySelector('#entitled-subscriber-error-email'),
    heardAboutUs: dialog.querySelector('#entitled-subscriber-error-heardAboutUs'),
    marketingConsent: dialog.querySelector('#entitled-subscriber-error-marketingConsent')
  };
  let opener = null;
  let previousOverflow = '';
  let autoOpenTimer = null;
  let submitting = false;
  let succeeded = false;

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* Storage can be unavailable. */ }
  }

  function canAutoOpen() {
    if (storageGet(registeredKey) === '1') return false;
    const dismissedAt = Number(storageGet(dismissedKey));
    const elapsed = Date.now() - dismissedAt;
    if (dismissedAt && Number.isFinite(dismissedAt) && elapsed >= 0 && elapsed < twelveHours) return false;
    try { window.localStorage.removeItem(dismissedKey); } catch (_) { /* Storage can be unavailable. */ }
    return true;
  }

  function open() {
    if (dialog.open) return;
    opener = document.activeElement;
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    form.elements.namedItem('name').focus({ preventScroll: true });
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function clearErrors() {
    Object.values(errors).forEach((element) => { element.textContent = ''; });
    dialog.querySelectorAll('[aria-invalid="true"]').forEach((element) => element.removeAttribute('aria-invalid'));
    message.textContent = '';
    message.hidden = true;
  }

  function showFieldError(field, text) {
    if (!Object.hasOwn(errors, field)) return;
    errors[field].textContent = text;
    const controls = field === 'preferredTypes'
      ? dialog.querySelectorAll('[name="preferredTypes"]')
      : [form.elements.namedItem(field)].filter(Boolean);
    controls.forEach((control) => control.setAttribute('aria-invalid', 'true'));
  }

  function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
  }

  dialog.querySelector('.entitled-subscriber__close').addEventListener('click', close);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    if (!succeeded && storageGet(registeredKey) !== '1') storageSet(dismissedKey, String(Date.now()));
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', (event) => {
    if (!dialog.open || event.key !== 'Tab') return;
    const focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.hidden && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first) return;
    if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  form.addEventListener('input', (event) => {
    const field = event.target.name;
    if (errors[field]) {
      errors[field].textContent = '';
      const controls = field === 'preferredTypes'
        ? dialog.querySelectorAll('[name="preferredTypes"]')
        : [event.target];
      controls.forEach((control) => control.removeAttribute('aria-invalid'));
    }
    if (message.textContent) { message.textContent = ''; message.hidden = true; }
  });
  form.elements.namedItem('phone').addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 10);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || succeeded) return;
    clearErrors();
    const preferredTypes = Array.from(form.querySelectorAll('[name="preferredTypes"]:checked'), (input) => input.value);
    const validForm = form.reportValidity();
    if (!preferredTypes.length) showFieldError('preferredTypes', 'Choose at least one preferred type.');
    if (!validForm || !preferredTypes.length) return;

    const data = {
      name: form.elements.namedItem('name').value,
      age: Number(form.elements.namedItem('age').value),
      phone: form.elements.namedItem('phone').value,
      city: form.elements.namedItem('city').value,
      preferredTypes,
      preferredBrand: form.elements.namedItem('preferredBrand').value,
      marketingConsent: true
    };
    const email = form.elements.namedItem('email').value.trim();
    const heardAboutUs = form.elements.namedItem('heardAboutUs').value.trim();
    if (email) data.email = email;
    if (heardAboutUs) data.heardAboutUs = heardAboutUs;

    submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';
    showMessage('Submitting your details…');

    try {
      const response = await window.fetch(`${apiBase}/api/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      let result = {};
      try { result = await response.json(); } catch (_) { /* Show a generic message for invalid responses. */ }

      if (response.status === 429) {
        showMessage('Too many attempts. Please try again shortly.');
      } else if (!response.ok) {
        const fields = result && result.error && result.error.fields;
        if (fields && typeof fields === 'object') {
          Object.entries(fields).forEach(([field, text]) => {
            if (errors[field] && typeof text === 'string') showFieldError(field, text);
          });
        }
        showMessage('Something went wrong. Please try again.');
      } else if (result.success === true && ['created', 'updated'].includes(result.subscriber && result.subscriber.status)) {
        succeeded = true;
        storageSet(registeredKey, '1');
        try { window.localStorage.removeItem(dismissedKey); } catch (_) { /* Storage can be unavailable. */ }
        title.textContent = "You're in.";
        intro.hidden = true;
        form.hidden = true;
        Object.values(errors).forEach((element) => { element.textContent = ''; });
        message.hidden = true;
        title.focus({ preventScroll: true });
        window.setTimeout(() => window.location.assign(destination), 1200);
      } else {
        showMessage('Something went wrong. Please try again.');
      }
    } catch (_) {
      showMessage('Something went wrong. Please try again.');
    } finally {
      if (!succeeded) {
        submitting = false;
        submitButton.disabled = false;
        submitButton.textContent = 'Sign me up';
      }
    }
  });

  window.EntitledSubscriberPopup = { open };

  if (dialog.dataset.homepage === 'true') {
    const scheduleAutoOpen = () => {
      autoOpenTimer = window.setTimeout(() => { if (canAutoOpen()) open(); }, 3500);
    };
    if (document.readyState === 'complete') scheduleAutoOpen();
    else window.addEventListener('load', scheduleAutoOpen, { once: true });
    window.addEventListener('pagehide', () => window.clearTimeout(autoOpenTimer), { once: true });
  }
})();
