# Backend Services for MikroTik Billing

This directory contains all microservices for the billing system.

## Services
- gateway: API Gateway (port 3000)
- services/user: User Management Service (port 3001)
- services/billing: Billing Service (port 3002)
- services/reseller: Reseller Service (port 3003)
- services/location: Location Service (port 3004)
- services/report: Report Service (port 3005)

## Running
```
docker-compose up -d
```
