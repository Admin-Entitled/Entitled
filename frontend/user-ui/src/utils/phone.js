export function normalizePhoneToIndian10(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return "";
}

export function coercePhoneInput(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
}
