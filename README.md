# MikroTik Billing

A web-based billing and management system for MikroTik ISP environments — PPPoE user management, billing, reseller tracking, and RouterOS server integration.

## Architecture

```
Browser → nginx (port 80)
              ├── static files  → /var/www/mikrotik-billing/dist
              └── /api/*        → Gateway (port 8080)
                                      └── Backend (port 3000)
                                                └── PostgreSQL (port 5432)
```

- **Frontend** — React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui
- **Gateway** — Express proxy
- **Backend** — Express REST API, PostgreSQL via `pg`
- **Process manager** — PM2
- **Web server** — nginx

---

## Quick Install (AlmaLinux 8 / 9)

```bash
git clone <repo-url> mikrotik-billing
cd mikrotik-billing
bash install.sh --domain YOUR_SERVER_IP --db-password your_secure_password
```

The script handles everything: EPEL, Node.js 20, pnpm, PM2, PostgreSQL init + auth config, SELinux boolean, firewalld, nginx, PM2 startup.

---

## Manual Setup

### 1. System packages

```bash
sudo dnf install -y epel-release
sudo dnf update -y

sudo dnf install -y \
  nginx \
  mysql-server \
  gcc gcc-c++ make python3 \
  curl wget git tar gzip unzip vim-enhanced \
  net-tools bind-utils nmap-ncat lsof tcpdump \
  chrony \
  firewalld \
  policycoreutils-python-utils setools-console

# Enable time sync and firewall
sudo systemctl enable --now chronyd
sudo systemctl enable --now firewalld
```

### 2. Node.js 20

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
npm install -g pnpm pm2
```

### 3. MySQL

```bash
# AlmaLinux 8 only — enable the module stream first
sudo dnf module enable -y mysql:8.0

sudo dnf install -y mysql-server
sudo systemctl enable --now mysqld

# Root uses socket auth by default — sudo mysql requires no password
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS mikrotik_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'billing'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON mikrotik_billing.* TO 'billing'@'localhost';
FLUSH PRIVILEGES;
SQL

# Load schema
mysql -u billing -p'your_password' mikrotik_billing < database/init.sql
```

### 4. Environment files

```bash
# Root (.env) — used during frontend build
echo "VITE_API_URL=/api" > .env

# backend/.env
cat > backend/.env <<EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mikrotik_billing
DB_USER=billing
DB_PASSWORD=your_password
PORT=3000
EOF

# gateway/.env
cat > gateway/.env <<EOF
BACKEND_URL=http://localhost:3000
GATEWAY_PORT=8080
EOF
```

See [.env.example](.env.example) for all available variables.

### 5. Install dependencies and build

```bash
pnpm install
pnpm build                           # outputs to dist/

cd backend  && npm install --omit=dev && cd ..
cd gateway  && npm install --omit=dev && cd ..
```

### 6. Deploy static files

```bash
sudo mkdir -p /var/www/mikrotik-billing/dist
sudo cp -r dist/. /var/www/mikrotik-billing/dist/
sudo chown -R nginx:nginx /var/www/mikrotik-billing
```

### 7. SELinux

nginx must be allowed to proxy to local Node.js ports:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

### 8. nginx

AlmaLinux uses `/etc/nginx/conf.d/` (no sites-available/sites-enabled):

```bash
sudo cp nginx.frontend.conf /etc/nginx/conf.d/mikrotik-billing.conf
sudo rm -f /etc/nginx/conf.d/default.conf   # remove welcome page
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

### 9. Firewall

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

### 10. PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # copy and run the printed sudo command
```

---

## PM2 Commands

```bash
pm2 list                      # show running processes
pm2 logs mikrotik-backend     # stream backend logs
pm2 logs mikrotik-gateway     # stream gateway logs
pm2 restart mikrotik-backend  # restart a process
pm2 restart all               # restart everything
pm2 stop all / pm2 delete all
```

---

## Development (local)

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd gateway && npm run dev

# Terminal 3 — Vite proxies /api → localhost:8080, binds to 0.0.0.0
pnpm dev
```

Other devices on your LAN can reach the dev server at `http://YOUR_IP:5173`.

---

## Updating

```bash
git pull
pnpm install && pnpm build
sudo cp -r dist/. /var/www/mikrotik-billing/dist/
pm2 restart all
```

---

## Project Structure

```
.
├── src/                     # React frontend source
│   └── app/
│       ├── pages/           # Dashboard, UserManagement, Billing, ...
│       ├── components/      # Layout, ConfirmDialog, ...
│       └── services/api.ts  # API client
├── backend/
│   └── src/
│       ├── index.js         # Express API (all routes)
│       └── db.js            # PostgreSQL pool
├── gateway/
│   └── src/
│       └── index.js         # Express proxy
├── database/
│   └── init.sql             # Schema + seed data
├── ecosystem.config.cjs     # PM2 process config
├── nginx.frontend.conf      # nginx site config (→ /etc/nginx/conf.d/)
├── install.sh               # One-shot AlmaLinux setup script
└── vite.config.ts           # Vite build + dev proxy config
```
