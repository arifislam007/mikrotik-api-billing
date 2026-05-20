# Macvlan Network Setup Script

## Prerequisites
1. Determine your host's network interface and subnet
2. Run the network creation command

## Find your host's IP and interface:
```bash
# Linux/macOS
ip addr show  # or ifconfig
# Look for your main interface (e.g., eth0, en0, wlan0)

# Get subnet (e.g., you have IP 192.168.1.100, subnet is 192.168.1.0/24)
```

## Create the macvlan network (replace values for your network):
```bash
# Example for subnet 192.168.1.0/24 with parent interface eth0
docker network create \
  --driver macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  --ip-range=192.168.1.10-192.168.1.200 \
  -o parent=eth0 \
  mikrotik-macvlan
```

## Start the services after network is created:
```bash
docker-compose up -d
```

## Access services:
- Frontend: http://192.168.1.13:80 (or port 5173 mapped if using ports section)
- Gateway: http://192.168.1.12:8080
- Backend: http://192.168.1.11:3000
- PostgreSQL: 192.168.1.10:5432