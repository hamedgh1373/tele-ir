#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"

API_KEY=""
LINE_NUMBER=""
TEMPLATE_ID=""
TEMPLATE_VARIABLE="OTP"
ENABLED="1"
INTERACTIVE="1"

usage() {
  cat <<'EOF'
Usage:
  bash configure-sms.sh

  bash configure-sms.sh --enable \
    --api-key "SMSIR_API_KEY" \
    --template-id 123456 \
    --template-variable OTP

  bash configure-sms.sh --enable \
    --api-key "SMSIR_API_KEY" \
    --line-number 3000XXXXXX

Options:
  --api-key VALUE
  --line-number VALUE
  --template-id VALUE
  --template-variable VALUE
  --enable
  --disable
  --non-interactive
  --help
EOF
}

prompt() {
  local var_name="$1"
  local message="$2"
  local default_value="${3:-}"
  local secret="${4:-0}"
  local value=""

  if [[ "$secret" == "1" ]]; then
    read -r -s -p "${message}${default_value:+ [$default_value]}: " value
    echo
  else
    read -r -p "${message}${default_value:+ [$default_value]}: " value
  fi

  if [[ -z "$value" ]]; then
    value="$default_value"
  fi

  printf -v "$var_name" '%s' "$value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-key)
      API_KEY="${2:-}"
      shift 2
      ;;
    --line-number)
      LINE_NUMBER="${2:-}"
      shift 2
      ;;
    --template-id)
      TEMPLATE_ID="${2:-}"
      shift 2
      ;;
    --template-variable)
      TEMPLATE_VARIABLE="${2:-}"
      shift 2
      ;;
    --enable)
      ENABLED="1"
      shift
      ;;
    --disable)
      ENABLED="0"
      shift
      ;;
    --non-interactive)
      INTERACTIVE="0"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "MONGODB_URI is missing in $ENV_FILE"
  exit 1
fi

DB_NAME="${TELEIR_DB_NAME:-teleirv2}"

if [[ "$INTERACTIVE" == "1" ]]; then
  prompt ENABLED_INPUT "Enable SMS OTP login? (yes/no)" "$([[ "$ENABLED" == "1" ]] && echo "yes" || echo "no")"
  if [[ "$ENABLED_INPUT" == "no" ]]; then
    ENABLED="0"
  else
    ENABLED="1"
    prompt API_KEY "SMS.ir API key" "$API_KEY" "1"
    prompt MODE_INPUT "Use SMS.ir verify template? (yes/no)" "$([[ -n "$TEMPLATE_ID" ]] && echo "yes" || echo "yes")"
    if [[ "$MODE_INPUT" == "yes" ]]; then
      prompt TEMPLATE_ID "SMS.ir template ID" "$TEMPLATE_ID"
      prompt TEMPLATE_VARIABLE "Template variable name" "$TEMPLATE_VARIABLE"
      LINE_NUMBER=""
    else
      TEMPLATE_ID=""
      prompt LINE_NUMBER "SMS.ir line number" "$LINE_NUMBER"
    fi
  fi
fi

if [[ "$ENABLED" == "1" && -z "$API_KEY" ]]; then
  echo "SMS.ir API key is required when SMS login is enabled."
  exit 1
fi

if [[ "$ENABLED" == "1" && -z "$TEMPLATE_ID" && -z "$LINE_NUMBER" ]]; then
  echo "Provide either --template-id or --line-number when SMS login is enabled."
  exit 1
fi

if [[ -z "$TEMPLATE_VARIABLE" ]]; then
  TEMPLATE_VARIABLE="OTP"
fi

SMS_ENABLED="$ENABLED" \
SMS_API_KEY="$API_KEY" \
SMS_LINE_NUMBER="$LINE_NUMBER" \
SMS_TEMPLATE_ID="$TEMPLATE_ID" \
SMS_TEMPLATE_VARIABLE="$TEMPLATE_VARIABLE" \
TELEIR_DB_NAME="$DB_NAME" \
mongosh "$MONGODB_URI" --quiet --eval '
const dbName = process.env.TELEIR_DB_NAME || "teleirv2";
const value = {
  provider: "smsir",
  enabled: process.env.SMS_ENABLED === "1",
  apiKey: process.env.SMS_API_KEY || "",
  lineNumber: process.env.SMS_LINE_NUMBER || undefined,
  templateId: process.env.SMS_TEMPLATE_ID ? Number(process.env.SMS_TEMPLATE_ID) : undefined,
  templateVariable: (process.env.SMS_TEMPLATE_VARIABLE || "OTP").trim() || "OTP",
  updatedAt: new Date().toISOString(),
  updatedBy: "configure-sms.sh"
};
db.getSiblingDB(dbName).collection("settings").updateOne(
  { key: "sms" },
  { $set: { key: "sms", value } },
  { upsert: true }
);
printjson({
  ok: true,
  dbName,
  enabled: value.enabled,
  mode: value.templateId ? "template" : "bulk",
  templateId: value.templateId || null,
  templateVariable: value.templateVariable,
  lineNumber: value.lineNumber || null
});
'

echo
if [[ "$ENABLED" == "1" ]]; then
  echo "SMS settings saved."
  if [[ -n "$TEMPLATE_ID" ]]; then
    echo "SMS.ir template placeholder must match: #${TEMPLATE_VARIABLE^^}#"
  fi
else
  echo "SMS login disabled."
fi
