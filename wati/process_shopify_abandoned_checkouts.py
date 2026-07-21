#!/usr/bin/env python3
"""Build a WATI abandoned-checkout CSV from Shopify exports and API fallback."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Iterable


OUTPUT_COLUMNS = [
    "phone",
    "first_name",
    "order_value",
    "recovery_url",
    "abandoned_checkout_created_at",
    "customer_email",
    "error_reason",
]
BASE_DIR = Path(__file__).resolve().parent
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PLACEHOLDER_NAMES = {"-", "--", "na", "n/a", "none", "null", "unknown", "customer"}
SHOPIFY_ENV_KEYS = [
    "SHOPIFY_STORE_DOMAIN",
    "SHOPIFY_ADMIN_ACCESS_TOKEN",
    "SHOPIFY_API_VERSION",
]
API_LIMIT = "250"
API_TIMEOUT_SECONDS = 30
MATCH_THRESHOLD = 50


class ProcessingError(Exception):
    """Raised for user-fixable processing problems."""


class ShopifyApiError(Exception):
    """Raised when Shopify API fallback cannot be completed."""


@dataclass
class Sources:
    full_name_columns: list[str]
    first_name_columns: list[str]
    last_name_columns: list[str]
    phone_columns: list[str]
    email_columns: list[str]
    recovery_url_columns: list[str]
    order_value_columns: list[str]
    created_at_columns: list[str]


@dataclass
class CsvRecord:
    input_index: int
    row_number: int
    raw_row: dict[str, str]
    phone: str
    phone_status: str
    email: str
    first_name: str
    full_name: str
    order_value: str
    order_value_amount: Decimal | None
    recovery_url: str
    created_at_text: str
    created_sort_key: datetime


@dataclass
class ApiCheckout:
    raw: dict[str, Any]
    email: str
    phones: list[str]
    first_name: str
    full_name: str
    total_price: str
    total_price_amount: Decimal | None
    recovery_url: str
    recovery_url_source: str
    created_at_text: str
    created_sort_key: datetime


@dataclass
class ShopifyApiStatus:
    needed: bool = False
    configured: bool = False
    attempted: bool = False
    success: bool = False
    message: str = "Shopify API fallback was not needed."
    fetched_count: int = 0
    matched_rows: int = 0


@dataclass
class OutputCandidate:
    input_index: int
    row_number: int
    raw_row: dict[str, str]
    output_row: dict[str, str]
    sort_key: datetime


def log(message: str, level: str = "INFO") -> None:
    print(f"[{level}] {message}")


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def normalize_header(value: str | None) -> str:
    value = (value or "").replace("\ufeff", "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def normalize_email(value: str) -> str:
    return clean_text(value).lower()


def has_usable_name(value: str) -> bool:
    value = clean_text(value)
    normalized = value.lower()
    if normalized in PLACEHOLDER_NAMES:
        return False
    return bool(re.search(r"[A-Za-z]", value))


def first_name_from_full_name(value: str) -> str:
    value = clean_text(value)
    if not has_usable_name(value):
        return ""
    for part in re.split(r"\s+", value):
        if re.search(r"[A-Za-z]", part):
            return re.sub(r"[^A-Za-z.'-]", "", part)
    return ""


def normalize_one_phone(raw_value: str) -> str:
    value = clean_text(raw_value)
    if not value:
        return ""

    value = value.strip("'\"")
    if value.startswith("="):
        value = value[1:].strip("'\"")
    value = re.sub(r"\.0+$", "", value)
    digits = re.sub(r"\D", "", value)

    if digits.startswith("0091") and len(digits) == 14:
        digits = digits[4:]
    elif digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]

    if len(digits) == 10 and digits[0] in "6789":
        return f"91{digits}"
    return ""


def parse_money(value: str) -> tuple[Decimal | None, str]:
    value = clean_text(value)
    if not value:
        return None, ""

    value = value.replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    if not match:
        return None, ""

    try:
        amount = Decimal(match.group(0))
    except InvalidOperation:
        return None, ""

    if amount < 0:
        return amount, ""

    formatted = str(amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return amount, formatted


def parse_created_at(value: str) -> datetime:
    value = clean_text(value)
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)

    normalized = value
    if normalized.endswith(" UTC"):
        normalized = normalized[:-4] + "+00:00"
    normalized = normalized.replace("Z", "+00:00")

    try:
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        pass

    formats = [
        "%Y-%m-%d %H:%M:%S %z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y",
        "%m-%d-%Y %H:%M:%S",
        "%m-%d-%Y",
        "%B %d, %Y %I:%M %p",
        "%b %d, %Y %I:%M %p",
    ]
    for date_format in formats:
        try:
            parsed = datetime.strptime(value, date_format)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            continue

    return datetime.min.replace(tzinfo=timezone.utc)


def score_name_column(header: str, mode: str) -> int:
    normalized = normalize_header(header)
    tokens = set(normalized.split())
    if not tokens or {"phone", "email", "url", "link", "id"} & tokens:
        return 0
    if {
        "address",
        "city",
        "code",
        "country",
        "item",
        "lineitem",
        "method",
        "price",
        "product",
        "province",
        "sku",
        "tax",
        "variant",
        "zip",
    } & tokens:
        return 0

    if mode == "full":
        if "name" not in tokens:
            return 0
        if "first" in tokens or "last" in tokens:
            return 0
        score = 50
        if "billing" in tokens:
            score += 45
        if "shipping" in tokens:
            score += 40
        if "customer" in tokens:
            score += 35
        if "full" in tokens:
            score += 20
        if normalized == "name":
            score -= 20
        if "company" in tokens:
            score -= 40
        return max(score, 0)

    if mode == "first" and "first" in tokens and "name" in tokens:
        score = 80
        if "customer" in tokens:
            score += 20
        if "billing" in tokens or "shipping" in tokens:
            score += 10
        return score

    if mode == "last" and "last" in tokens and "name" in tokens:
        score = 70
        if "customer" in tokens:
            score += 20
        if "billing" in tokens or "shipping" in tokens:
            score += 10
        return score

    return 0


def score_phone_column(header: str) -> int:
    normalized = normalize_header(header)
    tokens = set(normalized.split())
    if "phone" not in tokens and "mobile" not in tokens and "telephone" not in tokens:
        return 0
    score = 80
    if "shipping" in tokens:
        score += 20
    if "billing" in tokens:
        score += 18
    if "customer" in tokens:
        score += 15
    if "mobile" in tokens:
        score += 10
    if normalized == "phone":
        score += 12
    return score


def score_email_column(header: str) -> int:
    normalized = normalize_header(header)
    tokens = set(normalized.split())
    if "email" not in tokens and "e mail" not in normalized:
        return 0
    score = 90
    if "customer" in tokens:
        score += 10
    if normalized == "email":
        score += 20
    return score


def score_recovery_url_column(header: str) -> int:
    normalized = normalize_header(header)
    tokens = set(normalized.split())
    if "url" not in tokens and "link" not in tokens:
        return 0
    score = 35
    if "recovery" in tokens or "recover" in tokens:
        score += 45
    if "checkout" in tokens:
        score += 40
    if "abandoned" in tokens:
        score += 25
    if "web" in tokens:
        score += 10
    return score


def score_order_value_column(header: str) -> int:
    normalized = normalize_header(header)
    tokens = set(normalized.split())
    if not tokens:
        return 0
    if {"tax", "shipping", "discount", "refund", "refunded", "lineitem", "item"} & tokens:
        return 0

    if "cart" in tokens and ("value" in tokens or "total" in tokens or "price" in tokens):
        return 105
    if "order" in tokens and ("value" in tokens or "total" in tokens or "price" in tokens):
        return 100
    if "total" in tokens and "price" in tokens:
        return 95
    if normalized in {"total", "cart value", "order value", "total price"}:
        return 90
    if "subtotal" in tokens and "price" in tokens:
        return 65
    if "price" in tokens or "amount" in tokens or "value" in tokens:
        return 45
    return 0


def score_created_at_column(header: str) -> int:
    normalized = normalize_header(header)
    tokens = set(normalized.split())
    if not tokens:
        return 0
    if "updated" in tokens or "closed" in tokens or "cancelled" in tokens:
        return 0

    if "created" in tokens and "at" in tokens:
        return 110
    if "created" in tokens and ("date" in tokens or "time" in tokens):
        return 95
    if "abandoned" in tokens and ("at" in tokens or "date" in tokens):
        return 80
    if normalized in {"date", "created", "created date"}:
        return 55
    return 0


def ranked_columns(headers: Iterable[str], scorer) -> list[str]:
    ranked: list[tuple[int, int, str]] = []
    for index, header in enumerate(headers):
        score = scorer(header)
        if score > 0:
            ranked.append((score, -index, header))
    ranked.sort(reverse=True)
    return [header for _, _, header in ranked]


def detect_sources(headers: list[str]) -> Sources:
    return Sources(
        full_name_columns=ranked_columns(headers, lambda h: score_name_column(h, "full")),
        first_name_columns=ranked_columns(headers, lambda h: score_name_column(h, "first")),
        last_name_columns=ranked_columns(headers, lambda h: score_name_column(h, "last")),
        phone_columns=ranked_columns(headers, score_phone_column),
        email_columns=ranked_columns(headers, score_email_column),
        recovery_url_columns=ranked_columns(headers, score_recovery_url_column),
        order_value_columns=ranked_columns(headers, score_order_value_column),
        created_at_columns=ranked_columns(headers, score_created_at_column),
    )


def choose_first(row: dict[str, str], columns: Iterable[str]) -> str:
    for column in columns:
        value = clean_text(row.get(column, ""))
        if value:
            return value
    return ""


def choose_first_url(row: dict[str, str], columns: Iterable[str]) -> str:
    for column in columns:
        url = valid_http_url(row.get(column, ""))
        if url:
            return url
    return ""


def extract_full_name(row: dict[str, str], sources: Sources) -> str:
    for column in sources.full_name_columns:
        value = clean_text(row.get(column, ""))
        if has_usable_name(value):
            return value

    first_name = choose_first(row, sources.first_name_columns)
    last_name = choose_first(row, sources.last_name_columns)
    combined = clean_text(f"{first_name} {last_name}")
    if has_usable_name(combined):
        return combined
    return ""


def extract_first_name(row: dict[str, str], sources: Sources, full_name: str) -> str:
    for column in sources.first_name_columns:
        value = clean_text(row.get(column, ""))
        if has_usable_name(value):
            return first_name_from_full_name(value)
    return first_name_from_full_name(full_name)


def extract_phone(row: dict[str, str], sources: Sources) -> tuple[str, str]:
    values = [clean_text(row.get(column, "")) for column in sources.phone_columns]
    values = [value for value in values if value]
    if not values:
        return "", "blank"

    for value in values:
        phone = normalize_one_phone(value)
        if phone:
            return phone, ""
    return "", "invalid"


def extract_order_value(row: dict[str, str], sources: Sources) -> tuple[Decimal | None, str]:
    values = [clean_text(row.get(column, "")) for column in sources.order_value_columns]
    values = [value for value in values if value]
    if not values:
        return None, ""

    for value in values:
        amount, formatted = parse_money(value)
        if amount is not None and amount >= 0:
            return amount, formatted
    return None, ""


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]], str]:
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            text = path.read_text(encoding=encoding)
            break
        except UnicodeDecodeError as exc:
            last_error = exc
    else:
        raise ProcessingError(f"Could not read {path.name}: {last_error}")

    if not text.strip():
        raise ProcessingError(f"{path.name} is empty.")

    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [header.replace("\ufeff", "").strip() if header else "" for header in (reader.fieldnames or [])]
    if not headers or all(not header for header in headers):
        raise ProcessingError(f"{path.name} does not look like a CSV with headers.")
    reader.fieldnames = headers

    rows: list[dict[str, str]] = []
    for row in reader:
        rows.append({header: clean_text(row.get(header, "")) for header in headers})

    return headers, rows, dialect.delimiter


def latest_csv(input_dir: Path) -> Path:
    csv_files = [path for path in input_dir.iterdir() if path.is_file() and path.suffix.lower() == ".csv"]
    if not csv_files:
        raise ProcessingError(
            f"No CSV files found in {input_dir}. Place the Shopify abandoned checkout export CSV there and run again."
        )
    return max(csv_files, key=lambda path: (path.stat().st_mtime, path.name))


def parse_csv_records(rows: list[dict[str, str]], sources: Sources) -> list[CsvRecord]:
    records: list[CsvRecord] = []
    for input_index, row in enumerate(rows):
        full_name = extract_full_name(row, sources)
        first_name = extract_first_name(row, sources, full_name)
        phone, phone_status = extract_phone(row, sources)
        email = normalize_email(choose_first(row, sources.email_columns))
        amount, order_value = extract_order_value(row, sources)
        created_at_text = choose_first(row, sources.created_at_columns)
        records.append(
            CsvRecord(
                input_index=input_index,
                row_number=input_index + 2,
                raw_row=row,
                phone=phone,
                phone_status=phone_status,
                email=email,
                first_name=first_name,
                full_name=full_name,
                order_value=order_value,
                order_value_amount=amount,
                recovery_url=choose_first_url(row, sources.recovery_url_columns),
                created_at_text=created_at_text,
                created_sort_key=parse_created_at(created_at_text),
            )
        )
    return records


def load_env_values(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'\"")
            values[key] = value

    for key in SHOPIFY_ENV_KEYS:
        if os.environ.get(key):
            values[key] = os.environ[key].strip()
    return values


def shopify_config_from_env(env_values: dict[str, str]) -> tuple[dict[str, str], list[str]]:
    missing = [key for key in SHOPIFY_ENV_KEYS if not env_values.get(key)]
    config = {key: env_values.get(key, "") for key in SHOPIFY_ENV_KEYS}
    config["SHOPIFY_STORE_DOMAIN"] = clean_shopify_domain(config["SHOPIFY_STORE_DOMAIN"])
    return config, missing


def clean_shopify_domain(value: str) -> str:
    value = clean_text(value)
    value = re.sub(r"^https?://", "", value, flags=re.IGNORECASE)
    return value.rstrip("/")


def api_date_window(records: list[CsvRecord]) -> tuple[str | None, str | None]:
    dates = [
        record.created_sort_key
        for record in records
        if record.created_sort_key != datetime.min.replace(tzinfo=timezone.utc)
    ]
    if not dates:
        return None, None

    created_at_min = (min(dates) - timedelta(days=3)).isoformat()
    created_at_max = (max(dates) + timedelta(days=3)).isoformat()
    return created_at_min, created_at_max


def next_link_from_header(link_header: str | None) -> str:
    if not link_header:
        return ""

    for part in link_header.split(","):
        section = part.strip()
        if 'rel="next"' not in section:
            continue
        match = re.search(r"<([^>]+)>", section)
        if match:
            return match.group(1)
    return ""


def fetch_shopify_checkouts(config: dict[str, str], records: list[CsvRecord]) -> list[dict[str, Any]]:
    domain = config["SHOPIFY_STORE_DOMAIN"]
    api_version = config["SHOPIFY_API_VERSION"]
    token = config["SHOPIFY_ADMIN_ACCESS_TOKEN"]
    params = {"limit": API_LIMIT, "status": "open"}
    created_at_min, created_at_max = api_date_window(records)
    if created_at_min:
        params["created_at_min"] = created_at_min
    if created_at_max:
        params["created_at_max"] = created_at_max

    url = f"https://{domain}/admin/api/{api_version}/checkouts.json?{urllib.parse.urlencode(params)}"
    checkouts: list[dict[str, Any]] = []

    while url:
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "X-Shopify-Access-Token": token,
                "User-Agent": "wati-abandoned-checkout-processor/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=API_TIMEOUT_SECONDS) as response:
                body = response.read().decode("utf-8")
                payload = json.loads(body)
                page_checkouts = payload.get("checkouts", [])
                if not isinstance(page_checkouts, list):
                    raise ShopifyApiError("Shopify response did not contain a checkouts list.")
                checkouts.extend(page_checkouts)
                url = next_link_from_header(response.headers.get("Link"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            raise ShopifyApiError(f"HTTP {exc.code} from Shopify API: {detail}") from exc
        except urllib.error.URLError as exc:
            raise ShopifyApiError(f"Could not connect to Shopify API: {exc.reason}") from exc
        except json.JSONDecodeError as exc:
            raise ShopifyApiError("Shopify API returned invalid JSON.") from exc

    return checkouts


def valid_http_url(value: object) -> str:
    url = clean_text(value)
    if not url:
        return ""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return url
    return ""


def checkout_link_from_known_fields(raw: dict[str, Any]) -> tuple[str, str]:
    for field in ("abandoned_checkout_url", "web_url", "checkout_url", "recovery_url", "recover_url"):
        url = valid_http_url(raw.get(field))
        if url:
            return url, field
    return "", ""


def find_checkout_link_recursively(value: Any, parent_key: str = "") -> tuple[str, str]:
    if isinstance(value, dict):
        for key, child in value.items():
            url, source = find_checkout_link_recursively(child, key)
            if url:
                return url, source
    elif isinstance(value, list):
        for child in value:
            url, source = find_checkout_link_recursively(child, parent_key)
            if url:
                return url, source
    elif isinstance(value, str):
        url = valid_http_url(value)
        if url and ("recover" in url.lower() or "checkout" in url.lower()):
            source = parent_key or "nested_url"
            return url, source
    return "", ""


def checkout_recovery_url(raw: dict[str, Any]) -> tuple[str, str]:
    url, source = checkout_link_from_known_fields(raw)
    if url:
        return url, source
    return find_checkout_link_recursively(raw)


def nested_dict(raw: dict[str, Any], key: str) -> dict[str, Any]:
    value = raw.get(key)
    return value if isinstance(value, dict) else {}


def api_phone_values(raw: dict[str, Any]) -> list[str]:
    values = [
        raw.get("phone"),
        raw.get("sms_marketing_phone"),
    ]
    for address_key in ("billing_address", "shipping_address"):
        values.append(nested_dict(raw, address_key).get("phone"))

    customer = nested_dict(raw, "customer")
    values.append(customer.get("phone"))
    values.append(nested_dict(customer, "default_address").get("phone"))
    return [clean_text(value) for value in values if clean_text(value)]


def unique_normalized_phones(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    phones: list[str] = []
    for value in values:
        phone = normalize_one_phone(value)
        if phone and phone not in seen:
            phones.append(phone)
            seen.add(phone)
    return phones


def first_nonblank(values: Iterable[object]) -> str:
    for value in values:
        text = clean_text(value)
        if text:
            return text
    return ""


def api_checkout_to_record(raw: dict[str, Any]) -> ApiCheckout:
    customer = nested_dict(raw, "customer")
    billing = nested_dict(raw, "billing_address")
    shipping = nested_dict(raw, "shipping_address")
    first_name = first_nonblank(
        [
            customer.get("first_name"),
            billing.get("first_name"),
            shipping.get("first_name"),
        ]
    )
    full_name = first_nonblank(
        [
            " ".join(filter(None, [customer.get("first_name"), customer.get("last_name")])),
            billing.get("name"),
            shipping.get("name"),
        ]
    )
    if not first_name:
        first_name = first_name_from_full_name(full_name)

    amount, total_price = parse_money(first_nonblank([raw.get("total_price"), raw.get("subtotal_price")]))
    recovery_url, recovery_url_source = checkout_recovery_url(raw)
    created_at_text = first_nonblank([raw.get("created_at"), raw.get("updated_at")])
    return ApiCheckout(
        raw=raw,
        email=normalize_email(first_nonblank([raw.get("email"), customer.get("email")])),
        phones=unique_normalized_phones(api_phone_values(raw)),
        first_name=first_name_from_full_name(first_name),
        full_name=full_name,
        total_price=total_price,
        total_price_amount=amount,
        recovery_url=recovery_url,
        recovery_url_source=recovery_url_source,
        created_at_text=created_at_text,
        created_sort_key=parse_created_at(created_at_text),
    )


def normalize_api_checkouts(raw_checkouts: list[dict[str, Any]]) -> list[ApiCheckout]:
    return [api_checkout_to_record(raw) for raw in raw_checkouts if isinstance(raw, dict)]


def money_matches(left: Decimal | None, right: Decimal | None) -> bool:
    if left is None or right is None:
        return False
    return left.quantize(Decimal("0.01")) == right.quantize(Decimal("0.01"))


def created_at_score(left: datetime, right: datetime) -> int:
    minimum = datetime.min.replace(tzinfo=timezone.utc)
    if left == minimum or right == minimum:
        return 0
    delta = abs((left - right).total_seconds())
    if delta <= 5 * 60:
        return 25
    if delta <= 60 * 60:
        return 18
    if left.date() == right.date():
        return 10
    return 0


def names_match(csv_record: CsvRecord, checkout: ApiCheckout) -> bool:
    csv_parts = {csv_record.first_name.lower(), csv_record.full_name.lower()}
    api_parts = {checkout.first_name.lower(), checkout.full_name.lower()}
    csv_parts = {part for part in csv_parts if part}
    api_parts = {part for part in api_parts if part}
    if csv_parts & api_parts:
        return True
    for csv_part in csv_parts:
        for api_part in api_parts:
            if csv_part in api_part or api_part in csv_part:
                return True
    return False


def match_score(csv_record: CsvRecord, checkout: ApiCheckout) -> int:
    score = 0
    if csv_record.phone and csv_record.phone in checkout.phones:
        score += 60
    if csv_record.email and checkout.email and csv_record.email == checkout.email:
        score += 50
    if money_matches(csv_record.order_value_amount, checkout.total_price_amount):
        score += 20
    score += created_at_score(csv_record.created_sort_key, checkout.created_sort_key)
    if names_match(csv_record, checkout):
        score += 10
    return score


def best_api_match(csv_record: CsvRecord, api_checkouts: list[ApiCheckout]) -> ApiCheckout | None:
    best: tuple[int, ApiCheckout] | None = None
    for checkout in api_checkouts:
        score = match_score(csv_record, checkout)
        if score < MATCH_THRESHOLD:
            continue
        if best is None or score > best[0]:
            best = (score, checkout)
    return best[1] if best else None


def error_reason(*parts: str) -> str:
    clean_parts = [clean_text(part) for part in parts if clean_text(part)]
    return "; ".join(dict.fromkeys(clean_parts))


def rejection_row(raw_row: dict[str, str], reason: str) -> dict[str, str]:
    row = dict(raw_row)
    row["rejection_reason"] = reason
    return row


def api_unavailable_reason(status: ShopifyApiStatus) -> str:
    if status.success:
        return ""
    if status.needed:
        return status.message
    return ""


def build_candidates(
    csv_records: list[CsvRecord],
    api_checkouts: list[ApiCheckout],
    api_status: ShopifyApiStatus,
) -> tuple[list[OutputCandidate], list[dict[str, str]], dict[str, int]]:
    counters = {
        "total_rows": len(csv_records),
        "output_rows": 0,
        "rejected_rows": 0,
        "invalid_phone_rows": 0,
        "missing_recovery_url_rows": 0,
        "duplicate_rows_removed": 0,
        "api_matched_rows": 0,
        "invalid_email_rows": 0,
        "missing_first_name_rows": 0,
        "missing_order_value_rows": 0,
    }
    candidates: list[OutputCandidate] = []
    rejected_rows: list[dict[str, str]] = []

    for csv_record in csv_records:
        match = best_api_match(csv_record, api_checkouts) if api_checkouts else None
        if match:
            counters["api_matched_rows"] += 1

        api_phone = match.phones[0] if match and match.phones else ""
        phone = csv_record.phone or api_phone
        if not phone:
            reason = "blank phone" if csv_record.phone_status == "blank" else "invalid Indian mobile number"
            rejected_rows.append(rejection_row(csv_record.raw_row, reason))
            counters["invalid_phone_rows"] += 1
            continue

        first_name = csv_record.first_name or (match.first_name if match else "")
        order_value = csv_record.order_value or (match.total_price if match else "")
        created_at_text = (match.created_at_text if match else "") or csv_record.created_at_text
        customer_email = csv_record.email or (match.email if match else "")

        recovery_url = ""
        if match and match.recovery_url_source == "abandoned_checkout_url":
            recovery_url = match.recovery_url
        if not recovery_url:
            recovery_url = csv_record.recovery_url
        if not recovery_url and match:
            recovery_url = match.recovery_url

        reasons: list[str] = []
        if not first_name:
            reasons.append("missing first_name")
        if not order_value:
            reasons.append("missing order_value")
        if customer_email and not EMAIL_RE.match(customer_email):
            reasons.append("invalid customer_email format")
        if not recovery_url:
            if match:
                reasons.append("missing recovery URL; API checkout did not include a recovery/checkout link")
            elif api_checkouts:
                reasons.append("missing recovery URL; no matching Shopify API checkout found")
            else:
                unavailable = api_unavailable_reason(api_status)
                if unavailable:
                    reasons.append(f"missing recovery URL; {unavailable}")
                else:
                    reasons.append("missing recovery URL")

        candidates.append(
            OutputCandidate(
                input_index=csv_record.input_index,
                row_number=csv_record.row_number,
                raw_row=csv_record.raw_row,
                output_row={
                    "phone": phone,
                    "first_name": first_name,
                    "order_value": order_value,
                    "recovery_url": recovery_url,
                    "abandoned_checkout_created_at": created_at_text,
                    "customer_email": customer_email,
                    "error_reason": error_reason(*reasons),
                },
                sort_key=parse_created_at(created_at_text),
            )
        )

    kept_by_phone: dict[str, OutputCandidate] = {}
    for candidate in candidates:
        phone = candidate.output_row["phone"]
        existing = kept_by_phone.get(phone)
        if existing is None:
            kept_by_phone[phone] = candidate
            continue

        counters["duplicate_rows_removed"] += 1
        candidate_key = (candidate.sort_key, candidate.input_index)
        existing_key = (existing.sort_key, existing.input_index)
        if candidate_key > existing_key:
            rejected_rows.append(
                rejection_row(
                    existing.raw_row,
                    f"duplicate phone; older checkout removed; latest row {candidate.row_number} kept",
                )
            )
            kept_by_phone[phone] = candidate
        else:
            rejected_rows.append(
                rejection_row(
                    candidate.raw_row,
                    f"duplicate phone; older checkout removed; latest row {existing.row_number} kept",
                )
            )

    output_candidates = sorted(kept_by_phone.values(), key=lambda item: item.input_index)
    counters["output_rows"] = len(output_candidates)
    counters["rejected_rows"] = len(rejected_rows)
    counters["missing_recovery_url_rows"] = sum(
        1 for candidate in output_candidates if not candidate.output_row["recovery_url"]
    )
    counters["missing_first_name_rows"] = sum(
        1 for candidate in output_candidates if not candidate.output_row["first_name"]
    )
    counters["missing_order_value_rows"] = sum(
        1 for candidate in output_candidates if not candidate.output_row["order_value"]
    )
    counters["invalid_email_rows"] = sum(
        1
        for candidate in output_candidates
        if candidate.output_row["customer_email"]
        and not EMAIL_RE.match(candidate.output_row["customer_email"])
    )
    return output_candidates, rejected_rows, counters


def unique_output_path(output_dir: Path, stem: str, suffix: str) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    candidate = output_dir / f"{stem}_{timestamp}{suffix}"
    counter = 2
    while candidate.exists():
        candidate = output_dir / f"{stem}_{timestamp}_{counter}{suffix}"
        counter += 1
    return candidate


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def show_columns(columns: list[str]) -> str:
    return ", ".join(columns) if columns else "(not found)"


def format_detected_columns(sources: Sources) -> list[str]:
    return [
        f"first_name/full name: full=[{show_columns(sources.full_name_columns)}], first=[{show_columns(sources.first_name_columns)}], last=[{show_columns(sources.last_name_columns)}]",
        f"phone: {show_columns(sources.phone_columns)}",
        f"customer_email: {show_columns(sources.email_columns)}",
        f"recovery_url: {show_columns(sources.recovery_url_columns)}",
        f"order_value: {show_columns(sources.order_value_columns)}",
        f"abandoned_checkout_created_at: {show_columns(sources.created_at_columns)}",
    ]


def write_report(
    path: Path,
    input_path: Path,
    delimiter: str,
    sources: Sources,
    counters: dict[str, int],
    api_status: ShopifyApiStatus,
    output_path: Path,
    rejected_path: Path,
) -> None:
    lines = [
        "Shopify Abandoned Checkout WATI Validation Report",
        f"Generated at: {datetime.now().isoformat(timespec='seconds')}",
        f"Input file: {input_path}",
        f"Detected delimiter: {repr(delimiter)}",
        "",
        "Detected columns:",
        *[f"- {line}" for line in format_detected_columns(sources)],
        "",
        "Shopify API fallback:",
        f"- Needed: {api_status.needed}",
        f"- Configured: {api_status.configured}",
        f"- Attempted: {api_status.attempted}",
        f"- Success: {api_status.success}",
        f"- Message: {api_status.message}",
        f"- Fetched checkouts: {api_status.fetched_count}",
        f"- Matched rows: {counters['api_matched_rows']}",
        "",
        f"Total rows: {counters['total_rows']}",
        f"WATI output rows: {counters['output_rows']}",
        f"Rejected rows: {counters['rejected_rows']}",
        f"Duplicate rows removed: {counters['duplicate_rows_removed']}",
        f"Invalid phone rows: {counters['invalid_phone_rows']}",
        f"Missing recovery URL rows in WATI output: {counters['missing_recovery_url_rows']}",
        f"Missing first_name rows in WATI output: {counters['missing_first_name_rows']}",
        f"Missing order_value rows in WATI output: {counters['missing_order_value_rows']}",
        f"Invalid customer_email rows in WATI output: {counters['invalid_email_rows']}",
        "",
        f"Final WATI output path: {output_path}",
        f"Rejected rows path: {rejected_path}",
        f"Report path: {path}",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def maybe_fetch_api_checkouts(
    records: list[CsvRecord],
    env_path: Path,
) -> tuple[list[ApiCheckout], ShopifyApiStatus]:
    status = ShopifyApiStatus()
    status.needed = any(not record.recovery_url for record in records)
    if not status.needed:
        return [], status

    env_values = load_env_values(env_path)
    config, missing = shopify_config_from_env(env_values)
    status.configured = not missing
    if missing:
        status.message = "Shopify API credentials not configured; missing " + ", ".join(missing)
        log(status.message, "WARN")
        return [], status

    status.attempted = True
    log("CSV rows are missing recovery URLs, so Shopify API fallback will fetch abandoned checkouts.")
    try:
        raw_checkouts = fetch_shopify_checkouts(config, records)
    except ShopifyApiError as exc:
        status.message = f"Shopify API fallback failed: {exc}"
        log(status.message, "WARN")
        return [], status

    api_checkouts = normalize_api_checkouts(raw_checkouts)
    status.success = True
    status.fetched_count = len(api_checkouts)
    status.message = f"Fetched {len(api_checkouts)} abandoned checkout record(s) from Shopify API."
    log(status.message)
    return api_checkouts, status


def run(input_dir: Path, output_dir: Path, env_path: Path) -> tuple[Path, Path, Path]:
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    log(f"Input folder: {input_dir}")
    log(f"Output folder: {output_dir}")
    log(f"Environment file: {env_path}")

    input_path = latest_csv(input_dir)
    log(f"Reading latest CSV: {input_path.name}")

    headers, rows, delimiter = read_csv(input_path)
    log(f"Loaded {len(rows)} row(s).")

    sources = detect_sources(headers)
    log("Detected columns:")
    for line in format_detected_columns(sources):
        log(f"  {line}")

    csv_records = parse_csv_records(rows, sources)
    api_checkouts, api_status = maybe_fetch_api_checkouts(csv_records, env_path)
    candidates, rejected_rows, counters = build_candidates(csv_records, api_checkouts, api_status)
    api_status.matched_rows = counters["api_matched_rows"]

    output_path = unique_output_path(output_dir, "wati_ready_abandoned_checkouts", ".csv")
    rejected_path = unique_output_path(output_dir, "rejected_rows", ".csv")
    report_path = unique_output_path(output_dir, "validation_report", ".txt")

    write_csv(output_path, OUTPUT_COLUMNS, [candidate.output_row for candidate in candidates])
    write_csv(rejected_path, headers + ["rejection_reason"], rejected_rows)
    write_report(report_path, input_path, delimiter, sources, counters, api_status, output_path, rejected_path)

    log(f"WATI output rows written: {counters['output_rows']}")
    log(f"Rejected rows written: {counters['rejected_rows']}")
    log(f"Rows with blank recovery_url in WATI output: {counters['missing_recovery_url_rows']}")
    log(f"Duplicate rows removed: {counters['duplicate_rows_removed']}")
    log(f"WATI upload CSV: {output_path}", "OK")
    log(f"Rejected rows CSV: {rejected_path}", "OK")
    log(f"Validation report: {report_path}", "OK")
    return output_path, rejected_path, report_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean the latest Shopify abandoned checkout CSV into a WATI-ready contacts CSV."
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=BASE_DIR / "input",
        help="Folder containing raw Shopify CSV exports. Default: ./input",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BASE_DIR / "output",
        help="Folder where output CSVs and report are saved. Default: ./output",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=BASE_DIR / ".env",
        help="Path to .env file with Shopify Admin API settings. Default: ./.env",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        run(args.input_dir.resolve(), args.output_dir.resolve(), args.env_file.resolve())
    except ProcessingError as exc:
        log(str(exc), "ERROR")
        return 1
    except csv.Error as exc:
        log(f"CSV parsing failed: {exc}", "ERROR")
        return 1
    except OSError as exc:
        log(f"File operation failed: {exc}", "ERROR")
        return 1
    except KeyboardInterrupt:
        log("Cancelled.", "ERROR")
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
