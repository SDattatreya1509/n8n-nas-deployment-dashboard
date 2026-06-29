const express = require('express');
const router = express.Router();
const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { TEMP_DIR } = require('../config/storage');

// POST /api/deploy/ftp — deploy WordPress theme ZIP via FTP to EasyWP
router.post('/ftp', requireAuth, async (req, res) => {
  const { zipBase64, themeName } = req.body;
  const io = req.app.get('io');
  const updateState = req.app.get('updateState');

  if (!zipBase64 || !themeName) {
    return res.status(400).json({ error: 'zipBase64 and themeName are required' });
  }

  if (!process.env.FTP_HOST || !process.env.FTP_USER || !process.env.FTP_PASS) {
    return res.status(503).json({ error: 'FTP credentials not configured. Set FTP_HOST, FTP_USER, FTP_PASS in environment.' });
  }

  const client = new ftp.Client();
  client.ftp.verbose = false;

  const emit = (msg, type = 'log') => io.emit('deploy:log', { msg, type, ts: new Date().toISOString() });

  const safeName = path.basename(themeName).replace(/[^a-z0-9_-]/gi, '_');
  const tmpPath  = path.join(TEMP_DIR, `${safeName}-${Date.now()}.zip`);

  try {
    updateState({ pipeline: { deploy: 'running' } });
    io.emit('pipeline:step', { step: 'deploy', status: 'running' });

    fs.writeFileSync(tmpPath, Buffer.from(zipBase64, 'base64'));
    emit(`Theme ZIP prepared (${Math.round(fs.statSync(tmpPath).size / 1024)} KB)`);

    emit('Connecting to FTP...');
    await client.access({
      host:     process.env.FTP_HOST,
      user:     process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure:   false,
    });
    emit('Connected to FTP');

    const remotePath = (process.env.FTP_REMOTE_PATH || '/wp-content/themes') + `/${safeName}`;
    emit(`Ensuring remote path: ${remotePath}`);
    await client.ensureDir(remotePath);

    emit('Uploading ZIP...');
    await client.uploadFrom(tmpPath, `${remotePath}/${safeName}.zip`);

    emit('Upload complete! Activate the theme in WordPress Admin → Appearance → Themes');

    updateState({ pipeline: { deploy: 'done' } });
    io.emit('pipeline:step', { step: 'deploy', status: 'done' });

    res.json({ success: true, remotePath });

  } catch (err) {
    emit(`Deploy failed: ${err.message}`, 'error');
    updateState({ pipeline: { deploy: 'error' } });
    io.emit('pipeline:step', { step: 'deploy', status: 'error', error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    client.close();
    try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
  }
});

// POST /api/deploy/github-actions — trigger via GitHub Actions workflow_dispatch
router.post('/github-actions', requireAuth, async (req, res) => {
  const { workflowId, inputs } = req.body;
  const { Octokit } = require('@octokit/rest');
  const io = req.app.get('io');
  const updateState = req.app.get('updateState');

  try {
    updateState({ pipeline: { deploy: 'running' } });
    io.emit('pipeline:step', { step: 'deploy', status: 'running' });

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    await octokit.actions.createWorkflowDispatch({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      workflow_id: workflowId || 'deploy.yml',
      ref: process.env.GITHUB_BRANCH || 'main',
      inputs: inputs || {},
    });

    io.emit('deploy:log', { msg: '🚀 GitHub Actions workflow triggered', type: 'log', ts: new Date().toISOString() });
    updateState({ pipeline: { deploy: 'done' } });
    io.emit('pipeline:step', { step: 'deploy', status: 'done' });

    res.json({ success: true });
  } catch (err) {
    updateState({ pipeline: { deploy: 'error' } });
    io.emit('pipeline:step', { step: 'deploy', status: 'error', error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
