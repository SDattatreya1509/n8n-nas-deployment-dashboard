# n8n NAS Deployment Dashboard

Production-ready deployment package for the AI Pipeline Dashboard on a Company NAS.

This repository contains everything needed to self-host the dashboard on a Synology, QNAP, or any Linux-based NAS with Docker support.

---

## What is this?

The **AI Pipeline Dashboard** is a full-stack web application that connects to **n8n** workflows to generate websites and mobile app UIs. It receives build outputs from n8n via webhook, stores them on disk, and provides a browser-based UI for monitoring pipelines, exploring generated files, converting to WordPress themes, and deploying via GitHub or FTP.

This repository is the **NAS deployment package** — a standalone, production-ready version extracted from the development project. It runs entirely inside Docker and requires no external cloud services.

---

## Repository Structure

```
n8n-nas-deployment-dashboard/
│
├── dashboard/                  ← Docker build context (self-contained)
│   ├── backend/                ← Express + Socket.io API server
│   ├── frontend/               ← React + Vite dashboard
│   ├── Dockerfile              ← Multi-stage production build
│   ├── docker-compose.yml      ← NAS deployment configuration
│   ├── .env.example            ← All environment variable templates
│   ├── build.sh                ← Manual build script (non-Docker)
│   └── README.md               ← Deployment quick-start guide
│
├── dashboard-data/             ← Persistent data volume (users, db, logs)
├── projects/                   ← n8n writes generated files here
│   ├── Websites/               ← Website pipeline outputs
│   └── Websites&MobileApps/   ← Mobile app pipeline outputs
│
├── uploads/                    ← User file uploads
├── previews/                   ← Live preview files
├── wordpress/                  ← WordPress theme output
├── mobile-apps/                ← Mobile app output
├── backups/                    ← Scheduled backup archives
├── n8n/                        ← n8n data, workflows, credentials (read-only)
├── docker/                     ← Additional compose files
├── shared/                     ← Temp, cache, and export files
│
├── MIGRATION.md                ← Migration guide from previous versions
├── README.md                   ← This file
├── LICENSE                     ← MIT License
└── .gitignore
```

---

## Prerequisites

- Docker Engine and Docker Compose installed on the NAS
- Port `3001` available (or a Cloudflare Tunnel token)
- An n8n instance with your workflow deployed and webhook URLs ready

---

## Quick Start

### 1. Clone to NAS

```bash
cd /n8n_data
git clone https://github.com/SDattatreya1509/n8n-nas-deployment-dashboard.git Website-Generator
cd Website-Generator
```

### 2. Configure

```bash
cd dashboard
# Edit docker-compose.yml directly — all env vars are in the environment: block
nano docker-compose.yml
```

Minimum required values:

| Variable | How to generate |
|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` |
| `N8N_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `N8N_CHAT_URL` | Copy from your n8n Chat Trigger node |
| `FRONTEND_URL` | Your Cloudflare Tunnel HTTPS URL |

### 3. Deploy

```bash
docker-compose up -d
```

Docker builds the image on first run (~2 minutes). The dashboard is then available at `http://<NAS-IP>:3001`.

---

## Project Types

The dashboard supports two independent n8n pipelines:

| Pipeline | `projectType` | Storage path |
|---|---|---|
| Website Generator | `website` | `projects/Websites/{user}/{project}/` |
| Website & Mobile App Generator | `website-mobile-app` | `projects/Websites&MobileApps/{user}/{project}/` |

Files are routed automatically by `initStorage()` at container startup.

---

## Updating

```bash
cd /n8n_data/Website-Generator
git pull
cd dashboard
docker-compose up -d --build
```

Persistent data in `dashboard-data/`, `projects/`, and all other volume-mounted directories is never affected by updates.

---

## n8n Webhook URLs

After deploying, update these HTTP Request nodes in your n8n workflow:

| Node | URL |
|---|---|
| Chat response | `http://<NAS-IP>:3001/api/webhook/chat-response` |
| Build delivery | `http://<NAS-IP>:3001/api/webhook/n8n` |
| WordPress delivery | `http://<NAS-IP>:3001/api/webhook/wp` |

Add header: `x-webhook-secret: <your N8N_WEBHOOK_SECRET>`

---

## Security

- Generate real secrets for `JWT_SECRET` and `N8N_WEBHOOK_SECRET` before first start
- The `BOOTSTRAP_TOKEN` env var provides a one-time admin account creation escape hatch — set it once, create your admin account, then remove it
- Never commit `.env` files — only `.env.example` is tracked in this repository

---

## License

MIT — see [LICENSE](LICENSE)
