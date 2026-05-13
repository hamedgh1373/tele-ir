#!/usr/bin/env bash
set -euo pipefail

APP_NAME="teleir"
APP_DIR="/opt/${APP_NAME}"
APP_USER="${APP_NAME}"
APP_GROUP="${APP_NAME}"
APP_PORT_PUBLIC="3012"
APP_PORT_INTERNAL="3013"
MONGO_PORT="27017"
MONGO_DB="teleir"
MONGO_DB_V2="teleirv2"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
NGINX_CONF="/etc/nginx/conf.d/${APP_NAME}.conf"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run this installer as root."
  exit 1
fi

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
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

random_secret() {
  openssl rand -hex 32
}

ensure_user() {
  if ! id -u "$APP_USER" >/dev/null 2>&1; then
    useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
  fi
}

install_base_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y curl git nginx certbot python3-certbot-nginx ca-certificates gnupg lsb-release unzip build-essential rsync openssl
}

install_node_and_pnpm() {
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    npm install -g pnpm
  fi
}

install_mongodb() {
  if ! command -v mongod >/dev/null 2>&1; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --dearmor -o /etc/apt/keyrings/mongodb-server-7.0.gpg
    echo "deb [ arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}")/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt-get update
    apt-get install -y mongodb-org
  fi

  mkdir -p /etc/systemd/system/mongod.service.d
  cat > /etc/systemd/system/mongod.service.d/override.conf <<EOF
[Service]
LimitNOFILE=64000
EOF
  systemctl daemon-reload
  systemctl enable --now mongod
}

write_env_file() {
  local public_origin="$1"
  local admin_phone="$2"
  local nextauth_secret="$3"

  cat > "${APP_DIR}/.env.local" <<EOF
MONGODB_URI=mongodb://127.0.0.1:${MONGO_PORT}/${MONGO_DB}?directConnection=true
TELEIR_DB_NAME=${MONGO_DB_V2}
TELEIR_LEGACY_DB_NAME=${MONGO_DB}
NEXTAUTH_URL=${public_origin}
NEXTAUTH_SECRET=${nextauth_secret}
ADMIN_PHONE=${admin_phone}
EOF

  chown "${APP_USER}:${APP_GROUP}" "${APP_DIR}/.env.local"
  chmod 600 "${APP_DIR}/.env.local"
}

write_service_file() {
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Tele IR Next.js app
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=5
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "${APP_NAME}.service"
}

write_nginx_http_config() {
  local server_names="$1"

  cat > "$NGINX_CONF" <<EOF
server {
    listen ${APP_PORT_PUBLIC};
    server_name ${server_names};

    client_max_body_size 1024M;

    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
    add_header Surrogate-Control "no-store" always;

    location /assets/static/ {
        alias ${APP_DIR}/.next/static/;
        try_files \$uri =404;
        access_log off;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        add_header Surrogate-Control "no-store" always;
    }

    location /_next/static/ {
        alias ${APP_DIR}/.next/static/;
        try_files \$uri =404;
        access_log off;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        add_header Surrogate-Control "no-store" always;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT_INTERNAL};
        proxy_http_version 1.1;
        proxy_set_header Host \$host:\$server_port;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Accept-Encoding "";
        proxy_hide_header Cache-Control;
        proxy_hide_header Pragma;
        proxy_hide_header Expires;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        add_header Surrogate-Control "no-store" always;

        sub_filter_once off;
        sub_filter_types application/javascript text/javascript;
        sub_filter '/_next/static' '/assets/static';
    }
}
EOF
}

configure_ssl() {
  local domain="$1"
  local ssl_email="$2"
  require_cmd certbot
  nginx -t
  systemctl reload nginx
  certbot --nginx -d "$domain" --non-interactive --agree-tos -m "$ssl_email" --redirect
}

deploy_project_files() {
  mkdir -p "$APP_DIR"
  rsync -a --delete \
    --exclude ".git" \
    --exclude ".next" \
    --exclude "node_modules" \
    --exclude ".env.local" \
    /var/www/teleir/ "${APP_DIR}/"
  chown -R "${APP_USER}:${APP_GROUP}" "$APP_DIR"
}

install_dependencies_and_build() {
  su -s /bin/bash -c "cd '${APP_DIR}' && pnpm install && pnpm build" "${APP_USER}"
}

configure_sms_settings() {
  local api_key="$1"
  local line_number="$2"
  local template_id="$3"
  local template_variable="$4"

  if [[ -z "$api_key" ]]; then
    return 0
  fi

  local cmd=(bash "${APP_DIR}/configure-sms.sh" --enable --api-key "$api_key" --non-interactive)
  if [[ -n "$template_id" ]]; then
    cmd+=(--template-id "$template_id" --template-variable "$template_variable")
  else
    cmd+=(--line-number "$line_number")
  fi

  (
    cd "$APP_DIR"
    "${cmd[@]}"
  )
}

start_services() {
  systemctl enable --now mongod
  systemctl restart "${APP_NAME}.service"
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
}

main() {
  prompt INSTALL_MODE "Install mode (ip/domain)" "ip"
  prompt APP_HOST "Server IP or domain" ""
  if [[ -z "$APP_HOST" ]]; then
    echo "Server IP or domain is required."
    exit 1
  fi

  prompt ADMIN_PHONE_INPUT "Admin phone number" "09123456789"
  prompt CONFIGURE_SMS_INPUT "Configure SMS.ir now? (yes/no)" "yes"
  SMS_API_KEY_INPUT=""
  SMS_LINE_NUMBER_INPUT=""
  SMS_TEMPLATE_ID_INPUT=""
  SMS_TEMPLATE_VARIABLE_INPUT="OTP"
  if [[ "$CONFIGURE_SMS_INPUT" == "yes" ]]; then
    prompt SMS_API_KEY_INPUT "SMS.ir API key" "" "1"
    prompt SMS_USE_TEMPLATE_INPUT "Use SMS.ir verify template? (yes/no)" "yes"
    if [[ "$SMS_USE_TEMPLATE_INPUT" == "yes" ]]; then
      prompt SMS_TEMPLATE_ID_INPUT "SMS.ir template ID" ""
      prompt SMS_TEMPLATE_VARIABLE_INPUT "SMS.ir template variable name" "OTP"
    else
      prompt SMS_LINE_NUMBER_INPUT "SMS.ir line number" ""
    fi
  fi
  prompt ENABLE_SSL "Enable SSL with Let's Encrypt? (yes/no)" "no"
  SSL_EMAIL=""
  if [[ "$ENABLE_SSL" == "yes" ]]; then
    prompt SSL_EMAIL "Email for Let's Encrypt" ""
    if [[ -z "$SSL_EMAIL" ]]; then
      echo "SSL email is required when SSL is enabled."
      exit 1
    fi
  fi

  local scheme="http"
  if [[ "$ENABLE_SSL" == "yes" ]]; then
    scheme="https"
  fi
  local public_origin="${scheme}://${APP_HOST}:${APP_PORT_PUBLIC}"
  local server_names="${APP_HOST} _"
  local nextauth_secret
  nextauth_secret="$(random_secret)"

  install_base_packages
  install_node_and_pnpm
  install_mongodb
  ensure_user
  deploy_project_files
  write_env_file "$public_origin" "$ADMIN_PHONE_INPUT" "$nextauth_secret"
  install_dependencies_and_build
  configure_sms_settings "$SMS_API_KEY_INPUT" "$SMS_LINE_NUMBER_INPUT" "$SMS_TEMPLATE_ID_INPUT" "$SMS_TEMPLATE_VARIABLE_INPUT"
  write_service_file
  write_nginx_http_config "$server_names"
  start_services

  if [[ "$ENABLE_SSL" == "yes" && "$INSTALL_MODE" == "domain" ]]; then
    configure_ssl "$APP_HOST" "$SSL_EMAIL"
  fi

  echo
  echo "Tele IR installation completed."
  echo "Open: ${public_origin}/login"
  echo "Admin phone: ${ADMIN_PHONE_INPUT}"
  echo
  if [[ -n "$SMS_API_KEY_INPUT" ]]; then
    echo "SMS login configured."
    if [[ -n "$SMS_TEMPLATE_ID_INPUT" ]]; then
      echo "SMS.ir template placeholder: #${SMS_TEMPLATE_VARIABLE_INPUT^^}#"
    fi
  else
    echo -e "\e[31mWARNING: SMS login is not configured.\e[0m"
    echo -e "\e[31mTele IR only supports phone-based SMS login. Users cannot sign in until SMS.ir is configured.\e[0m"
    echo "To configure it later:"
    echo "  cd ${APP_DIR}"
    echo "  sudo bash configure-sms.sh"
  fi
}

main "$@"
