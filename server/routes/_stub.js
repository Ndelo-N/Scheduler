'use strict';

const express = require('express');

/**
 * Phase 11.0 — placeholder router until real handlers land (11.1+).
 * Returns 501 with the target phase id for every method/path on the mount.
 */
function createStubRouter(name, phase = '11.x') {
  const router = express.Router();

  router.all('*', (req, res) => {
    res.status(501).json({
      error: 'Not Implemented',
      message: `${name} API is not implemented yet (Phase ${phase})`,
      route: `${req.method} ${req.baseUrl}${req.path === '/' ? '' : req.path}`,
      phase,
    });
  });

  return router;
}

module.exports = { createStubRouter };
