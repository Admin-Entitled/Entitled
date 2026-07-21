const SHIPROCKET = new Map([
  ["DELIVERED", "DELIVERED"],
  ["RTO DELIVERED", "NOT_DELIVERED"],
  ["RETURNED", "NOT_DELIVERED"],
  ["CANCELLED", "NOT_DELIVERED"],
  ["LOST", "NOT_DELIVERED"],
  ["IN TRANSIT", "NOT_DELIVERED"],
]);

const LEGACY = new Map([...SHIPROCKET, ["SUCCESSFULLY DELIVERED", "DELIVERED"]]);

function map(status, mappings) {
  return mappings.get(String(status || "").trim().toUpperCase()) || "UNRESOLVED";
}

export const mapShiprocketStatus = (status) => map(status, SHIPROCKET);
export const mapLegacyStatus = (status) => map(status, LEGACY);
