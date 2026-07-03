'use strict';
/**
 * httpsServer.js — build an HTTP or HTTPS server for the Express app.
 *
 * If a TLS key + cert are configured and exist on disk, serve HTTPS; otherwise
 * plain HTTP (localhost dev only). On the lab machine, point TLS_KEY / TLS_CERT
 * at the mkcert `scheduler.local` cert — see Brick7_TLS_Runbook.md.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');

function buildServer(app, { tlsKey, tlsCert } = {}) {
  if (tlsKey && tlsCert && fs.existsSync(tlsKey) && fs.existsSync(tlsCert)) {
    const server = https.createServer(
      { key: fs.readFileSync(tlsKey), cert: fs.readFileSync(tlsCert) },
      app
    );
    return { server, secure: true };
  }
  return { server: http.createServer(app), secure: false };
}

module.exports = { buildServer };
