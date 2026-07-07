// Student Shift Scheduler PWA - Service Worker
// Version 1.1.1
//   F-07: STATIC_FILES now covers EVERY asset index.html loads (all core/data/
//         utils/views modules + the SheetJS vendor bundle + styles), so a cold
//         offline boot actually has its module graph cached.
//   F-08: static matching resolves each relative entry against the SW scope and
//         compares absolute URLs, instead of testing relative strings against an
//         absolute url.pathname (which never matched).
//   F-09: CSS/JS use stale-while-revalidate so auth/UI fixes are not stuck behind
//         cache-first forever; bump STATIC_CACHE when breaking offline layout.

const CACHE_NAME = 'shift-scheduler-v1.1.8';
const STATIC_CACHE = 'static-v1.1.8';
const DYNAMIC_CACHE = 'dynamic-v1.1.8';

// Files to cache immediately. Listed relative to the SW scope, matching the
// exact paths in index.html (load order preserved for readability).
const STATIC_FILES = [
  './',
  'index.html',
  'manifest.json',
  // styles
  'src/styles/main.css',
  'src/styles/components.css',
  'src/styles/responsive.css',
  // vendor (REQUIRED for payroll .xls parsing offline)
  'src/js/vendor/xlsx.full.min.js',
  // config + core
  'src/js/config.js',
  'src/js/core/utils.js',
  'src/js/core/logger.js',
  'src/js/core/contracts.js',
  'src/js/core/hoursLedger.js',
  'src/js/core/payrollParser.js',
  'src/js/core/identityMap.js',
  'src/js/core/workedHoursNormalizer.js',
  'src/js/core/availability.js',
  'src/js/core/assessment.js',
  'src/js/core/policyFlags.js',
  'src/js/core/effectiveRoster.js',
  'src/js/core/reconcile.js',
  // data
  'src/js/data/students.js',
  'src/js/data/csv.js',
  'src/js/data/formResponseImport.js',
  // remaining core
  'src/js/core/state.js',
  'src/js/core/schedulingEngine.js',
  'src/js/core/export.js',
  // utils
  'src/js/utils/storage.js',
  'src/js/utils/api.js',
  'src/js/core/accessControl.js',
  'src/js/core/authGate.js',
  'src/js/utils/notifications.js',
  // views
  'src/js/views/dashboard.js',
  'src/js/views/schedule.js',
  'src/js/views/swaps.js',
  'src/js/views/students.js',
  'src/js/views/analytics.js',
  'src/js/views/settings.js',
  // app bootstrap
  'src/js/app.js',
  // icons
  'assets/icons/icon-192x192.png',
  'assets/icons/icon-512x512.png'
];

// F-08: precompute absolute URLs for the static set, resolved against the SW's
// own location (so subpath hosting and ./-relative entries both line up with
// request.url at fetch time). Built once at SW evaluation.
const STATIC_URLS = new Set(STATIC_FILES.map((f) => new URL(f, self.location).href));
const INDEX_URL = new URL('index.html', self.location).href;

// Styles + scripts revalidate in the background so UI/auth CSS updates are not
// permanently pinned by cache-first (see auth-panel contrast fix in main.css).
const REVALIDATE_SUFFIXES = ['.css', '.js'];
function shouldRevalidate(request) {
  if (request.method !== 'GET') return false;
  const path = new URL(request.url).pathname;
  return REVALIDATE_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

// API endpoints to cache
const API_CACHE_PATTERNS = [
  /\/api\/schedules/,
  /\/api\/shifts/,
  /\/api\/students/,
  /\/api\/swaps/
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Static files cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Failed to cache static files', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests
  if (request.method === 'GET') {
    // CSS/JS — serve cache immediately, refresh from network in background
    if (shouldRevalidate(request) && STATIC_URLS.has(request.url)) {
      event.respondWith(staleWhileRevalidate(request));
    }
    // Other static files - cache first (F-08: compare absolute URLs)
    else if (STATIC_URLS.has(request.url)) {
      event.respondWith(cacheFirst(request));
    }
    // API requests - network first with cache fallback
    else if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
      event.respondWith(networkFirst(request));
    }
    // Other requests - network first
    else {
      event.respondWith(networkFirst(request));
    }
  }
  // POST/PUT/DELETE requests - network only
  else {
    event.respondWith(networkOnly(request));
  }
});

// Cache first strategy
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Cache first strategy failed:', error);
    return new Response('Offline - content not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Stale-while-revalidate — return cached asset immediately, update cache async
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  const refresh = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      console.warn('Stale-while-revalidate fetch failed:', error);
      return null;
    });

  if (cachedResponse) {
    refresh.catch(() => {});
    return cachedResponse;
  }

  const networkResponse = await refresh;
  if (networkResponse) return networkResponse;

  return new Response('Offline - content not available', {
    status: 503,
    statusText: 'Service Unavailable'
  });
}

// Network first strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache:', error);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(INDEX_URL);
    }
    
    return new Response('Offline - content not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Network only strategy
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.error('Network only strategy failed:', error);
    return new Response('Offline - action not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered', event.tag);
  
  if (event.tag === 'schedule-update') {
    event.waitUntil(syncScheduleUpdates());
  } else if (event.tag === 'swap-request') {
    event.waitUntil(syncSwapRequests());
  }
});

// Sync schedule updates when back online
async function syncScheduleUpdates() {
  try {
    const pendingUpdates = await getPendingUpdates();
    for (const update of pendingUpdates) {
      await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update)
      });
    }
    console.log('Schedule updates synced');
  } catch (error) {
    console.error('Failed to sync schedule updates:', error);
  }
}

// Sync swap requests when back online
async function syncSwapRequests() {
  try {
    const pendingRequests = await getPendingSwapRequests();
    for (const request of pendingRequests) {
      await fetch('/api/swaps/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
    }
    console.log('Swap requests synced');
  } catch (error) {
    console.error('Failed to sync swap requests:', error);
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const options = {
    body: 'You have a new notification',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Details',
        icon: '/assets/icons/action-view.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/assets/icons/action-close.png'
      }
    ]
  };

  if (event.data) {
    const data = event.data.json();
    options.body = data.body || options.body;
    options.title = data.title || 'Shift Scheduler';
    options.data = { ...options.data, ...data };
  }

  event.waitUntil(
    self.registration.showNotification('Shift Scheduler', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/?view=swaps')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Helper functions for background sync
async function getPendingUpdates() {
  try {
    // Read from IndexedDB for offline schedule updates
    const db = await openIndexedDB();
    const transaction = db.transaction(['pendingUpdates'], 'readonly');
    const store = transaction.objectStore('pendingUpdates');
    const updates = await store.getAll();
    return updates;
  } catch (error) {
    console.error('Failed to get pending updates:', error);
    return [];
  }
}

async function getPendingSwapRequests() {
  try {
    // Read from IndexedDB for offline swap requests
    const db = await openIndexedDB();
    const transaction = db.transaction(['pendingSwaps'], 'readonly');
    const store = transaction.objectStore('pendingSwaps');
    const requests = await store.getAll();
    return requests;
  } catch (error) {
    console.error('Failed to get pending swap requests:', error);
    return [];
  }
}

// IndexedDB helper functions
async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ShiftSchedulerDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object stores for offline data
      if (!db.objectStoreNames.contains('pendingUpdates')) {
        db.createObjectStore('pendingUpdates', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('pendingSwaps')) {
        db.createObjectStore('pendingSwaps', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('offlineData')) {
        db.createObjectStore('offlineData', { keyPath: 'key' });
      }
    };
  });
}

// Message handling from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

console.log('Service Worker: Loaded successfully');
