# Migration Guide

This document covers migrating between versions of the NAS Deployment Dashboard.

---

## Phase 2.2 — Project Type Architecture (Current)

**Released:** 2026-06-26

### What changed

The `projects/` directory now has two typed subdirectories:

```
projects/
├── Websites/               ← projectType = 'website'
└── Websites&MobileApps/   ← projectType = 'website-mobile-app'
```

Previously all generated project files were stored flat in `projects/{user}/{project}/`.

### Migration steps

No manual migration is required. `initStorage()` creates `Websites/` and `Websites&MobileApps/` at container startup if they do not exist.

**Old projects** (in `projects/{user}/{project}/` or `projects/{project}/`) continue to be discovered and served by the dashboard via legacy path fallback. They are treated as `projectType = 'website'` for backward compatibility.

New builds are automatically routed to the typed subdirectory matching their pipeline type.

### Checklist

- [ ] Pull the new version: `git pull && docker-compose up -d --build`
- [ ] Verify `projects/Websites/` and `projects/Websites&MobileApps/` exist on disk (created automatically)
- [ ] Confirm old projects still appear in the File Explorer — they should via legacy fallback
- [ ] In your n8n workflows, confirm the HTTP Request nodes send to `http://<NAS-IP>:3001/api/webhook/n8n` (website pipeline) and `http://<NAS-IP>:3001/api/webhook/n8n` with `projectType: 'website-mobile-app'` in the payload body (mobile pipeline)

---

## Phase 2.1 — NAS Deployment Package Initial Population

**Released:** 2026-06-26

### What changed

Initial population of the NAS deployment package with the full application source. Established the directory layout for Docker volume mounts.

### Migration steps

Fresh deployment — no prior version to migrate from.

---

## Phase 2 — Centralized Storage Module

**Released:** 2026-06-26

### What changed

All persistent path configuration moved into `backend/src/config/storage.js`. All paths are now driven by environment variables with sensible fallbacks. No path is hardcoded in route files.

### Migration steps

If upgrading from a pre-Phase-2 installation:

1. Set environment variables in `docker-compose.yml` for all storage paths (already pre-configured in the shipped `docker-compose.yml`).
2. Rebuild: `docker-compose up -d --build`

---

## General Update Procedure

```bash
# On the NAS
cd /n8n_data/Website-Generator

# Pull latest
git pull

# Rebuild and restart container
cd dashboard
docker-compose up -d --build

# Verify
docker logs ai-dashboard --tail=30
```

Your persistent data (`dashboard-data/`, `projects/`, etc.) is stored in Docker volumes outside the container and is never modified by `git pull` or `docker-compose up --build`.

---

## Rollback

```bash
cd /n8n_data/Website-Generator/dashboard

# Stop container
docker-compose down

# Check out previous commit
git log --oneline -10
git checkout <previous-commit-hash>

# Restart
docker-compose up -d --build
```

To return to latest: `git checkout main && docker-compose up -d --build`
