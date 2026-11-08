# ST CONNECTION – VPS Deployment & Hosting Guide

Yeh complete guide aapko batayegi ki **ST CONNECTION** ko kisi bhi Linux VPS (Ubuntu 22.04 / 24.04 LTS, Debian, DigitalOcean, Hetzner, AWS EC2, Hostinger) par kaise deploy aur 24/7 run karna hai bina kisi Cloudflare dependency ke.

---

## 🌟 Overview

* **Backend & Server**: Node.js v22 (Express + WebSocket Server on port 3000)
* **Frontend**: React + Vite (Production build in `./dist`)
* **Storage**: Local Disk Storage (`./data/uploads`) – Saare photos, videos aur voice notes VPS disk par store hote hain.
* **Database**: Local Fast Database (`./data/database.json` & `./schema.sql`) – Users, chats, messages, channels aur admin logs.
* **WebRTC Calling**: Peer-to-Peer encrypted voice & video calling.

---

## 🚀 Step 1: VPS Initial Setup & Node.js 22 Install

Apne VPS par SSH se login karein aur run karein:

```bash
# System packages update karein
sudo apt update && sudo apt upgrade -y

# Git, curl aur build tools install karein
sudo apt install -y git curl ufw

# Node.js 22 LTS install karein
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify karein (v22 dikhayega)
node -v
npm -v
```

---

## 📦 Step 2: Repository Clone & Build

```bash
# Repo clone karein
git clone https://github.com/devil128l/ST_Connection.git
cd ST_Connection

# Dependencies install karein
npm install

# Production frontend build banayein
npm run build

# Environment file create karein
cp .env.example .env
```

*(Optional: `nano .env` karke `GEMINI_API_KEY=your_key` add kar sakte hain Google AI Assistant ke liye).*

---

## ⚙️ Step 3: Run with PM2 (24/7 Background Process)

PM2 ensure karega ki application server reboot hone par ya error aane par automatically restart ho jaye:

```bash
# PM2 install karein
sudo npm install -g pm2

# App ko PM2 ke sath start karein
pm2 start "npm start" --name "stconnection"

# System boot par auto-restart enable karein
pm2 startup
# (Terminal me jo command copy karne ko kahe, use run karein)
pm2 save
```

Status check karne ke liye:
```bash
pm2 status
pm2 logs stconnection
```

---

## 🌐 Step 4: Domain & Nginx Reverse Proxy Setup (with Free SSL)

Domain ko connect karne aur WebSockets support karne ke liye:

1. **Nginx aur Certbot install karein:**
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. **Nginx configuration create karein:**
   ```bash
   sudo nano /etc/nginx/sites-available/stconnection
   ```
   Niche diya gaya config paste karein (apne domain se replace karein):
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com admin.yourdomain.com;

       client_max_body_size 50M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. **Enable karein aur restart karein:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/stconnection /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl restart nginx
   ```

4. **Free HTTPS (SSL Certificate) Lagayein:**
   ```bash
   sudo certbot --nginx -d yourdomain.com -d admin.yourdomain.com
   ```

---

## 🐳 Alternative: Run with Docker Compose

Agar aap Docker use karna chahte hain:

```bash
# Docker aur Docker Compose install karein
sudo apt install -y docker.io docker-compose-v2

# Start karein
docker compose up -d --build
```

---

## 🦖 Pterodactyl Panel Deployment & Database Setup

Agar aap **Pterodactyl Panel** par apna server run kar rahe hain:

1. **Pterodactyl me Database Create Karein:**
   - Apne Pterodactyl server me jayein.
   - Left menu me **Databases** tab par click karein.
   - **New Database** par click karein aur naam daalein (e.g. `stconnection`).
   - Pterodactyl aapko credentials dega:
     - **Endpoint / Host**: (e.g. `127.0.0.1` ya node IP)
     - **Port**: `3306`
     - **Database Name**: (e.g. `s1_stconnection`)
     - **Username**: (e.g. `u1_xxxx`)
     - **Password**: (e.g. `xxxxxxxxxxxx`)

2. **Environment Variables Set Karein (Startup Tab ya `.env`):**
   - Pterodactyl ke **Startup** tab me ya server file manager me `.env` me yeh variables add karein:
   ```env
   PORT=3000
   NODE_ENV=production
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_NAME=s1_stconnection
   DB_USER=u1_xxxx
   DB_PASSWORD=your_database_password
   ```

3. **Start Karein:**
   - Pterodactyl console me `npm run build` and `npm start` (ya node egg startup command: `tsx server.ts` ya `node server.ts`).
   - Server console me dikhega: `[Pterodactyl Database] ✅ Successfully connected to Pterodactyl MySQL database!`.
   - Saara data automatically aapke Pterodactyl MySQL database me persist hoga!

---

## 🔑 Default Login & Security Credentials

* **Main Site Entry**: Koi gate password nahi chahiye! Visitors direct Login / Register kar sakte hain.
* **Super Admin Login**:
  * Username / Email: `superadmin` ya `admin@stconnection.bond`
  * Master Password: `AdminPass782!`
* **Admin Portal URL**: `https://yourdomain.com/?portal=admin` ya `https://admin.yourdomain.com`
