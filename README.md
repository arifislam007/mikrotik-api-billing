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
sudo dnf install -y curl nginx postgresql-server postgresql-contrib
```

### 2. Node.js 20

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
npm install -g pnpm pm2
```

### 3. PostgreSQL

```bash
# Initialise (first time only)
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql

# Allow password auth over TCP (AlmaLinux defaults to ident)
sudo sed -i \
  -e 's/^\(local\s\+all\s\+all\s\+\)peer/\1md5/' \
  -e 's/^\(host\s\+all\s\+all\s\+127\.0\.0\.1\/32\s\+\)ident/\1md5/' \
  -e 's/^\(host\s\+all\s\+all\s\+::1\/128\s\+\)ident/\1md5/' \
  /var/lib/pgsql/data/pg_hba.conf
sudo systemctl restart postgresql

# Create user and database
sudo -u postgres psql <<SQL
CREATE USER billing WITH PASSWORD 'your_password';
CREATE DATABASE mikrotik_billing OWNER billing;
GRANT ALL PRIVILEGES ON DATABASE mikrotik_billing TO billing;
SQL
sudo -u postgres psql -d mikrotik_billing -c "GRANT ALL ON SCHEMA public TO billing;"

# Load schema
sudo -u postgres psql mikrotik_billing < database/init.sql
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
