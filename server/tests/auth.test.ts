import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/db/init.js';
import { closePool } from '../src/config/database.js';

describe('FreshGuard Auth API (Register, Login, OTP)', () => {
  let app: any;

  beforeAll(async () => {
    process.env.USE_PG_MEM = 'true';
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await closePool();
  });

  it('1. should register a new researcher user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'alice@botany.org',
        password: 'securePassword99',
        name: 'Dr. Alice Botanist',
        phone: '+14155551234',
        account_id: 'alice_research_lab',
      })
      .expect(201);

    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@botany.org');
    expect(res.body.user.name).toBe('Dr. Alice Botanist');
    expect(res.body.user.account_id).toBe('alice_research_lab');
  });

  it('2. should prevent duplicate email registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'alice@botany.org',
        password: 'anotherPassword',
        name: 'Duplicate Alice',
      })
      .expect(409);

    expect(res.body.error).toBe('Conflict');
  });

  it('3. should login with email and password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alice@botany.org',
        password: 'securePassword99',
      })
      .expect(200);

    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@botany.org');
  });

  it('4. should login with the default seeded demo user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@freshguard.app',
        password: 'password123',
      })
      .expect(200);

    expect(res.body.token).toBeDefined();
    expect(res.body.user.account_id).toBe('mshiva5626');
  });

  it('5. should reject login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@freshguard.app',
        password: 'wrong_password',
      })
      .expect(401);

    expect(res.body.error).toBe('Unauthorized');
  });

  it('6. should request and verify OTP for quick authentication', async () => {
    // Request OTP
    const reqRes = await request(app)
      .post('/api/auth/otp/request')
      .send({ identifier: '+15559876543' })
      .expect(200);

    expect(reqRes.body.otp).toBeDefined();
    const otpCode = reqRes.body.otp;

    // Verify OTP
    const verifyRes = await request(app)
      .post('/api/auth/otp/verify')
      .send({ identifier: '+15559876543', otp: otpCode })
      .expect(200);

    expect(verifyRes.body.token).toBeDefined();
    expect(verifyRes.body.user.phone).toBe('+15559876543');
  });

  it('7. should fetch current user profile via GET /api/auth/me', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@freshguard.app', password: 'password123' });

    const token = loginRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meRes.body.user.email).toBe('demo@freshguard.app');
    expect(meRes.body.devices).toBeInstanceOf(Array);
  });
});
