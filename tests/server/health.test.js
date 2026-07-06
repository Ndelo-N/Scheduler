'use strict';

const request = require('supertest');
const { createApp } = require('../../server/app');

function mockPool() {
  return {
    query: async (sql) => {
      if (String(sql).toLowerCase().includes('select 1')) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    activeMode: 'postgres',
  };
}

describe('Rev1 server — health + auth routes', () => {
  let app;

  beforeAll(() => {
    app = createApp(mockPool(), { pwaDir: null });
  });

  test('GET /api/health returns 200 ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('postgres');
  });

  test('GET /health returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /api/schedule requires auth (401 without cookie)', async () => {
    const res = await request(app).get('/api/schedule');
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login validates body', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('GET /api/unknown requires auth before 404 (401 without cookie)', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.status).toBe(401);
  });

  test('GET /api/feature-access requires auth (401 without cookie)', async () => {
    const res = await request(app).get('/api/feature-access');
    expect(res.status).toBe(401);
  });
});
