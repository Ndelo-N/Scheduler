'use strict';

const { validationResult } = require('express-validator');

/**
 * Run after express-validator chains on a route.
 * Responds 400 with a structured error list when validation fails.
 */
function validateRequest(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }
  return res.status(400).json({
    error: 'Validation Error',
    message: 'Request validation failed',
    details: result.array({ onlyFirstError: false }),
  });
}

module.exports = { validateRequest };
