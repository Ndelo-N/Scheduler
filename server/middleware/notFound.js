'use strict';

/**
 * JSON 404 for unmatched /api/* routes (must run before SPA static fallback).
 */
function apiNotFound(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { apiNotFound };
