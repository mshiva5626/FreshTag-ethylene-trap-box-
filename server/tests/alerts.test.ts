import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/init.js';
import { query, closePool } from '../src/config/database.js';

describe('FreshGuard Safety Alerts & Push Subscription API', () => {
  let app: any;
  let authToken = '';

  beforeAll(async () => {
    process.env.USE_PG_MEM = 'true';
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
    app = createApp();

    // Authenticate demo user
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@freshguard.app', password: 'password123' });
    authToken = res.body.token;

    // Seed test alerts
    await query(
      `INSERT INTO alerts (device_id, account_id, type, severity, title, message, resolved)
       VALUES
       ('SF-001', 'mshiva5626', 'DOOR_OPEN_PROLONGED', 'CRITICAL', 'Door Left Open', 'Safety beam interrupted for >2m', false),
       ('SF-001', 'mshiva5626', 'ETHYLENE_HIGH', 'WARNING', 'Ethylene Index Exceeded', 'Relative index peaked at 310', false),
       ('SF-001', 'mshiva5626', 'GRANULE_REPLACEMENT', 'INFO', 'Filter Replacement Due', 'Granule service interval reached', false)`
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it('1. GET /api/alerts should list all safety alerts for the authenticated account', async () => {
    const res = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('alerts');
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(res.body.alerts.length).toBeGreaterThanOrEqual(3);
    expect(res.body.unread_count).toBeGreaterThanOrEqual(3);
  });

  it('2. PATCH /api/alerts/:id/resolve should resolve an active alert', async () => {
    const listRes = await request(app)
      .get('/api/alerts?resolved=false')
      .set('Authorization', `Bearer ${authToken}`);

    const targetAlert = listRes.body.alerts[0];
    expect(targetAlert).toBeDefined();

    const resolveRes = await request(app)
      .patch(`/api/alerts/${targetAlert.id}/resolve`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.alert.resolved).toBe(true);
  });

  it('3. GET /api/alerts/vapid-key should return the public VAPID key', async () => {
    const res = await request(app).get('/api/alerts/vapid-key');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('publicKey');
    expect(typeof res.body.publicKey).toBe('string');
  });

  it('4. POST /api/alerts/subscribe should save a browser Web Push subscription', async () => {
    const dummySub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/demo-device-endpoint-token-2026',
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ic04YpqxTrUJaQwomMWivdW2FGIUtE5NiK4q07EPWHSGo=',
        auth: 'tBHItJI5svbpez7KI4CCXg==',
      },
    };

    const res = await request(app)
      .post('/api/alerts/subscribe')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ subscription: dummySub });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
