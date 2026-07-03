// Browser-safe app configuration (no build step required)
window.APP_CONFIG = {
  apiBaseUrl: '/api',
  debug: false,
  // null = auto-detect auth server via /api/health; true/false to force
  requireAuth: null
};
