'use strict';

const winston = require('winston');

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level: lvl, message, stack }) => {
      const base = `${timestamp} [${lvl}] ${message}`;
      return stack ? `${base}\n${stack}` : base;
    })
  ),
  transports: [new winston.transports.Console()],
});

function child(meta) {
  return logger.child(meta);
}

module.exports = {
  info: (message, meta) => logger.info(message, meta),
  warn: (message, meta) => logger.warn(message, meta),
  error: (message, meta) => logger.error(message, meta),
  debug: (message, meta) => logger.debug(message, meta),
  child,
  raw: logger,
};
