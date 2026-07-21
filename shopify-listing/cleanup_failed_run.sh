#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env in $SCRIPT_DIR"
  exit 1
fi

set -a
source .env
set +a

if [[ -z "${SHOPIFY_STORE:-}" ]]; then
  echo "SHOPIFY_STORE is required in .env"
  exit 1
fi

LOG_FILE=""
EXECUTE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --log)
      LOG_FILE="${2:-}"
      shift 2
      ;;
    --execute)
      EXECUTE="true"
      shift
      ;;
    *)
      echo "Unknown arg: $1"
      echo "Usage: ./cleanup_failed_run.sh --log ./logs/prod-run_run_log_YYYYMMDD_HHMMSS.csv [--execute]"
      exit 1
      ;;
  esac
done

if [[ -z "$LOG_FILE" ]]; then
  echo "--log is required"
  exit 1
fi

if [[ ! -f "$LOG_FILE" ]]; then
  echo "Log file not found: $LOG_FILE"
  exit 1
fi

TOKEN_URL="${SHOPIFY_TOKEN_URL:-https://${SHOPIFY_STORE}/admin/oauth/access_token}"
TOKEN_GRANT_TYPE="${SHOPIFY_TOKEN_GRANT_TYPE:-client_credentials}"

fetch_token() {
  local response token

  if [[ -n "${SHOPIFY_ADMIN_TOKEN:-}" ]]; then
    printf '%s' "$SHOPIFY_ADMIN_TOKEN"
    return 0
  fi

  if [[ -z "${SHOPIFY_CLIENT_ID:-}" || -z "${SHOPIFY_CLIENT_SECRET:-}" ]]; then
    echo "Set SHOPIFY_ADMIN_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET in .env"
    return 1
  fi

  if [[ "$TOKEN_GRANT_TYPE" == "authorization_code" ]]; then
    if [[ -z "${SHOPIFY_AUTH_CODE:-}" ]]; then
      echo "SHOPIFY_AUTH_CODE is required when SHOPIFY_TOKEN_GRANT_TYPE=authorization_code"
      return 1
    fi
    response="$(curl -sS -X POST "$TOKEN_URL" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -H "Accept: application/json" \
      --data-urlencode "grant_type=authorization_code" \
      --data-urlencode "client_id=$SHOPIFY_CLIENT_ID" \
      --data-urlencode "client_secret=$SHOPIFY_CLIENT_SECRET" \
      --data-urlencode "code=$SHOPIFY_AUTH_CODE")"
  elif [[ "$TOKEN_GRANT_TYPE" == "refresh_token" ]]; then
    if [[ -z "${SHOPIFY_REFRESH_TOKEN:-}" ]]; then
      echo "SHOPIFY_REFRESH_TOKEN is required when SHOPIFY_TOKEN_GRANT_TYPE=refresh_token"
      return 1
    fi
    response="$(curl -sS -X POST "$TOKEN_URL" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -H "Accept: application/json" \
      --data-urlencode "grant_type=refresh_token" \
      --data-urlencode "client_id=$SHOPIFY_CLIENT_ID" \
      --data-urlencode "client_secret=$SHOPIFY_CLIENT_SECRET" \
      --data-urlencode "refresh_token=$SHOPIFY_REFRESH_TOKEN")"
  else
    response="$(curl -sS -X POST "$TOKEN_URL" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -H "Accept: application/json" \
      --data-urlencode "grant_type=client_credentials" \
      --data-urlencode "client_id=$SHOPIFY_CLIENT_ID" \
      --data-urlencode "client_secret=$SHOPIFY_CLIENT_SECRET")"
  fi

  token="$(printf '%s' "$response" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);if(typeof j.access_token==="string") process.stdout.write(j.access_token.trim());}catch{}})')"
  if [[ -z "$token" ]]; then
    echo "Token fetch failed from $TOKEN_URL (grant_type=$TOKEN_GRANT_TYPE). Response: $response"
    return 1
  fi

  printf '%s' "$token"
}

extract_failed_gids() {
  python3 - "$1" <<'PY'
import csv
import sys

path = sys.argv[1]
seen = set()
with open(path, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        status = (row.get("summaryStatus") or "").strip().upper()
        gid = (row.get("productGid") or "").strip()
        if status == "FAILED" and gid:
            seen.add(gid)
for gid in sorted(seen):
    print(gid)
PY
}

mapfile -t PRODUCT_GIDS < <(extract_failed_gids "$LOG_FILE")

if [[ "${#PRODUCT_GIDS[@]}" -eq 0 ]]; then
  echo "No failed product IDs found in log: $LOG_FILE"
  exit 0
fi

echo "Found ${#PRODUCT_GIDS[@]} failed product(s) in $LOG_FILE"
for gid in "${PRODUCT_GIDS[@]}"; do
  echo "  $gid"
done

if [[ "$EXECUTE" != "true" ]]; then
  echo
  echo "Dry-run only. Re-run with --execute to delete these products."
  exit 0
fi

echo
echo "Fetching access token..."
TOKEN="$(fetch_token)" || exit 1
echo "Deleting products..."

GRAPHQL_ENDPOINT="https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json"

for gid in "${PRODUCT_GIDS[@]}"; do
  response="$(curl -sS -X POST "$GRAPHQL_ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "X-Shopify-Access-Token: $TOKEN" \
    --data "{\"query\":\"mutation DeleteProduct(\$id: ID!) { productDelete(input: {id: \$id}) { deletedProductId userErrors { field message } } }\",\"variables\":{\"id\":\"$gid\"}}")"

  status="$(printf '%s' "$response" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const ge=(j.errors||[]).map(e=>e.message);const ue=((j.data||{}).productDelete||{}).userErrors||[];if(ge.length||ue.length){process.stdout.write("error");return;}const out=((j.data||{}).productDelete||{}).deletedProductId||"";process.stdout.write(out?out:"error");}catch{process.stdout.write("error");}})')"

  if [[ "$status" == "error" ]]; then
    echo "FAILED delete for $gid"
    echo "Response: $response"
  else
    echo "Deleted: $status"
  fi
done

echo "Cleanup complete."
