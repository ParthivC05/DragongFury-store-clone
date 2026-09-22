# Deploy Dragon Fury (dragonfury.casino)

Same pattern as MyVePower: nginx serves the Vite `dist` folders, `/api` and Socket.IO proxy to the Node API on **port 8084**.

| Host | App |
|---|---|
| https://dragonfury.casino | User frontend |
| https://www.dragonfury.casino | Redirects to apex |
| https://admin.dragonfury.casino | Admin panel |
| `127.0.0.1:8084` | Backend (PM2 `dragonfury-api`) |

## GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions:

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_PRIVATE_KEY`
- `EC2_SSH_PORT` (optional, default `22`)

Push to `main` runs lint/build, then SSH deploys.

## First-time server setup

```bash
sudo mkdir -p /var/www
sudo git clone <THIS_REPO_URL> /var/www/dragonfury-store-clone
cd /var/www/dragonfury-store-clone

# Env files (never commit secrets)
cp backend/env.production.sample backend/.env
cp frontend/.env.production.sample frontend/.env
cp admin/.env.production.sample admin/.env
# Edit backend/.env: DB, JWT, Mailgun, payment keys. Keep PORT=8084.

cd backend && npm install --omit=dev && npm run migrate
cd ../frontend && npm install && npm run build
cd ../admin && npm install && npm run build

# Same as other stores: start PM2 once. Later deploys only `pm2 restart dragonfury-api`.
cd /var/www/dragonfury-store-clone/backend
pm2 start index.js --name dragonfury-api
pm2 save
pm2 startup

sudo cp frontend/nginx.dragonfury.casino.conf /etc/nginx/sites-available/dragonfury.casino
sudo ln -sf /etc/nginx/sites-available/dragonfury.casino /etc/nginx/sites-enabled/dragonfury.casino
sudo nginx -t

# DNS A records for dragonfury.casino, www, and admin must point here first.
sudo certbot --nginx -d dragonfury.casino -d www.dragonfury.casino
sudo certbot --nginx -d admin.dragonfury.casino
sudo systemctl reload nginx
```

Confirm API:

```bash
curl -sS http://127.0.0.1:8084/api/healthcheck
```

## Nginx

Production site file: `frontend/nginx.dragonfury.casino.conf`

- Upstream: `127.0.0.1:8084`
- SPA + hashed assets
- `/api` and `/socket.io/` → backend
- GitSlotPark root POSTs (`GetBalance`, `Deposit`, …)
- Deploy maintenance via `/var/www/dragonfury-store-clone/maintenance.flag`

After certbot, SSL paths should be:

- `/etc/letsencrypt/live/dragonfury.casino/`
- `/etc/letsencrypt/live/admin.dragonfury.casino/`

If www is not on the apex certificate, issue a combined cert:

```bash
sudo certbot --nginx -d dragonfury.casino -d www.dragonfury.casino --expand
```
