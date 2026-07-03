'use strict';

const Logger = require('../utils/logger');

class ErrorHandler {
  static handle(err, req, res, _next) {
    const status = err.status || err.statusCode || 500;
    const isProd = process.env.NODE_ENV === 'production';

    if (status >= 500) {
      Logger.error(`${req.method} ${req.path}: ${err.message}`, { stack: err.stack });
    } else {
      Logger.warn(`${req.method} ${req.path}: ${err.message}`);
    }

    res.status(status).json({
      error: err.code || (status >= 500 ? 'Internal Server Error' : 'Request Error'),
      message: err.message || 'Something went wrong',
      ...(isProd || status < 500 ? {} : { stack: err.stack }),
    });
  }
}

module.exports = ErrorHandler;
