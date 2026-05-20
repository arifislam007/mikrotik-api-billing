#!/usr/bin/env bash
# MikroTik Billing — Linux host setup script
# Tested on Ubuntu 22.04 / 24.04 (Debian-based)
# Run as a user with sudo privileges, NOT as root.
# Usage: bash install.sh [--domain example.com] [--db-password mypassword]
set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="localhost"
DB_NAME="mikrotik_billing"
DB_USER="postgres"
DB_PASSWORD="postgres"
DEPLOY_DIR="/var/www/mikrotik-billing"
NODE_VERSION="20"

# ── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)      DOMAIN="$2";      shift 2 ;;
    --db-password) DB_PASSWORD="$2"; shift 2 ;;
    --db-name)     DB_NAME="$2";     shift 2 ;;
    --db-user)     DB_USER="$2";     shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "\e[34m[INFO]\e[0m  $*"; }
success() { echo -e "\e[32m[OK]\e[0m    $*"; }
warn()    { echo -e "\e[33m[WARN]\e[0m  $*"; }

# ── 1. System packages ────────────────────────────────────────────────────────
info "Updating package lists..."
sudo apt-get update -qq

info "Installing prerequisites (curl, gnupg, nginx, postgresql)..."
sudo apt-get install -y -qq curl gnupg ca-certificates lsb-release nginx postgresql postgresql-contrib

# ── 2. Node.js via NodeSource ─────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_VERSION" ]]; then
  info "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  info "Node.js $(node -v) already installed, skipping."
fi

# ── 3. pnpm ───────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm
else
  info "pnpm $(pnpm -v) already installed, skipping."
fi

# ── 4. PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2
else
  info "PM2 $(pm2 -v) already installed, skipping."
fi

# ── 5. PostgreSQL — create DB and user ───────────────────────────────────────
info "Configuring PostgreSQL..."
sudo systemctl enable --now postgresql

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

info "Running database schema..."
sudo -u postgres psql "${DB_NAME}" < "${APP_DIR}/database/init.sql"
success "Database ready."

# ── 6. Write .env files ───────────────────────────────────────────────────────
info "Writing .env files..."

cat > "${APP_DIR}/.env" <<EOF
VITE_API_URL=/api
EOF

cat > "${APP_DIR}/backend/.env" <<EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
PORT=3000
EOF

cat > "${APP_DIR}/gateway/.env" <<EOF
BACKEND_URL=http://localhost:3000
GATEWAY_PORT=8080
EOF

success ".env files written."

# ── 7. Install dependencies ───────────────────────────────────────────────────
info "Installing frontend dependencies..."
cd "${APP_DIR}" && pnpm install

info "Installing backend dependencies..."
cd "${APP_DIR}/backend" && npm install --omit=dev

info "Installing gateway dependencies..."
cd "${APP_DIR}/gateway" && npm install --omit=dev

# ── 8. Build frontend ─────────────────────────────────────────────────────────
info "Building frontend..."
cd "${APP_DIR}" && pnpm build

sudo mkdir -p "${DEPLOY_DIR}"
sudo cp -r "${APP_DIR}/dist/." "${DEPLOY_DIR}/dist/"
sudo chown -R www-data:www-data "${DEPLOY_DIR}"
success "Frontend built → ${DEPLOY_DIR}/dist"

# ── 9. nginx ─────────────────────────────────────────────────────────────────
info "Configuring nginx..."
NGINX_CONF="/etc/nginx/sites-available/mikrotik-billing"

sudo tee "${NGINX_CONF}" > /dev/null <<NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${DEPLOY_DIR}/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF

sudo ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/mikrotik-billing
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
success "nginx configured."

# ── 10. PM2 — start and save ─────────────────────────────────────────────────
info "Starting PM2 processes..."
cd "${APP_DIR}"
pm2 delete mikrotik-backend mikrotik-gateway 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Register PM2 startup (prints a command the user must run once as root)
pm2 startup | tail -1 | tee /tmp/pm2-startup-cmd.sh
warn "Run the command above (or in /tmp/pm2-startup-cmd.sh) to enable PM2 auto-start on boot."
success "PM2 processes started."

echo ""
success "============================================================"
success " MikroTik Billing deployed successfully!"
success " Open: http://${DOMAIN}"
success "============================================================"
