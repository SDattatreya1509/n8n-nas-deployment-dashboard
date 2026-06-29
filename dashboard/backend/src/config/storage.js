'use strict';
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Base data directory ───────────────────────────────────────────────────────
// NAS:    /n8n_data/Website-Generator/dashboard-data   (set DATA_DIR)
// Docker: /app/data                                     (path.join fallback)
// Render: <repo-root>/server/data/                      (path.join fallback)
//
// __dirname here = server/src/config/
// path.join(__dirname, '..', '..', 'data') = server/data/   (Render / local dev)
// In Docker container = /app/src/config/../../data  = /app/data ✓
const DATA_DIR = process.env.DATA_DIR
  || path.join(__dirname, '..', '..', 'data');

// ── Generated project files ───────────────────────────────────────────────────
// NAS:    /n8n_data/Website-Generator/projects          (set PROJECTS_DIR)
// Docker: /projects                                     (Dockerfile creates this dir)
// Render: <repo-root>/projects/                         (path.join fallback)
//
// path.join(__dirname, '..', '..', '..', 'projects') = <repo-root>/projects
// In Docker container = /app/src/config/../../../projects = /projects ✓
const PROJECTS_DIR = process.env.PROJECTS_DIR
  || path.join(__dirname, '..', '..', '..', 'projects');

// ── Project type subdirectories ───────────────────────────────────────────────
const WEBSITES_DIR             = path.join(PROJECTS_DIR, 'Websites');
const WEBSITES_MOBILE_APPS_DIR = path.join(PROJECTS_DIR, 'Websites&MobileApps');

function getProjectTypeDir(projectType) {
  return projectType === 'website-mobile-app' ? WEBSITES_MOBILE_APPS_DIR : WEBSITES_DIR;
}

// ── Database file ─────────────────────────────────────────────────────────────
// Priority: DB_PATH env var → DATA_DIR-derived → Render repo-root fallback
// Render fallback keeps same path as the old db.js default (repo-root/db.json)
const DB_PATH = process.env.DB_PATH
  || (process.env.DATA_DIR
      ? path.join(process.env.DATA_DIR, 'db.json')
      : path.join(__dirname, '..', '..', '..', 'db.json')); // → <repo-root>/db.json on Render

// ── Users JSON file ───────────────────────────────────────────────────────────
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// ── Upload directory ──────────────────────────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR
  || path.join(DATA_DIR, 'uploads');

// ── Preview directory ─────────────────────────────────────────────────────────
const PREVIEW_DIR = process.env.PREVIEW_DIR
  || path.join(DATA_DIR, 'previews');

// ── WordPress output directory ────────────────────────────────────────────────
// Falls back to PROJECTS_DIR so existing WP pipeline files stay in the right place
const WORDPRESS_DIR = process.env.WORDPRESS_DIR || PROJECTS_DIR;

// ── Mobile app output directory ───────────────────────────────────────────────
const MOBILE_DIR = process.env.MOBILE_DIR || PROJECTS_DIR;

// ── Log directory ─────────────────────────────────────────────────────────────
const LOG_DIR = process.env.LOG_DIR
  || path.join(DATA_DIR, 'logs');

// ── Backup directory ──────────────────────────────────────────────────────────
const BACKUP_DIR = process.env.BACKUP_DIR
  || path.join(DATA_DIR, 'backups');

// ── Temp directory ────────────────────────────────────────────────────────────
// os.tmpdir() is the safe universal fallback — only override if you want NAS temp
const TEMP_DIR = process.env.TEMP_DIR || os.tmpdir();

// ── Cache directory ───────────────────────────────────────────────────────────
const CACHE_DIR = process.env.CACHE_DIR
  || path.join(DATA_DIR, 'cache');

// ── Export directory ──────────────────────────────────────────────────────────
const EXPORT_DIR = process.env.EXPORT_DIR
  || path.join(DATA_DIR, 'exports');

// ── n8n data directories (read-only from dashboard's perspective) ─────────────
const N8N_DATA_DIR        = process.env.N8N_DATA_DIR        || null;
const N8N_WORKFLOWS_DIR   = process.env.N8N_WORKFLOWS_DIR   || null;
const N8N_CREDENTIALS_DIR = process.env.N8N_CREDENTIALS_DIR || null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error(`[storage] Cannot create ${dirPath}: ${err.message}`);
    }
  }
}

function initStorage() {
  // Always ensure data and log dirs exist — they must be writable at startup
  [DATA_DIR, LOG_DIR].forEach(ensureDir);
  // PROJECTS_DIR may be a Docker volume — create only if it is absent
  if (!fs.existsSync(PROJECTS_DIR)) ensureDir(PROJECTS_DIR);
  // Ensure project type subdirectories exist
  [WEBSITES_DIR, WEBSITES_MOBILE_APPS_DIR].forEach(d => {
    if (!fs.existsSync(d)) ensureDir(d);
  });
  console.log('[storage] DATA_DIR     =', DATA_DIR);
  console.log('[storage] PROJECTS_DIR =', PROJECTS_DIR);
  console.log('[storage] DB_PATH      =', DB_PATH);
}

module.exports = {
  DATA_DIR,
  PROJECTS_DIR,
  WEBSITES_DIR,
  WEBSITES_MOBILE_APPS_DIR,
  UPLOADS_DIR,
  PREVIEW_DIR,
  WORDPRESS_DIR,
  MOBILE_DIR,
  LOG_DIR,
  BACKUP_DIR,
  TEMP_DIR,
  CACHE_DIR,
  EXPORT_DIR,
  N8N_DATA_DIR,
  N8N_WORKFLOWS_DIR,
  N8N_CREDENTIALS_DIR,
  DB_PATH,
  USERS_FILE,
  getProjectTypeDir,
  ensureDir,
  initStorage,
};
