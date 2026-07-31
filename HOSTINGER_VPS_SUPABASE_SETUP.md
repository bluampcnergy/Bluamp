# Self-Hosted Supabase & PostgreSQL Migration Guide (Hostinger VPS)

This guide provides step-by-step instructions for deploying a self-hosted Supabase / PostgreSQL instance on Hostinger VPS ($4–$6/month) with unlimited egress, automatic SSL, and database restoration.

---

## 📑 Table of Contents
1. [Prerequisites & Server Provisioning](#1-prerequisites--server-provisioning)
2. [SSH Connection & Package Installation](#2-ssh-connection--package-installation)
3. [Deploying Supabase with Docker Compose](#3-deploying-supabase-with-docker-compose)
4. [Restoring Database Schema & Data Dumps](#4-restoring-database-schema--data-dumps)
5. [Configuring Automatic HTTPS (SSL) with Caddy](#5-configuring-automatic-https-ssl-with-caddy)
6. [Updating Frontend Application Environment](#6-updating-frontend-application-environment)
7. [Automated Daily Backups Setup](#7-automated-daily-backups-setup)

---

## 1. Prerequisites & Server Provisioning

1. Log into your **Hostinger Dashboard** and navigate to **VPS Hosting**.
2. Select **KVM 1** or **KVM 2** (1–2 vCPU, 2–4 GB RAM, 50–100 GB NVMe SSD).
3. Under **OS Selection**, choose **Ubuntu 24.04 64bit**.
4. Note down your VPS **IP Address**, **SSH Port (22)**, and **root password**.

---

## 2. SSH Connection & Package Installation

Open your local terminal (PowerShell / Bash) and connect to your VPS:

```powershell
ssh root@<YOUR_VPS_IP>
```

Update packages and install Docker, Git, and utilities:

```bash
# Update OS packages
sudo apt update && sudo apt upgrade -y

# Install Docker & Compose
sudo apt install -y git curl docker.io docker-compose-v2 caddy
sudo systemctl enable --now docker
```

---

## 3. Deploying Supabase with Docker Compose

Run the official Supabase Docker orchestration stack:

```bash
# Clone official Supabase repository
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# Copy environment variable configuration template
cp .env.example .env

# Start all Supabase services (Database, Auth, Storage, Studio, PostgREST)
docker compose up -d
```

> 🌐 **Supabase Studio Access:**
> Open `http://<YOUR_VPS_IP>:8000` in your browser to access the self-hosted Supabase Studio Dashboard.

---

## 4. Restoring Database Schema & Data Dumps

### Step 4.1: Upload Dump Files from Local Machine to VPS

From your local project directory (`DC_Inventory_190526`), run PowerShell SCP commands:

```powershell
# Upload DDL Schema dump
scp supabase/schema.sql root@<YOUR_VPS_IP>:/root/supabase/docker/

# Upload Data dump
scp supabase/data.sql root@<YOUR_VPS_IP>:/root/supabase/docker/

# Upload Storage & Auth schemas
scp supabase/storage_schema.sql root@<YOUR_VPS_IP>:/root/supabase/docker/
scp supabase/auth_schema.sql root@<YOUR_VPS_IP>:/root/supabase/docker/
```

### Step 4.2: Execute Database Restoration on VPS

On your VPS SSH session:

```bash
cd /root/supabase/docker

# 1. Restore Database Tables, RLS Policies & Triggers
docker exec -i supabase-db psql -U postgres -d postgres < schema.sql

# 2. Restore Storage & Auth Schemas
docker exec -i supabase-db psql -U postgres -d postgres < storage_schema.sql
docker exec -i supabase-db psql -U postgres -d postgres < auth_schema.sql

# 3. Restore Complete Table Records
docker exec -i supabase-db psql -U postgres -d postgres < data.sql
```

---

## 5. Configuring Automatic HTTPS (SSL) with Caddy

To secure your API endpoints with a domain name and free SSL certificate:

1. Point your domain DNS **A Record** (e.g. `api.yourdomain.com`) to `<YOUR_VPS_IP>`.
2. Edit `/etc/caddy/Caddyfile`:

```caddy
api.yourdomain.com {
    reverse_proxy localhost:8000
}
```

3. Restart Caddy:

```bash
sudo systemctl restart caddy
```

*Caddy automatically issues and renews Let's Encrypt TLS certificates.*

---

## 6. Updating Frontend Application Environment

Update your frontend application environment settings (`.env` or `supabaseClient.ts`):

```env
VITE_SUPABASE_URL=https://api.yourdomain.com
VITE_SUPABASE_ANON_KEY=<YOUR_SELF_HOSTED_ANON_KEY>
```

---

## 7. Automated Daily Backups Setup

To run automated daily database backups directly on your Hostinger VPS at 11:00 PM:

Create backup script `/root/daily_backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/root/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p $BACKUP_DIR

docker exec supabase-db pg_dump -U postgres -d postgres --clean > "$BACKUP_DIR/db_backup_$TIMESTAMP.sql"

# Retain last 30 daily backups
find $BACKUP_DIR -type f -name "*.sql" -mtime +30 -delete
```

Make executable and add to crontab:

```bash
chmod +x /root/daily_backup.sh
(crontab -l 2>/dev/null; echo "0 23 * * * /root/daily_backup.sh") | crontab -
```

---

### Summary Checklist
- [x] Hostinger KVM VPS configured (Ubuntu 24.04)
- [x] Docker & Supabase stack running
- [x] Schema and data successfully restored
- [x] Domain & SSL configured via Caddy
- [x] Daily automated cron backups scheduled
