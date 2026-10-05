import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubmission } from '../src/validation.js';

const valid = {
  name: ' Shivam ',
  age: 28,
  phone: '9876543210',
  city: ' Pune ',
  preferredTypes: ['Polos', 'T-Shirts'],
  preferredBrand: ' Ralph Lauren ',
  marketingConsent: true,
};

function validate(overrides = {}) {
  return validateSubmission({ ...valid, ...overrides });
}

test('trims required text fields and normalizes phone and preferred types', () => {
  const { value, fields } = validate({
    phone: '+919876543210',
    preferredTypes: ['Polos', 'Polos', 'T-Shirts'],
  });
  assert.deepEqual(fields, {});
  assert.equal(value.name, 'Shivam');
  assert.equal(value.city, 'Pune');
  assert.equal(value.phone, '+919876543210');
  assert.deepEqual(value.preferredTypes, ['Polos', 'T-Shirts']);
  assert.equal(value.preferredBrand, 'Ralph Lauren');
});

test('accepts all supported Indian mobile phone forms', () => {
  for (const phone of ['9876543210', '919876543210', '+919876543210']) {
    const result = validate({ phone });
    assert.deepEqual(result.fields, {});
    assert.equal(result.value.phone, '+919876543210');
  }
});

test('rejects short, long, non-Indian and invalid-leading-digit phones', () => {
  for (const phone of ['987654321', '9198765432100', '1987654321', '5198765432', '+441234567890']) {
    assert.ok(validate({ phone }).fields.phone, phone);
  }
});

test('requires a non-empty name within the maximum length', () => {
  assert.ok(validate({ name: undefined }).fields.name);
  assert.ok(validate({ name: '  ' }).fields.name);
  assert.ok(validate({ name: 'x'.repeat(101) }).fields.name);
});

test('requires integer age from 13 through 100', () => {
  for (const age of [13, 100]) assert.deepEqual(validate({ age }).fields, {});
  for (const age of [12, 101, 28.5, '28', null]) assert.ok(validate({ age }).fields.age);
});

test('requires trimmed city and preferred brand text', () => {
  assert.ok(validate({ city: undefined }).fields.city);
  assert.ok(validate({ city: ' '.repeat(2) }).fields.city);
  assert.ok(validate({ city: 'x'.repeat(101) }).fields.city);
  assert.ok(validate({ preferredBrand: undefined }).fields.preferredBrand);
  assert.ok(validate({ preferredBrand: '  ' }).fields.preferredBrand);
});

test('requires known preferred types and rejects an empty list', () => {
  assert.ok(validate({ preferredTypes: undefined }).fields.preferredTypes);
  assert.ok(validate({ preferredTypes: [] }).fields.preferredTypes);
  assert.ok(validate({ preferredTypes: ['Polos', 'Unknown'] }).fields.preferredTypes);
});

test('requires explicit true marketing consent', () => {
  for (const marketingConsent of [undefined, false, null, 'true', 1]) {
    assert.ok(validate({ marketingConsent }).fields.marketingConsent);
  }
});

test('treats missing and blank email as absent, and lowercases valid email', () => {
  assert.equal(validate().value.email, undefined);
  assert.equal(validate({ email: '   ' }).value.email, undefined);
  assert.equal(validate({ email: ' Example@Email.COM ' }).value.email, 'example@email.com');
});

test('rejects malformed email', () => {
  assert.ok(validate({ email: 'not-an-email' }).fields.email);
  assert.ok(validate({ email: 'x@y' }).fields.email);
  assert.ok(validate({ email: 'user..name@example.com' }).fields.email);
  assert.ok(validate({ email: 'user@-example.com' }).fields.email);
  assert.ok(validate({ email: 42 }).fields.email);
  assert.ok(validate({ email: `${'a'.repeat(245)}@example.com` }).fields.email);
});

test('treats missing and blank heardAboutUs as absent', () => {
  assert.equal(validate().value.heardAboutUs, undefined);
  assert.equal(validate({ heardAboutUs: '  ' }).value.heardAboutUs, undefined);
  assert.equal(validate({ heardAboutUs: ' Instagram ' }).value.heardAboutUs, 'Instagram');
  assert.ok(validate({ heardAboutUs: 42 }).fields.heardAboutUs);
  assert.ok(validate({ heardAboutUs: 'x'.repeat(201) }).fields.heardAboutUs);
});

test('does not accept or retain client consent timestamps', () => {
  const { value } = validate({ consentedAt: '2001-01-01T00:00:00Z' });
  assert.equal('consentedAt' in value, false);
});
