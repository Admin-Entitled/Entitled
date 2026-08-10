import { formatMoneyForCurrency } from "./utils/format.js";

export const EXPENSE_MONTH_ROLLING_COUNT = 24;

const STATUS_LABELS = {
  COMPLETE: "Complete",
  INCOMPLETE: "Bill Missing",
  NO_BILLS: "No Bills",
  UNKNOWN: "Unknown",
};

export function parseMonthValue(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

export function formatMonthValue(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month components: ${year}-${month}`);
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function getCurrentMonthValue(date = new Date()) {
  return formatMonthValue(date.getFullYear(), date.getMonth() + 1);
}

export function shiftMonthValue(value, delta) {
  const parsed = parseMonthValue(value);
  if (!parsed || !Number.isInteger(delta)) {
    throw new Error(`Cannot shift invalid month value: ${value}`);
  }
  const totalMonths = parsed.year * 12 + (parsed.month - 1) + delta;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return formatMonthValue(year, month);
}

export function compareMonthValuesDesc(a, b) {
  const parsedA = parseMonthValue(a);
  const parsedB = parseMonthValue(b);
  if (!parsedA || !parsedB) {
    return String(b || "").localeCompare(String(a || ""));
  }
  if (parsedA.year !== parsedB.year) {
    return parsedB.year - parsedA.year;
  }
  return parsedB.month - parsedA.month;
}

export function formatExpenseMonthLabel(value, locale = "en-IN") {
  const parsed = parseMonthValue(value);
  if (!parsed) {
    return String(value || "");
  }
  const date = new Date(parsed.year, parsed.month - 1, 1, 12, 0, 0, 0);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function buildExpenseMonthOptions({
  currentMonth = getCurrentMonthValue(),
  rollingCount = EXPENSE_MONTH_ROLLING_COUNT,
  dataMonths = [],
  historyMonths = [],
} = {}) {
  const months = new Set();
  if (parseMonthValue(currentMonth)) {
    for (let offset = 0; offset < rollingCount; offset += 1) {
      months.add(shiftMonthValue(currentMonth, -offset));
    }
  }
  for (const month of [...dataMonths, ...historyMonths]) {
    if (parseMonthValue(month)) {
      months.add(month);
    }
  }
  return [...months].sort(compareMonthValuesDesc);
}

export function getExpenseStatusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.UNKNOWN;
}

export function getExpenseStatusTone(status) {
  if (status === "COMPLETE") {
    return "success";
  }
  if (status === "INCOMPLETE") {
    return "warning";
  }
  return "neutral";
}

export function formatExpenseHeadlineValue(value, currency = "INR") {
  return formatMoneyForCurrency(value, currency, { maximumFractionDigits: 0 });
}

export function getApiActivityDisplay({
  apiAvailable,
  apiExpense,
  apiActivityState,
  apiActivity,
  currency = "INR",
}) {
  const state = apiActivityState || (apiAvailable ? "AVAILABLE" : "UNAVAILABLE");
  const amount = Number.isFinite(apiActivity) ? apiActivity : Number.isFinite(apiExpense) ? apiExpense : null;

  if (state === "ERROR") {
    return {
      label: "API Activity",
      value: "Could not load",
      tone: "muted",
      isUnavailable: true,
    };
  }
  if (state === "UNAVAILABLE") {
    return {
      label: "API Activity",
      value: "Unavailable",
      tone: "muted",
      isUnavailable: true,
    };
  }
  if (state === "PARTIAL" && amount === null) {
    return {
      label: "API Activity",
      value: "Partial data",
      tone: "muted",
      isUnavailable: false,
      note: "Partial coverage",
    };
  }
  return {
    label: "API Activity",
    value: formatMoneyForCurrency(amount || 0, currency),
    tone: "default",
    isUnavailable: false,
    note: state === "PARTIAL" ? "Partial coverage" : null,
  };
}

export function getReconciliationDisplay({
  billed = 0,
  apiExpense = 0,
  apiAvailable,
  apiActivityState,
  apiActivity,
  currency = "INR",
}) {
  const state = apiActivityState || (apiAvailable ? "AVAILABLE" : "UNAVAILABLE");
  const amount = Number.isFinite(apiActivity) ? apiActivity : Number.isFinite(apiExpense) ? apiExpense : null;
  if (!["AVAILABLE", "PARTIAL", "ZERO_VERIFIED"].includes(state) || amount === null) {
    return null;
  }

  if (amount > 0 && billed === 0) {
    return {
      label: "Unbilled Activity",
      value: formatMoneyForCurrency(amount, currency),
      tone: "warning",
      isUnavailable: false,
    };
  }

  if (amount > 0 && billed > 0) {
    return {
      label: "Difference",
      value: formatMoneyForCurrency(billed - amount, currency),
      tone: billed === amount ? "neutral" : "default",
      isUnavailable: false,
    };
  }

  return null;
}

export function buildCurrentMonthWarningMessages({ selectedMonth, providerTotals = [], currency = "INR", currentMonth = getCurrentMonthValue() }) {
  const messages = [];
  if (selectedMonth === currentMonth) {
    messages.push(`${formatExpenseMonthLabel(selectedMonth)} is still in progress. Billing totals may be incomplete.`);
  }

  for (const provider of providerTotals) {
    const amount = Number.isFinite(provider?.apiActivity) ? provider.apiActivity : provider?.apiExpense;
    if (amount > 0 && provider?.billCount === 0) {
      const providerLabel = provider.provider === "META"
        ? "Meta Ads"
        : provider.provider === "SHIPROCKET"
          ? "Shiprocket"
          : "Shopify";
      messages.push(
        `${providerLabel} has ${formatMoneyForCurrency(amount, currency)} of API activity with no uploaded bill.`,
      );
    }
  }

  return messages;
}

export function getBillsEmptyStateCopy(month) {
  return {
    title: `No bills for ${formatExpenseMonthLabel(month)}`,
    body: "Provider activity can still be synced automatically. Upload a bill when you receive the invoice.",
  };
}

export function getHistoryEmptyStateCopy() {
  return {
    title: "No billed expense history yet.",
    body: "Uploaded bills will appear here by month.",
  };
}
