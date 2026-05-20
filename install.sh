#!/usr/bin/env bash
# MikroTik Billing — Linux host setup script
# Tested on AlmaLinux 8 / 9 (RHEL-compatible)
# Run as a user with sudo privileges, NOT as root.
# Usage: bash install.sh [--domain example.com] [--db-password mypassword]
set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="_"
DB_NAME="mikrotik_billing"
DB_USER="billing"
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
info "Enabling EPEL and updating packages..."
sudo dnf install -y epel-release
sudo dnf update -y -q

info "Installing prerequisites (curl, nginx, postgresql-server)..."
sudo dnf install -y curl nginx postgresql-server postgresql-contrib

# ── 2. Node.js via NodeSource ─────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_VERSION" ]]; then
  info "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | sudo bash -
  sudo dnf install -y nodejs
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

# ── 5. PostgreSQL — init, configure auth, create DB ──────────────────────────
info "Configuring PostgreSQL..."

# Initialise data directory if not already done
if [ ! -f /var/lib/pgsql/data/PG_VERSION ]; then
  sudo postgresql-setup --initdb
fi

sudo systemctl enable --now postgresql

# Switch local + loopback connections from ident/peer to md5
# (required so Node.js can authenticate with DB_USER/DB_PASSWORD over TCP)
PG_HBA="/var/lib/pgsql/data/pg_hba.conf"
sudo sed -i \
  -e 's/^\(local\s\+all\s\+all\s\+\)peer/\1md5/' \
  -e 's/^\(host\s\+all\s\+all\s\+127\.0\.0\.1\/32\s\+\)ident/\1md5/' \
  -e 's/^\(host\s\+all\s\+all\s\+::1\/128\s\+\)ident/\1md5/' \
  "${PG_HBA}"

sudo systemctl restart postgresql

# Create role and database (idempotent)
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# Grant required privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"

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

sudo mkdir -p "${DEPLOY_DIR}/dist"
sudo cp -r "${APP_DIR}/dist/." "${DEPLOY_DIR}/dist/"
sudo chown -R nginx:nginx "${DEPLOY_DIR}"
success "Frontend built → ${DEPLOY_DIR}/dist"

# ── 9. SELinux — allow nginx to proxy to Node.js ports ───────────────────────
if command -v getenforce &>/dev/null && [[ "$(getenforce)" != "Disabled" ]]; then
  info "Configuring SELinux for nginx reverse proxy..."
  sudo setsebool -P httpd_can_network_connect 1
  success "SELinux: httpd_can_network_connect enabled."
fi

# ── 10. nginx ─────────────────────────────────────────────────────────────────
info "Configuring nginx..."
# AlmaLinux uses /etc/nginx/conf.d/ — no sites-available/sites-enabled
NGINX_CONF="/etc/nginx/conf.d/mikrotik-billing.conf"

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

# Remove the default welcome page to avoid conflicts
sudo rm -f /etc/nginx/conf.d/default.conf

sudo systemctl enable --now nginx
sudo nginx -t && sudo systemctl reload nginx
success "nginx configured."

# ── 11. firewalld — open HTTP port ───────────────────────────────────────────
if systemctl is-active --quiet firewalld; then
  info "Opening port 80 in firewalld..."
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --reload
  success "Firewall: HTTP allowed."
else
  warn "firewalld is not running — skipping firewall config."
fi

# ── 12. PM2 — start and save ─────────────────────────────────────────────────
info "Starting PM2 processes..."
cd "${APP_DIR}"
pm2 delete mikrotik-backend mikrotik-gateway 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Register PM2 startup
STARTUP_CMD=$(pm2 startup | grep "sudo" | tail -1)
echo "${STARTUP_CMD}" > /tmp/pm2-startup-cmd.sh
warn "Run this once to enable PM2 auto-start on boot:"
echo "  ${STARTUP_CMD}"
success "PM2 processes started."

echo ""
success "============================================================"
success " MikroTik Billing deployed successfully!"
if [[ "${DOMAIN}" == "_" ]]; then
  success " Open: http://$(hostname -I | awk '{print $1}')"
else
  success " Open: http://${DOMAIN}"
fi
success "============================================================"
