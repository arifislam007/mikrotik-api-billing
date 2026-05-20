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
- **Gateway** — Express proxy (rate-limiting, auth header injection)
- **Backend** — Express REST API, PostgreSQL via `pg`
- **Process manager** — PM2
- **Web server** — nginx

---

## Quick Install (Ubuntu 22.04 / 24.04)

```bash
git clone <repo-url> mikrotik-billing
cd mikrotik-billing
bash install.sh --domain your.server.ip --db-password your_secure_password
```

The script installs Node.js 20, pnpm, PM2, PostgreSQL, builds the frontend, configures nginx, initialises the database, and starts all processes under PM2.

---

## Manual Setup

### Prerequisites

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm and PM2
npm install -g pnpm pm2

# PostgreSQL
sudo apt-get install -y postgresql
sudo systemctl enable --now postgresql
```

### Database

```bash
sudo -u postgres psql <<SQL
CREATE USER postgres WITH PASSWORD 'postgres';
CREATE DATABASE mikrotik_billing OWNER postgres;
SQL

sudo -u postgres psql mikrotik_billing < database/init.sql
```

### Environment files

Copy from the example and fill in your values:

```bash
cp .env.example .env
```

Then create per-service files (or let `install.sh` do it):

**`.env`** (root — Vite build)
```
VITE_API_URL=/api
```

**`backend/.env`**
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mikrotik_billing
DB_USER=postgres
DB_PASSWORD=your_password
PORT=3000
```

**`gateway/.env`**
```
BACKEND_URL=http://localhost:3000
GATEWAY_PORT=8080
```

### Install dependencies & build

```bash
# Frontend
pnpm install
pnpm build          # outputs to dist/

# Backend / Gateway
cd backend  && npm install --omit=dev && cd ..
cd gateway  && npm install --omit=dev && cd ..
```

### Deploy frontend static files

```bash
sudo mkdir -p /var/www/mikrotik-billing/dist
sudo cp -r dist/. /var/www/mikrotik-billing/dist/
sudo chown -R www-data:www-data /var/www/mikrotik-billing
```

### nginx

```bash
sudo cp nginx.frontend.conf /etc/nginx/sites-available/mikrotik-billing
# Edit server_name to your IP or domain
sudo nano /etc/nginx/sites-available/mikrotik-billing

sudo ln -s /etc/nginx/sites-available/mikrotik-billing \
           /etc/nginx/sites-enabled/mikrotik-billing
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### Start with PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save

# Enable auto-start on reboot
pm2 startup          # copy and run the printed command
```

---

## PM2 Commands

```bash
pm2 list                      # show running processes
pm2 logs mikrotik-backend     # stream backend logs
pm2 logs mikrotik-gateway     # stream gateway logs
pm2 restart mikrotik-backend  # restart a process
pm2 stop all                  # stop everything
pm2 delete all                # remove from PM2
```

---

## Development (local)

```bash
# Start PostgreSQL locally (or adjust backend/.env to point at a remote DB)

# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — gateway
cd gateway && npm run dev

# Terminal 3 — frontend (proxies /api → localhost:8080 via vite.config.ts)
pnpm dev
```

---

## Updating

```bash
git pull

# Rebuild frontend
pnpm install
pnpm build
sudo cp -r dist/. /var/www/mikrotik-billing/dist/

# Restart Node processes
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
├── nginx.frontend.conf      # nginx site config template
├── install.sh               # One-shot Linux setup script
└── vite.config.ts           # Vite build + dev proxy config
```
