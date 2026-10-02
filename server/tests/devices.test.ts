import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/init.js';
import { closePool } from '../src/config/database.js';

describe('FreshGuard Device Management REST Endpoints', () => {
  let app: any;
  let authToken: string;

  beforeAll(async () => {
    process.env.USE_PG_MEM = 'true';
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
    app = createApp();

    // Log in as demo user to obtain token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@freshguard.app', password: 'password123' });

    authToken = loginRes.body.token;
  });

  afterAll(async () => {
    await closePool();
  });

  it('1. should reject requests without Authorization token', async () => {
    await request(app)
      .get('/api/devices')
      .expect(401);
  });

  it('2. should list all devices for the authenticated account', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.devices).toBeInstanceOf(Array);
    expect(res.body.devices.length).toBeGreaterThanOrEqual(1);

    const dev = res.body.devices.find((d: any) => d.device_id === 'SF-001');
    expect(dev).toBeDefined();
    expect(dev.account_id).toBe('mshiva5626');
    expect(dev.thresholds.temp_min).toBe(1.0);
    expect(dev.thresholds.temp_max).toBe(4.0);
    expect(dev.thresholds.humidity_min).toBe(90.0);
    expect(dev.thresholds.humidity_max).toBe(95.0);
    expect(dev.thresholds.gas_threshold).toBe(230);
  });

  it('3. should register/pair a new device for the account', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        device_id: 'SF-002',
        nickname: 'Cold Room Chamber B',
        temp_min: 2.0,
        temp_max: 6.0,
        humidity_min: 85.0,
        humidity_max: 92.0,
        gas_threshold: 300,
      })
      .expect(201);

    expect(res.body.device.device_id).toBe('SF-002');
    expect(res.body.device.nickname).toBe('Cold Room Chamber B');
  });

  it('4. should fetch latest telemetry reading for a device', async () => {
    // Post a fresh telemetry reading
    await request(app)
      .post('/api/telemetry')
      .send({
        device_id: 'SF-001',
        account_id: 'mshiva5626',
        door_status: 'CLOSED',
        state: 'NORMAL',
        dht_exists: true,
        gas_exists: true,
        door_exists: true,
        temperature: 2.8,
        humidity: 94.0,
        gas_level: 110,
      });

    const res = await request(app)
      .get('/api/devices/SF-001/latest')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.device_id).toBe('SF-001');
    expect(parseFloat(res.body.reading.temperature)).toBe(2.8);
    expect(parseFloat(res.body.reading.humidity)).toBe(94.0);
    expect(res.body.reading.gas_level).toBe(110);
  });

  it('5. should fetch history range for a device with limit', async () => {
    const res = await request(app)
      .get('/api/devices/SF-001/history?limit=10')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.device_id).toBe('SF-001');
    expect(res.body.history).toBeInstanceOf(Array);
    expect(res.body.history.length).toBeGreaterThanOrEqual(1);
    expect(res.body.history.length).toBeLessThanOrEqual(10);
  });

  it('6. should update device climate thresholds (PUT)', async () => {
    const res = await request(app)
      .put('/api/devices/SF-001/thresholds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        temp_min: 0.5,
        temp_max: 3.5,
        humidity_min: 91.0,
        humidity_max: 96.0,
        gas_threshold: 250,
        nickname: 'Vault Alpha Updated',
      })
      .expect(200);

    expect(res.body.device.nickname).toBe('Vault Alpha Updated');
    expect(res.body.device.thresholds.temp_min).toBe(0.5);
    expect(res.body.device.thresholds.temp_max).toBe(3.5);
    expect(res.body.device.thresholds.humidity_min).toBe(91.0);
    expect(res.body.device.thresholds.humidity_max).toBe(96.0);
    expect(res.body.device.thresholds.gas_threshold).toBe(250);
  });

  it('7. should unpair and delete a device (DELETE)', async () => {
    // First register a temp device to unpair
    await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ device_id: 'SF-TEMP-UNPAIR', nickname: 'Temporary Box' })
      .expect(201);

    const res = await request(app)
      .delete('/api/devices/SF-TEMP-UNPAIR')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.device_id).toBe('SF-TEMP-UNPAIR');

    // Verify it is gone
    const listRes = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const found = listRes.body.devices.some((d: any) => d.device_id === 'SF-TEMP-UNPAIR');
    expect(found).toBe(false);
  });

  it('8. should update and fetch device sensor calibration (PUT & GET)', async () => {
    const putRes = await request(app)
      .put('/api/devices/SF-001/calibration')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        temp_offset: -1.5,
        humidity_offset: 2.5,
        gas_scale: 1.2,
        override_mode: true,
        custom_temp: 3.8,
        custom_humidity: 94.0,
        custom_gas: 180,
      })
      .expect(200);

    expect(putRes.body.calibration.temp_offset).toBe(-1.5);
    expect(putRes.body.calibration.humidity_offset).toBe(2.5);
    expect(putRes.body.calibration.gas_scale).toBe(1.2);
    expect(putRes.body.calibration.override_mode).toBe(true);
    expect(putRes.body.calibration.custom_temp).toBe(3.8);

    const getRes = await request(app)
      .get('/api/devices/SF-001/calibration')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(getRes.body.calibration.temp_offset).toBe(-1.5);
    expect(getRes.body.calibration.override_mode).toBe(true);
  });

  it('9. should queue remote factory reset / pairing mode (POST /api/devices/:deviceId/reset)', async () => {
    const res = await request(app)
      .post('/api/devices/SF-001/reset')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.reset_pending).toBe(true);

    // Verify reset_pending is reflected in telemetry response
    const telemRes = await request(app)
      .post('/api/telemetry')
      .send({
        device_id: 'SF-001',
        account_id: 'mshiva5626',
        temperature: 2.0,
        humidity: 90.0,
        gas_level: 150,
      })
      .expect(200);

    expect(telemRes.body.command).toBe('RESET');
    expect(telemRes.body.reset).toBe(true);
  });
});
