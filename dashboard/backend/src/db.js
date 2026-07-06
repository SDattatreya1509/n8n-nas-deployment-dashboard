const fs   = require('fs');
const path = require('path');
const { DB_PATH } = require('./config/storage');

const DEFAULTS = { builds: [], wpBuilds: [], errors: [] };

let cache = null;
let flushTimer = null;

function load() {
  if (cache) return cache;
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      cache = { ...DEFAULTS, ...JSON.parse(raw) };
      console.log(`[DB] Loaded — builds: ${cache.builds.length}, wpBuilds: ${cache.wpBuilds.length}, errors: ${cache.errors.length}`);
    } else {
      cache = { ...DEFAULTS };
      console.log('[DB] No db.json found — starting fresh');
    }
  } catch (e) {
    console.error('[DB] Load failed:', e.message);
    cache = { ...DEFAULTS };
  }
  return cache;
}

function flushSync() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!cache) return;
  try {
    // Atomic write — avoids file truncation on kill mid-write
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch (e) {
    console.error('[DB] Write failed:', e.message);
  }
}

function flush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushSync, 300);
}

// Persist immediately on graceful shutdown so no build records are lost
process.once('SIGTERM', () => { flushSync(); process.exit(0); });
process.once('SIGINT',  () => { flushSync(); process.exit(0); });

function addBuild(build, type = 'web') {
  load();
  const key = type === 'wordpress' ? 'wpBuilds' : 'builds';
  cache[key].unshift(build);
  if (cache[key].length > 100) cache[key] = cache[key].slice(0, 100);
  flush();
}

function getBuilds(type = 'web') {
  load();
  return type === 'wordpress' ? (cache.wpBuilds || []) : (cache.builds || []);
}

function getAllBuilds() {
  load();
  return { builds: cache.builds || [], wpBuilds: cache.wpBuilds || [] };
}

function addError(error) {
  load();
  cache.errors.unshift({
    id:        `err-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...error,
  });
  if (cache.errors.length > 500) cache.errors = cache.errors.slice(0, 500);
  flush();
}

function getErrors(limit = 100) {
  load();
  return (cache.errors || []).slice(0, limit);
}

function clearErrors() {
  load();
  cache.errors = [];
  flush();
}

function getBuildsForUser(userId) {
  load();
  return {
    builds:   (cache.builds   || []).filter(b => b.userId === userId),
    wpBuilds: (cache.wpBuilds || []).filter(b => b.userId === userId),
  };
}

module.exports = { load, addBuild, getBuilds, getAllBuilds, getBuildsForUser, addError, getErrors, clearErrors };
