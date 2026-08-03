# Hostinger VPS & Self-Hosted Supabase Setup & Maintenance Guide

Comprehensive documentation for the migration, deployment, domain routing, and maintenance of the self-hosted Supabase infrastructure for **Datlion Cnergy / DC Inventory**.

---

## 📋 Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Server Specifications & Credentials](#2-server-specifications--credentials)
3. [Step 1: Initial VPS Provisioning & OS Setup](#step-1-initial-vps-provisioning--os-setup)
4. [Step 2: Docker & Docker Compose Installation](#step-2-docker--docker-compose-installation)
5. [Step 3: Self-Hosted Supabase Stack Deployment](#step-3-self-hosted-supabase-stack-deployment)
6. [Step 4: Caddy Reverse Proxy & HTTPS Domain Setup](#step-4-caddy-reverse-proxy--https-domain-setup)
7. [Step 5: Database Schema & Data Restoration](#step-5-database-schema--data-restoration)
8. [Step 6: Automated Daily Backups (Cron & Scripts)](#step-6-automated-daily-backups-cron--scripts)
9. [Step 7: Vercel Application Integration](#step-7-vercel-application-integration)
10. [Step 8: Operations & Troubleshooting Playbook](#step-8-operations--troubleshooting-playbook)

---

## 1. Architecture Overview

To overcome Supabase Cloud free-tier egress constraints and gain unlimited bandwidth, the application database and authentication infrastructure was migrated to a dedicated **Hostinger Ubuntu 24.04 VPS**.

```
                           ┌─────────────────────────┐
                           │   Hostinger DNS Zone    │
                           │     (cnergy.co.in)      │
                           └────────────┬────────────┘
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           ▼                                                         ▼
┌───────────────────────┐                               ┌────────────────────────┐
│ inventory.cnergy.co.in│                               │  supabase.cnergy.co.in │
│   (Vercel Frontend)   │                               │ vps.cnergy.co.in (Rdr) │
└──────────┬────────────┘                               └───────────┬────────────┘
           │                                                        │
           │  HTTPS REST API Requests                               │  Port 80/443
           └────────────────────────────┬───────────────────────────┘
                                        ▼
                         ┌────────────────────────────┐
                         │  Hostinger VPS Server      │
                         │      (200.141.9.217)       │
                         │                            │
                         │  ┌──────────────────────┐  │
                         │  │  Caddy Reverse Proxy │  │
                         │  └──────────┬───────────┘  │
                         │             │ Port 8000    │
                         │  ┌──────────▼───────────┐  │
                         │  │ Supabase Docker Stack│  │
                         │  │ - Studio UI          │  │
                         │  │ - PostgREST API      │  │
                         │  │ - Auth (GoTrue)      │  │
                         │  │ - PostgreSQL 15 DB   │  │
                         │  └──────────────────────┘  │
                         └────────────────────────────┘
```

---

## 2. Server Specifications & Credentials

*All sensitive keys and tokens are central in `vps.env` in the repository root.*

- **VPS Provider:** Hostinger (KVM VPS)
- **IP Address:** `200.141.9.217`
- **OS:** Ubuntu 24.04 LTS (Noble Numbat)
- **SSH Command:** `ssh root@200.141.9.217`
- **SSH Password:** `Tatwamasi@01`
- **Database Connection:** `postgresql://postgres:your-super-secret-and-long-postgres-password@200.141.9.217:5432/postgres`

### Subdomain Routing Map

| Domain / Subdomain | Destination | Function |
|---|---|---|
| **`https://inventory.cnergy.co.in`** | Vercel (`76.76.21.21`) | Production React Web App |
| **`https://supabase.cnergy.co.in`** | VPS (`200.141.9.217:8000`) | Supabase Studio & PostgREST API |
| **`https://vps.cnergy.co.in`** | `https://hpanel.hostinger.com` | Hostinger VPS Management Portal Redirect |

---

## Step 1: Initial VPS Provisioning & OS Setup

1. **SSH into the Server:**
   ```bash
   ssh root@200.141.9.217
   ```

2. **System Update & Core Utilities:**
   ```bash
   apt update && apt upgrade -y
   apt install -y curl git ufw jq ca-certificates gnupg postgresql-client
   ```

3. **Configure Firewall (UFW):**
   ```bash
   ufw allow 22/tcp
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw allow 5432/tcp
   ufw allow 8000/tcp
   ufw --force enable
   ```

---

## Step 2: Docker & Docker Compose Installation

1. **Add Docker's Official GPG Key & Repository:**
   ```bash
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   chmod a+r /etc/apt/keyrings/docker.gpg

   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
   ```

2. **Install Docker Engine & Compose Plugin:**
   ```bash
   apt update
   apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   systemctl enable --now docker
   ```

3. **Verify Installation:**
   ```bash
   docker --version
   docker compose version
   ```

---

## Step 3: Self-Hosted Supabase Stack Deployment

1. **Clone Official Supabase Docker Repository:**
   ```bash
   mkdir -p /root/supabase
   cd /root/supabase
   git clone --depth 1 https://github.com/supabase/supabase.git docker-src
   cp -r docker-src/docker /root/supabase/docker
   cd /root/supabase/docker
   ```

2. **Configure Environment Variables (`.env`):**
   Copy `.env.example` to `.env` and set essential parameters:
   ```bash
   cp .env.example .env
   ```
   Key environment variables configured in `/root/supabase/docker/.env`:
   - `POSTGRES_PASSWORD=your-super-secret-and-long-postgres-password`
   - `JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long`
   - `SITE_URL=https://inventory.cnergy.co.in`
   - `ADDITIONAL_REDIRECT_URLS=https://inventory.cnergy.co.in`
   - `API_EXTERNAL_URL=https://supabase.cnergy.co.in`
   - `SUPABASE_PUBLIC_URL=https://supabase.cnergy.co.in`

3. **Launch Docker Stack:**
   ```bash
   docker compose up -d
   ```

4. **Verify Containers:**
   ```bash
   docker compose ps
   ```

---

## Step 4: Caddy Reverse Proxy & HTTPS Domain Setup

Caddy manages automatic Let's Encrypt TLS/SSL certificates and reverse proxying.

1. **Install Caddy:**
   ```bash
   apt install -y caddy
   useradd -r -d /var/lib/caddy -s /sbin/nologin caddy 2>/dev/null || true
   mkdir -p /var/lib/caddy /etc/caddy
   chown -R caddy:caddy /var/lib/caddy
   ```

2. **Configure `/etc/caddy/Caddyfile`:**
   ```caddy
   supabase.cnergy.co.in {
       reverse_proxy localhost:8000
   }

   vps.cnergy.co.in {
       redir https://hpanel.hostinger.com permanent
   }

   http://supabase.cnergy.co.in, http://200.141.9.217 {
       reverse_proxy localhost:8000
   }
   ```

3. **Start & Enable Caddy Service:**
   ```bash
   systemctl enable --now caddy
   systemctl restart caddy
   ```

---

## Step 5: Database Schema & Data Restoration

Database restoration was executed using `scripts/remote_restore.py`, which connects via Paramiko SSH and restores the dump directly into PostgreSQL.

### Execution Workflow
1. **Clear Public Schema:**
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   GRANT ALL ON SCHEMA public TO postgres;
   GRANT ALL ON SCHEMA public TO public;
   ```
2. **Import DDL Schema:**
   ```bash
   docker exec -i supabase-db psql -U postgres -d postgres < /root/supabase/docker/schema.sql
   ```
3. **Import 44.7 MB Data Dump:**
   ```bash
   docker exec -i supabase-db psql -U postgres -d postgres < /root/supabase/docker/data.sql
   ```

### Restored Row Counts
- `test_results`: 5,649 records
- `logs`: 2,263 records
- `received_goods`: 268 records
- `finished_goods`: 185 records
- `recipes`: 179 records
- `invoices`: 123 records
- `company_profiles`: 70 records
- `price_list`: 57 records
- `storage_items`: 54 records
- `expenses`: 29 records
- `employee_tasks`: 22 records

---

## Step 6: Automated Daily Backups (Cron & Scripts)

### 1. Native VPS Local Cron Backup
Run `crontab -e` on the VPS to add a daily backup job at 2:00 AM UTC:
```bash
0 2 * * * docker exec -t supabase-db pg_dumpall -U postgres | gzip > /root/backups/db_backup_$(date +\%Y\%m\%d).sql.gz && find /root/backups/ -type f -name "*.sql.gz" -mtime +30 -delete
```

### 2. GitHub Actions Daily Backup Workflow
File: `.github/workflows/daily_supabase_backup.yml`
Runs automatically every day at 11:00 PM IST (17:30 UTC), generating artifact backups stored in GitHub Actions.

---

## Step 7: Vercel Application Integration

### Environment Variables Configured in Vercel Dashboard
In **Vercel** -> **Project Settings** -> **Environment Variables**:

```env
VITE_SUPABASE_URL=https://supabase.cnergy.co.in
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
SUPABASE_URL=https://supabase.cnergy.co.in
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
```

---

## Step 8: Operations & Troubleshooting Playbook

### Useful VPS Commands

- **Check Supabase Containers:**
  ```bash
  cd /root/supabase/docker && docker compose ps
  ```
- **Restart Supabase Stack:**
  ```bash
  cd /root/supabase/docker && docker compose restart
  ```
- **View Database Live Logs:**
  ```bash
  docker logs --tail 50 -f supabase-rest
  ```
- **Check Caddy Status & Logs:**
  ```bash
  systemctl status caddy
  journalctl -u caddy -n 50 --no-pager
  ```
- **Manual Database Backup on VPS:**
  ```bash
  docker exec -t supabase-db pg_dump -U postgres -d postgres > backup_manual.sql
  ```

---
*Documentation generated for Datlion Cnergy Hostinger VPS Infrastructure.*
