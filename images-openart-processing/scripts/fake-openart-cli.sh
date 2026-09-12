#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  version) printf '%s\n' 'fake-openart-cli 1.0.0' ;;
  account) printf '%s\n' '{"plan":"Test","credits":9999}' ;;
  model)
    case "${2:-}" in
      list) printf '%s\n' '[{"id":"gpt-image-2","displayName":"GPT Image 2","modes":{"image":[{"mode":"image2image"}]}}]' ;;
      form) printf '%s\n' '{"jsonSchema":{"properties":{"visualReferences":{"minItems":1,"maxItems":16}}}}' ;;
      cost) printf '%s\n' '{"items":[{"totalCredits":42,"config":{"model":"gpt-image-2"}}]}' ;;
    esac ;;
  upload) printf '%s\n' '{"status":"SUCCESS","uploadId":"fake-upload","url":"https://cdn.openart.ai/fake-reference.png"}' ;;
  generate) printf '%s\n' '{"estimatedCredits":42,"status":"DRY_RUN"}' ;;
  *) printf '%s\n' '{"error":"unsupported fake command"}' >&2; exit 2 ;;
esac
