# MikroTik Billing System - Docker Compose Architecture

A full-stack application with Node.js backend, React frontend, API Gateway, and PostgreSQL database running in separate containers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   Frontend  │     │   Gateway   │     │   Backend   │   │
│  │   :80/5173 │────▶│   :8080     │────▶│   :3000     │   │
│  │   (React)   │     │ (Express)   │     │ (Express)   │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│                              │                             │
│                              ▼                             │
│                      ┌─────────────┐                       │
│                      │  Postgres   │                       │
│                      │   :5432     │                       │
│                      │ (database)  │                       │
│                      └─────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 5173 | React application (built with Vite) |
| Gateway | 8080 | API Gateway - proxies requests to backend |
| Backend | 3000 | Node.js REST API |
| PostgreSQL | 5432 | Database |

## Quick Start

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Environment Variables

Create a `.env` file with:

```env
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=mikrotik_billing
```

## API Endpoints

### Backend API (via Gateway on port 8080)

- `GET /api/health` - Health check
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `GET /api/billing` - List all billing records
- `GET /api/resellers` - List all resellers
- `GET /api/locations` - List all locations
- `GET /api/stats` - Get dashboard statistics

## Database Schema

- **users**: PPPoE user accounts
- **billing**: Payment records
- **resellers**: ISP reseller information
- **locations**: Service location data

## Development

```bash
# Run locally without Docker
cd backend && npm install && npm run dev
cd gateway && npm install && npm run dev
pnpm dev  # Run React frontend
```