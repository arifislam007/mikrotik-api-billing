#!/usr/bin/env bash
# MikroTik Billing — AlmaLinux 8 / 9 setup script
# Run as a non-root user with sudo privileges.
# Usage: bash install.sh [--domain example.com] [--db-password mypassword]
set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="_"
DB_NAME="mikrotik_billing"
DB_USER="billing"
DB_PASSWORD="postgres"
DEPLOY_DIR="/var/www/mikrotik-billing"
NODE_VERSION="20"

# ── Argument parsing ──────────────────────────────────────────────────────────
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
die()     { echo -e "\e[31m[ERROR]\e[0m $*"; exit 1; }

# ── Preflight checks ──────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] && die "Do not run as root. Use a sudo-capable user."
command -v sudo &>/dev/null || die "sudo is required but not installed."

# ── 1. EPEL + system update ───────────────────────────────────────────────────
info "Enabling EPEL repository..."
sudo dnf install -y epel-release

info "Updating system packages..."
sudo dnf update -y -q

# ── 2. All system packages ────────────────────────────────────────────────────
info "Installing all required system packages..."
sudo dnf install -y \
  `# ── Web server ──────────────────────` \
  nginx \
  \
  `# ── Database ────────────────────────` \
  mysql-server \
  \
  `# ── Build tools (node-gyp / native modules) ─` \
  gcc \
  gcc-c++ \
  make \
  python3 \
  \
  `# ── Core utilities ──────────────────` \
  curl \
  wget \
  git \
  tar \
  gzip \
  unzip \
  vim-enhanced \
  \
  `# ── Network / diagnostics ───────────` \
  net-tools \
  bind-utils \
  nmap-ncat \
  lsof \
  tcpdump \
  \
  `# ── Time sync (critical for billing timestamps) ─` \
  chrony \
  \
  `# ── Firewall ────────────────────────` \
  firewalld \
  \
  `# ── SELinux management tools ────────` \
  policycoreutils-python-utils \
  setools-console

success "System packages installed."

# ── 3. chrony — NTP time sync ─────────────────────────────────────────────────
info "Enabling time synchronisation (chrony)..."
sudo systemctl enable --now chronyd
success "chronyd running."

# ── 4. firewalld — ensure running before we add rules later ──────────────────
info "Enabling firewalld..."
sudo systemctl enable --now firewalld
success "firewalld running."

# ── 5. Node.js via NodeSource ─────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_VERSION" ]]; then
  info "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | sudo bash -
  sudo dnf install -y nodejs
else
  info "Node.js $(node -v) already installed, skipping."
fi

# ── 6. pnpm ───────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm
else
  info "pnpm $(pnpm -v) already installed, skipping."
fi

# ── 7. PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2
else
  info "PM2 $(pm2 -v) already installed, skipping."
fi

# ── 8. MySQL — start, create DB and user ─────────────────────────────────────
info "Configuring MySQL..."

# AlmaLinux 8 requires enabling the mysql:8.0 module stream first
if grep -qE "AlmaLinux.*release 8" /etc/os-release 2>/dev/null; then
  sudo dnf module enable -y mysql:8.0
fi

sudo systemctl enable --now mysqld

# MySQL on AlmaLinux AppStream uses socket auth for root by default —
# sudo mysql connects without a password
info "Creating database and user..."
sudo mysql <<MYSQL_SETUP
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
MYSQL_SETUP

info "Loading database schema..."
mysql -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < "${APP_DIR}/database/init.sql"
success "Database ready."

# ── 9. Write .env files ───────────────────────────────────────────────────────
info "Writing environment files..."

cat > "${APP_DIR}/.env" <<EOF
VITE_API_URL=/api
EOF

cat > "${APP_DIR}/backend/.env" <<EOF
DB_HOST=localhost
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
PORT=3000
EOF

cat > "${APP_DIR}/gateway/.env" <<EOF
BACKEND_URL=http://localhost:3000
GATEWAY_PORT=8080
EOF

success "Environment files written."

# ── 10. Install Node.js dependencies ─────────────────────────────────────────
info "Installing frontend dependencies..."
cd "${APP_DIR}" && pnpm install

info "Installing backend dependencies..."
cd "${APP_DIR}/backend" && npm install --omit=dev

info "Installing gateway dependencies..."
cd "${APP_DIR}/gateway" && npm install --omit=dev

# ── 11. Build frontend ────────────────────────────────────────────────────────
info "Building frontend..."
cd "${APP_DIR}" && pnpm build

sudo mkdir -p "${DEPLOY_DIR}/dist"
sudo cp -r "${APP_DIR}/dist/." "${DEPLOY_DIR}/dist/"
sudo chown -R nginx:nginx "${DEPLOY_DIR}"
success "Frontend built → ${DEPLOY_DIR}/dist"

# ── 12. SELinux — allow nginx to proxy to Node.js ────────────────────────────
if command -v getenforce &>/dev/null && [[ "$(getenforce)" != "Disabled" ]]; then
  info "Configuring SELinux policies..."
  sudo setsebool -P httpd_can_network_connect 1
  # Allow nginx to read /var/www
  sudo restorecon -Rv "${DEPLOY_DIR}" 2>/dev/null || true
  success "SELinux: httpd_can_network_connect enabled."
fi

# ── 13. nginx ─────────────────────────────────────────────────────────────────
info "Configuring nginx..."
NGINX_CONF="/etc/nginx/conf.d/mikrotik-billing.conf"

sudo tee "${NGINX_CONF}" > /dev/null <<NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${DEPLOY_DIR}/dist;
    index index.html;

    # Increase upload limit for MikroTik config imports
    client_max_body_size 10M;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_read_timeout 30s;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF

sudo rm -f /etc/nginx/conf.d/default.conf
sudo systemctl enable --now nginx
sudo nginx -t && sudo systemctl reload nginx
success "nginx configured."

# ── 14. firewalld — open HTTP ─────────────────────────────────────────────────
info "Opening firewall ports..."
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
success "Firewall: HTTP/HTTPS allowed."

# ── 15. PM2 — start processes and register startup ───────────────────────────
info "Starting application processes with PM2..."
cd "${APP_DIR}"
pm2 delete mikrotik-backend mikrotik-gateway 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

STARTUP_CMD=$(pm2 startup systemd 2>&1 | grep "sudo" | tail -1)
echo "${STARTUP_CMD}" > /tmp/pm2-startup-cmd.sh
warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
warn " Run this command to enable PM2 auto-start on reboot:"
warn ""
warn "   ${STARTUP_CMD}"
warn ""
warn " (Also saved to /tmp/pm2-startup-cmd.sh)"
warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

success "PM2 processes started."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "════════════════════════════════════════════════════════"
success " MikroTik Billing installed successfully!"
if [[ "${DOMAIN}" == "_" ]]; then
  HOST_IP=$(hostname -I | awk '{print $1}')
  success " Open: http://${HOST_IP}"
else
  success " Open: http://${DOMAIN}"
fi
success ""
success " PM2 status:  pm2 list"
success " App logs:    pm2 logs"
success " DB shell:    sudo -u postgres psql ${DB_NAME}"
success "════════════════════════════════════════════════════════"
