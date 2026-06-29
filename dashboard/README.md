# AI Pipeline Dashboard — NAS Deployment Guide

This folder becomes `/n8n_data/Website-Generator/dashboard/` on the NAS after you
run `git clone`.  The sibling folders (`dashboard-data/`, `projects/`, etc.) are
the persistent storage volumes that Docker mounts into the container.

---

## Prerequisites

- Docker and Docker Compose installed on the NAS (Synology Container Manager, QNAP
  Container Station, or plain Docker Engine on any Linux NAS).
- Port 3001 available, or a Cloudflare Tunnel token.
- The `/n8n_data/Website-Generator/` directory structure already created on the NAS
  (shipped as `nas-deployment/Website-Generator/` in this repository).

---

## One-time setup

### 1. Copy the deployment package to the NAS

Transfer the entire `nas-deployment/Website-Generator/` folder from your development
machine to the NAS.  On Synology the shared folder is typically
`/volume1/Workflows/` which appears as `/n8n_data/` inside Docker containers.

```bash
# Example using scp (run from your dev machine)
scp -r /path/to/repo/nas-deployment/Website-Generator admin@<NAS-IP>:/n8n_data/
```

The `dashboard/` folder inside the package is the self-contained deployment unit —
it already contains the full backend (`backend/`) and frontend (`frontend/`) source.
No `git clone` required.

### 2. Configure environment variables

```bash
cd /n8n_data/Website-Generator/dashboard
cp .env.example .env        # use as your override file, or edit docker-compose.yml directly
```

Edit `docker-compose.yml` and set at minimum:

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | YES | Long random string — `openssl rand -hex 32` |
| `N8N_WEBHOOK_SECRET` | Recommended | Shared with n8n HTTP Request nodes |
| `N8N_CHAT_URL` | YES | Your n8n Chat Trigger webhook URL |
| `FRONTEND_URL` | YES | Your Cloudflare Tunnel public URL |

### 3. Start the dashboard

```bash
cd /n8n_data/Website-Generator/dashboard
docker-compose up -d
```

Docker will build the image from source on first start (takes ~2 min).
The dashboard is then available at `http://<NAS-IP>:3001` or your Cloudflare Tunnel URL.

---

## Updating

To update to a newer version of the package:

1. Copy the new `nas-deployment/Website-Generator/dashboard/` over the existing one.
2. Rebuild and restart:

```bash
cd /n8n_data/Website-Generator/dashboard
docker-compose up -d --build
```

Your data in `/n8n_data/Website-Generator/dashboard-data/` is untouched by updates.

---

## n8n HTTP Request node URLs

After deployment update these three HTTP Request nodes in your n8n workflow to
point at the NAS instead of Render:

| Node | URL |
|---|---|
| HTTP Request (chat-response) | `http://<NAS-IP>:3001/api/webhook/chat-response` |
| HTTP Request (→ Dashboard) | `http://<NAS-IP>:3001/api/webhook/n8n` |
| WP HTTP Request (→ Dashboard) | `http://<NAS-IP>:3001/api/webhook/wp` |

Add `x-webhook-secret: <your_N8N_WEBHOOK_SECRET>` as a header to all three.

---

## Directory layout

```
/n8n_data/Website-Generator/
├── dashboard/              ← self-contained deployment unit (Docker build context)
│   ├── backend/            ←   Express API server source
│   ├── frontend/           ←   React dashboard source
│   ├── Dockerfile          ←   Multi-stage build
│   ├── docker-compose.yml  ←   NAS deployment config
│   └── .env.example        ←   Environment variable template
├── dashboard-data/         ← users.json, db.json, logs  (volume: /nas/data)
├── projects/               ← n8n writes here; dashboard reads here (volume: /nas/projects)
├── uploads/                ← user uploads                (volume: /nas/uploads)
├── previews/               ← live preview files          (volume: /nas/previews)
├── wordpress/              ← WordPress theme output      (volume: /nas/wordpress)
├── mobile-apps/            ← mobile app output           (volume: /nas/mobile)
├── backups/                ← backup archives
├── n8n/                    ← n8n data, workflows, credentials
├── docker/                 ← extra compose files
└── shared/                 ← temp, cache, exports
```
