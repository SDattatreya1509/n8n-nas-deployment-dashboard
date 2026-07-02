'use strict';
// Supports two modes:
// 1. Resend HTTP API  — SMTP_USER=resend, SMTP_PASS=re_...
// 2. Standard SMTP    — SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (Gmail, Outlook, etc.)

const nodemailer = require('nodemailer');
const https      = require('https');

// ── Helpers ───────────────────────────────────────────────────────────────────

function isResend() {
  return process.env.SMTP_USER === 'resend' && process.env.SMTP_PASS;
}

function isSmtp() {
  return process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    && process.env.SMTP_USER !== 'resend';
}

function isEmailConfigured() {
  return isResend() || isSmtp();
}

function getTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── Resend HTTP helpers ───────────────────────────────────────────────────────

function httpsPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: parsed.hostname,
      path:     parsed.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path:     parsed.pathname,
      method:   'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Email HTML template ───────────────────────────────────────────────────────

function buildHtml(toUser, verificationUrl) {
  return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f1f5f9;padding:2rem;margin:0">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:2.5rem;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="text-align:center;margin-bottom:1.5rem">
    <div style="font-size:2rem">⚡</div>
    <h1 style="font-size:1.375rem;font-weight:700;color:#0f172a;margin:.5rem 0 0">Verify your email</h1>
  </div>
  <p style="color:#475569;font-size:.9375rem;line-height:1.6;margin:0 0 1.5rem">
    Hi <strong>${toUser.name}</strong>,<br><br>
    Welcome to n8n Pipeline Dashboard! Click the button below to verify your email address and activate your account.
  </p>
  <div style="text-align:center;margin:1.75rem 0">
    <a href="${verificationUrl}"
       style="display:inline-block;background:linear-gradient(135deg,#0d9488,#3b82f6);color:#fff;text-decoration:none;padding:.875rem 2.25rem;border-radius:8px;font-weight:600;font-size:.9375rem">
      Verify Email Address
    </a>
  </div>
  <p style="color:#94a3b8;font-size:.8125rem;line-height:1.6;margin:0">
    This link expires in <strong>24 hours</strong>. If you didn't create this account, ignore this email.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0">
  <p style="color:#cbd5e1;font-size:.75rem;margin:0;word-break:break-all">Or copy: ${verificationUrl}</p>
</div>
</body></html>`;
}

// ── testSmtp ──────────────────────────────────────────────────────────────────

async function testSmtp() {
  if (isResend()) {
    const key = process.env.SMTP_PASS;
    try {
      const res = await httpsGet('https://api.resend.com/domains', { Authorization: `Bearer ${key}` });
      if (res.status === 200) return { ok: true, service: 'Resend HTTP API' };
      return { ok: false, error: res.body?.message ?? `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  if (isSmtp()) {
    try {
      const transporter = getTransporter();
      await transporter.verify();
      return { ok: true, service: `SMTP (${process.env.SMTP_HOST})` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return { ok: false, error: 'No email service configured' };
}

// ── sendVerificationEmail ─────────────────────────────────────────────────────

async function sendVerificationEmail(toUser, verificationUrl) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const html = buildHtml(toUser, verificationUrl);
  const subject = 'Verify your account — n8n Pipeline Dashboard';

  // ── Mode 1: Resend HTTP API ──
  if (isResend()) {
    const key = process.env.SMTP_PASS;
    try {
      const res = await httpsPost(
        'https://api.resend.com/emails',
        { from, to: [toUser.email], subject, html },
        { Authorization: `Bearer ${key}` },
      );
      if (res.status !== 200 && res.status !== 201) {
        console.error(`[Email] Resend error ${res.status}: ${res.body?.message ?? JSON.stringify(res.body)}`);
        return false;
      }
      console.log(`[Email] Verification sent via Resend → ${toUser.email}`);
      return true;
    } catch (err) {
      console.error(`[Email] Resend send failed: ${err.message}`);
      return false;
    }
  }

  // ── Mode 2: Standard SMTP (Gmail, Outlook, etc.) ──
  if (isSmtp()) {
    try {
      const transporter = getTransporter();
      await transporter.sendMail({ from, to: toUser.email, subject, html });
      console.log(`[Email] Verification sent via SMTP → ${toUser.email}`);
      return true;
    } catch (err) {
      console.error(`[Email] SMTP send failed: ${err.message}`);
      return false;
    }
  }

  console.warn('[Email] No email service configured — set SMTP_HOST+SMTP_USER+SMTP_PASS or SMTP_USER=resend+SMTP_PASS=re_...');
  return false;
}

module.exports = { sendVerificationEmail, testSmtp, isEmailConfigured };
