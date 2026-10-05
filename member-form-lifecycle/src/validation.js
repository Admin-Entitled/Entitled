const allowedTypes = new Set(['Polos', 'T-Shirts', 'Shirts', 'Sweatshirts', 'Jackets', 'Lowers']);
const phonePattern = /^(?:\+?91)?([6-9]\d{9})$/;
const emailPattern = /^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i;

function requiredText(value, maxLength, message) {
  if (typeof value !== 'string') return { error: message };
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return { error: message };
  return { value: trimmed };
}

export function validateSubmission(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const fields = {};
  const value = {};

  for (const [key, maxLength] of [['name', 100], ['city', 100], ['preferredBrand', 100]]) {
    const result = requiredText(input[key], maxLength, 'This field is required and must be 100 characters or fewer');
    if (result.error) fields[key] = result.error;
    else value[key] = result.value;
  }

  if (!Number.isInteger(input.age) || input.age < 13 || input.age > 100) {
    fields.age = 'Enter an integer age from 13 to 100';
  } else {
    value.age = input.age;
  }

  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const phoneMatch = phonePattern.exec(phone);
  if (!phoneMatch) fields.phone = 'Enter a valid Indian mobile number';
  else value.phone = `+91${phoneMatch[1]}`;

  if (!Array.isArray(input.preferredTypes) || input.preferredTypes.length === 0
      || input.preferredTypes.some(type => typeof type !== 'string' || !allowedTypes.has(type))) {
    fields.preferredTypes = 'Choose one or more valid preferred types';
  } else {
    value.preferredTypes = [...new Set(input.preferredTypes)];
  }

  if (input.email !== undefined && input.email !== null) {
    if (typeof input.email !== 'string') {
      fields.email = 'Enter a valid email address';
    } else {
      const email = input.email.trim().toLowerCase();
      if (email && (email.length > 254 || !emailPattern.test(email))) fields.email = 'Enter a valid email address';
      else if (email) value.email = email;
    }
  }

  if (input.heardAboutUs !== undefined && input.heardAboutUs !== null) {
    if (typeof input.heardAboutUs !== 'string') {
      fields.heardAboutUs = 'Enter text up to 200 characters';
    } else {
      const heardAboutUs = input.heardAboutUs.trim();
      if (heardAboutUs.length > 200) fields.heardAboutUs = 'Enter text up to 200 characters';
      else if (heardAboutUs) value.heardAboutUs = heardAboutUs;
    }
  }

  if (input.marketingConsent !== true) fields.marketingConsent = 'Consent is required';
  else value.marketingConsent = true;

  return { value, fields };
}
