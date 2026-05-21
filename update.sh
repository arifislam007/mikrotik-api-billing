#!/usr/bin/env bash
# MikroTik Billing — update script
# Run from the project directory as the same user who ran install.sh
# Usage: bash update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="/var/www/mikrotik-billing"

info()    { echo -e "\e[34m[INFO]\e[0m  $*"; }
success() { echo -e "\e[32m[OK]\e[0m    $*"; }
die()     { echo -e "\e[31m[ERROR]\e[0m $*"; exit 1; }

[[ $EUID -eq 0 ]] && die "Do not run as root. Use a sudo-capable user."

# ── 1. Pull latest code ───────────────────────────────────────────────────────
info "Pulling latest code from git..."
git -C "${APP_DIR}" pull
success "Code updated."

# ── 2. Install / sync dependencies ───────────────────────────────────────────
info "Syncing frontend dependencies..."
cd "${APP_DIR}" && pnpm install --frozen-lockfile

info "Syncing backend dependencies..."
cd "${APP_DIR}/backend" && npm install --omit=dev

info "Syncing gateway dependencies..."
cd "${APP_DIR}/gateway" && npm install --omit=dev

success "Dependencies up to date."

# ── 3. Build frontend ─────────────────────────────────────────────────────────
info "Building frontend..."
cd "${APP_DIR}" && pnpm build
sudo cp -r "${APP_DIR}/dist/." "${DEPLOY_DIR}/dist/"
sudo chown -R nginx:nginx "${DEPLOY_DIR}"
success "Frontend deployed → ${DEPLOY_DIR}/dist"

# ── 4. Reload nginx (picks up any static file changes) ───────────────────────
info "Reloading nginx..."
sudo nginx -t
sudo systemctl reload nginx
success "nginx reloaded."

# ── 5. Restart Node processes ─────────────────────────────────────────────────
info "Restarting backend and gateway..."
pm2 restart mikrotik-backend mikrotik-gateway
pm2 save
success "PM2 processes restarted."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "════════════════════════════════════════════════════════"
success " Update complete!"
success ""
success " Process status:  pm2 list"
success " Live logs:       pm2 logs"
success "════════════════════════════════════════════════════════"
