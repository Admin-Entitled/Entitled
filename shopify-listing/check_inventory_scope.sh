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

TOKEN_URL="${SHOPIFY_TOKEN_URL:-https://${SHOPIFY_STORE}/admin/oauth/access_token}"
TOKEN_GRANT_TYPE="${SHOPIFY_TOKEN_GRANT_TYPE:-client_credentials}"

fetch_token() {
  if [[ -n "${SHOPIFY_ADMIN_TOKEN:-}" ]]; then
    printf '%s' "$SHOPIFY_ADMIN_TOKEN"
    return 0
  fi

  if [[ -z "${SHOPIFY_CLIENT_ID:-}" || -z "${SHOPIFY_CLIENT_SECRET:-}" ]]; then
    echo "Set SHOPIFY_ADMIN_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET in .env"
    return 1
  fi

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
    echo "Token fetch failed. Response: $response"
    return 1
  fi
  printf '%s' "$token"
}

echo "Fetching token..."
TOKEN="$(fetch_token)" || exit 1

GRAPHQL_ENDPOINT="https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json"
RESP="$(curl -sS -X POST "$GRAPHQL_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: $TOKEN" \
  --data '{"query":"query AccessScopes { currentAppInstallation { accessScopes { handle } } }"}')"

echo "$RESP" | node -e '
let d="";
process.stdin.on("data",c=>d+=c).on("end",()=>{
  const j=JSON.parse(d);
  if (j.errors?.length) {
    console.log("GraphQL errors:", JSON.stringify(j.errors));
    process.exit(1);
  }
  const scopes=((j.data||{}).currentAppInstallation||{}).accessScopes||[];
  const handles=scopes.map(s=>String(s.handle||"")).filter(Boolean);
  handles.sort();
  console.log("Scopes:", handles.join(", "));
  console.log("Has write_inventory:", handles.includes("write_inventory") ? "YES" : "NO");
  console.log("Has write_products:", handles.includes("write_products") ? "YES" : "NO");
});
'
