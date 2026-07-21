#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env in $SCRIPT_DIR. Create it from .env.example first."
  exit 1
fi

set -a
source .env
set +a

if [[ -z "${CSV_PATH:-}" ]]; then
  echo "CSV_PATH is required in .env"
  exit 1
fi

if [[ -z "${SHOPIFY_STORE:-}" ]]; then
  echo "SHOPIFY_STORE is required in .env"
  exit 1
fi

if [[ -z "${SHOPIFY_CLIENT_ID:-}" || -z "${SHOPIFY_CLIENT_SECRET:-}" ]]; then
  echo "SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required in .env for automatic token fetch"
  exit 1
fi

if [[ -z "${SHOPIFY_LOCATION_ID:-}" && -z "${SHOPIFY_LOCATION_NAME:-}" ]]; then
  echo "Set SHOPIFY_LOCATION_ID or SHOPIFY_LOCATION_NAME in .env"
  exit 1
fi

TOKEN_URL="${SHOPIFY_TOKEN_URL:-https://${SHOPIFY_STORE}/admin/oauth/access_token}"
TOKEN_GRANT_TYPE="${SHOPIFY_TOKEN_GRANT_TYPE:-client_credentials}"

fetch_token() {
  local response token

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

echo "Fetching Shopify access token..."
SHOPIFY_ADMIN_TOKEN="$(fetch_token)" || exit 1
echo "Access token fetched successfully."

ARGS=(
  --csv "$CSV_PATH"
  --store "$SHOPIFY_STORE"
  --token "$SHOPIFY_ADMIN_TOKEN"
  --concurrency "${CONCURRENCY:-1}"
  --logPrefix "${LOG_PREFIX:-prod-run}"
)

if [[ -n "${SHOPIFY_LOCATION_ID:-}" ]]; then
  ARGS+=(--locationId "$SHOPIFY_LOCATION_ID")
fi
if [[ -n "${SHOPIFY_LOCATION_NAME:-}" ]]; then
  ARGS+=(--locationName "$SHOPIFY_LOCATION_NAME")
fi

npm start -- "${ARGS[@]}"
