#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/teleir"
SERVICE_NAME="teleir.service"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root."
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  echo "Tele IR is not installed in ${APP_DIR}."
  exit 1
fi

su -s /bin/bash -c "cd '${APP_DIR}' && pnpm install && pnpm build" teleir
systemctl restart "${SERVICE_NAME}"
echo "Tele IR updated and restarted."
