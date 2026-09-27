import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { initSocketServer } from '../src/socket/socketServer.js';
import { initializeDatabase } from '../src/db/init.js';
import { closePool } from '../src/config/database.js';

describe('FreshGuard Telemetry Ingestion API & Socket.io Channel', () => {
  let app: any;
  let httpServer: http.Server;
  let clientSocket: ClientSocket;
  let serverPort: number;

  beforeAll(async () => {
    process.env.USE_PG_MEM = 'true';
    process.env.NODE_ENV = 'test';

    await initializeDatabase();

    app = createApp();
    httpServer = http.createServer(app);
    initSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });

    clientSocket = Client(`http://localhost:${serverPort}`);
    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('join_account', { account_id: 'mshiva5626' });
        clientSocket.on('joined_account', () => resolve());
      });
    });
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await closePool();
  });

  it('1. should successfully ingest a standard full telemetry payload and broadcast it over Socket.io', async () => {
    const fullPayload = {
      device_id: 'SF-001',
      account_id: 'mshiva5626',
      door_status: 'CLOSED',
      state: 'NORMAL',
      dht_exists: true,
      gas_exists: true,
      door_exists: true,
      temperature: 14.2,
      humidity: 91.5,
      gas_level: 87,
      system_mode: 'AUTO',
      inlet_fan: 'ON',
      outlet_fan: 'OFF',
      humidifier: 'ON',
      blue_led: 'OFF',
      white_led: 'OFF',
    };

    const broadcastPromise = new Promise<any>((resolve) => {
      clientSocket.once('telemetry', (data) => resolve(data));
    });

    const res = await request(app)
      .post('/api/telemetry')
      .send(fullPayload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.reading.device_id).toBe('SF-001');
    expect(res.body.reading.temperature).toBe(14.2);
    expect(res.body.reading.humidity).toBe(91.5);
    expect(res.body.reading.gas_level).toBe(87);
    expect(res.body.reading.door_status).toBe('CLOSED');
    expect(res.body.reading.state).toBe('NORMAL');

    // Verify Socket.io client received broadcast
    const broadcasted = await broadcastPromise;
    expect(broadcasted.device_id).toBe('SF-001');
    expect(broadcasted.temperature).toBe(14.2);
    expect(broadcasted.account_id).toBe('mshiva5626');
  });

  it('2. NULL-SENSOR CASE: dht_exists = false must store null for temperature and humidity', async () => {
    const nullDhtPayload = {
      device_id: 'SF-001',
      account_id: 'mshiva5626',
      door_status: 'CLOSED',
      state: 'NORMAL',
      dht_exists: false, // DHT disconnected / offline
      gas_exists: true,
      door_exists: true,
      temperature: null, // As sent by ESP32 firmware when dhtSensorExists is false
      humidity: null,
      gas_level: 195,
      system_mode: 'AUTO',
      inlet_fan: 'OFF',
      outlet_fan: 'OFF',
      humidifier: 'OFF',
      blue_led: 'OFF',
      white_led: 'OFF',
    };

    const res = await request(app)
      .post('/api/telemetry')
      .send(nullDhtPayload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.reading.dht_exists).toBe(false);
    expect(res.body.reading.temperature).toBeNull();
    expect(res.body.reading.humidity).toBeNull();
    expect(res.body.reading.gas_exists).toBe(true);
    expect(res.body.reading.gas_level).toBe(195);
  });

  it('3. NULL-SENSOR CASE: gas_exists = false must store null for gas_level', async () => {
    const nullGasPayload = {
      device_id: 'SF-001',
      account_id: 'mshiva5626',
      door_status: 'CLOSED',
      state: 'NORMAL',
      dht_exists: true,
      gas_exists: false, // Gas MQ sensor offline
      door_exists: true,
      temperature: 3.5,
      humidity: 93,
      gas_level: null, // As sent by ESP32 firmware when gasSensorExists is false
      system_mode: 'AUTO',
      inlet_fan: 'OFF',
      outlet_fan: 'OFF',
      humidifier: 'ON',
      blue_led: 'OFF',
      white_led: 'OFF',
    };

    const res = await request(app)
      .post('/api/telemetry')
      .send(nullGasPayload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.reading.gas_exists).toBe(false);
    expect(res.body.reading.gas_level).toBeNull();
    expect(res.body.reading.dht_exists).toBe(true);
    expect(res.body.reading.temperature).toBe(3.5);
    expect(res.body.reading.humidity).toBe(93);
  });

  it('4. NULL-SENSOR CASE: both dht_exists = false and gas_exists = false with door open safety event', async () => {
    const allNullPayload = {
      device_id: 'SF-001',
      account_id: 'mshiva5626',
      door_status: 'OPEN',
      state: 'DOOR_OPEN',
      dht_exists: false,
      gas_exists: false,
      door_exists: true,
      temperature: null,
      humidity: null,
      gas_level: null,
      system_mode: 'AUTO',
      inlet_fan: 'OFF',
      outlet_fan: 'OFF',
      humidifier: 'OFF',
      blue_led: 'OFF',
      white_led: 'ON',
    };

    const res = await request(app)
      .post('/api/telemetry')
      .send(allNullPayload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.reading.dht_exists).toBe(false);
    expect(res.body.reading.gas_exists).toBe(false);
    expect(res.body.reading.temperature).toBeNull();
    expect(res.body.reading.humidity).toBeNull();
    expect(res.body.reading.gas_level).toBeNull();
    expect(res.body.reading.door_status).toBe('OPEN');
    expect(res.body.reading.state).toBe('DOOR_OPEN');
    expect(res.body.reading.white_led).toBe('ON');
  });

  it('5. should reject request when device_id is missing', async () => {
    const invalidPayload = {
      account_id: 'mshiva5626',
      door_status: 'CLOSED',
      state: 'NORMAL',
    };

    const res = await request(app)
      .post('/api/telemetry')
      .send(invalidPayload)
      .expect(400);

    expect(res.body.error).toBe('Validation Error');
    expect(res.body.message).toContain('device_id');
  });

  it('6. should reject request when account_id is missing', async () => {
    const invalidPayload = {
      device_id: 'SF-001',
      door_status: 'CLOSED',
      state: 'NORMAL',
    };

    const res = await request(app)
      .post('/api/telemetry')
      .send(invalidPayload)
      .expect(400);

    expect(res.body.error).toBe('Validation Error');
    expect(res.body.message).toContain('account_id');
  });
});
