import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { broadcastTelemetry, broadcastAlert } from '../socket/socketServer.js';

const router = Router();

// Exact telemetry interface per PROJECT.md / esp32_freshguard.ino
export interface TelemetryPayload {
  device_id: string;
  account_id: string;
  door_status?: 'OPEN' | 'CLOSED' | string;
  state?: 'NORMAL' | 'DOOR_OPEN' | 'WAIT_5_SECONDS' | 'RESTART' | 'ALERT' | string;
  dht_exists?: boolean;
  gas_exists?: boolean;
  door_exists?: boolean;
  temperature?: number | string | null;
  humidity?: number | string | null;
  gas_level?: number | string | null;
  system_mode?: 'AUTO' | 'MANUAL' | string;
  inlet_fan?: 'ON' | 'OFF' | string;
  outlet_fan?: 'ON' | 'OFF' | string;
  humidifier?: 'ON' | 'OFF' | string;
  blue_led?: 'ON' | 'OFF' | string;
  white_led?: 'ON' | 'OFF' | string;
}

// -------------------------------------------------------------
// POST /api/telemetry: Ingest reading from ESP32 or client
// -------------------------------------------------------------
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body: TelemetryPayload = req.body;

    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Validation Error', message: 'Payload must be a valid JSON object' });
      return;
    }

    const { device_id, account_id } = body;

    // Validate required identifiers
    if (!device_id || typeof device_id !== 'string' || device_id.trim() === '') {
      res.status(400).json({ error: 'Validation Error', message: 'device_id is required and must be non-empty' });
      return;
    }

    if (!account_id || typeof account_id !== 'string' || account_id.trim() === '') {
      res.status(400).json({ error: 'Validation Error', message: 'account_id is required and must be non-empty' });
      return;
    }

    // Hardware existence flags (boolean coercion)
    const dht_exists = body.dht_exists !== false; // defaults to true unless explicitly false
    const gas_exists = body.gas_exists !== false;
    const door_exists = body.door_exists !== false;

    // Null-sensor handling:
    // If dht_exists is false, temperature & humidity MUST be null in the DB
    let temperature: number | null = null;
    let humidity: number | null = null;

    if (dht_exists && body.temperature !== null && body.temperature !== undefined && body.temperature !== '') {
      const parsedTemp = parseFloat(body.temperature as any);
      temperature = isNaN(parsedTemp) ? null : parsedTemp;
    }

    if (dht_exists && body.humidity !== null && body.humidity !== undefined && body.humidity !== '') {
      const parsedHum = parseFloat(body.humidity as any);
      humidity = isNaN(parsedHum) ? null : parsedHum;
    }

    // If gas_exists is false, gas_level MUST be null in the DB
    let gas_level: number | null = null;
    if (gas_exists && body.gas_level !== null && body.gas_level !== undefined && body.gas_level !== '') {
      const parsedGas = parseInt(body.gas_level as any, 10);
      gas_level = isNaN(parsedGas) ? null : parsedGas;
    }

    // Status strings
    const door_status = body.door_status === 'OPEN' ? 'OPEN' : 'CLOSED';
    const state = body.state || (door_status === 'OPEN' ? 'DOOR_OPEN' : 'NORMAL');
    const system_mode = body.system_mode === 'MANUAL' ? 'MANUAL' : 'AUTO';
    const inlet_fan = body.inlet_fan === 'ON' ? 'ON' : 'OFF';
    const outlet_fan = body.outlet_fan === 'ON' ? 'ON' : 'OFF';
    const humidifier = body.humidifier === 'ON' ? 'ON' : 'OFF';
    const blue_led = body.blue_led === 'ON' ? 'ON' : 'OFF';
    const white_led = body.white_led === 'ON' ? 'ON' : 'OFF';

    // Ensure device exists in devices table
    let devCheck = await query('SELECT * FROM devices WHERE device_id = $1', [device_id.trim()]);
    if (devCheck.rows.length === 0) {
      await query(
        `INSERT INTO devices (device_id, account_id, nickname)
         VALUES ($1, $2, $3)`,
        [device_id.trim(), account_id.trim(), `FreshGuard Vault (${device_id.trim()})`]
      );
      devCheck = await query('SELECT * FROM devices WHERE device_id = $1', [device_id.trim()]);
    }

    const device = devCheck.rows[0];

    // 1. Remote Reset Check: If user requested reset from website, notify ESP8266 to wipe and enter pairing mode
    if (device.reset_pending) {
      await query('UPDATE devices SET reset_pending = false WHERE device_id = $1', [device_id.trim()]);
      res.status(200).json({
        success: true,
        command: 'RESET',
        reset: true,
        message: 'Remote reset command received from FreshTag website. Resetting to pairing mode.',
      });
      return;
    }

    // 2. Account Binding Check: If device registered to different account, command reset to pairing mode
    if (device.account_id && device.account_id !== account_id.trim()) {
      res.status(403).json({
        success: false,
        command: 'RESET',
        reset: true,
        message: 'Device is paired to a different account. Resetting to pairing mode.',
      });
      return;
    }

    // 3. Sensor Calibration & Custom Override
    let finalTemp = temperature;
    let finalHum = humidity;
    let finalGas = gas_level;

    if (device.override_mode) {
      // Custom Data Override Mode is enabled on website
      if (device.custom_temp !== null && device.custom_temp !== undefined) {
        finalTemp = parseFloat(device.custom_temp);
      }
      if (device.custom_humidity !== null && device.custom_humidity !== undefined) {
        finalHum = parseFloat(device.custom_humidity);
      }
      if (device.custom_gas !== null && device.custom_gas !== undefined) {
        finalGas = parseInt(device.custom_gas, 10);
      }
    } else {
      // Apply calibration offsets and multipliers
      const tempOffset = parseFloat(device.temp_offset || 0);
      const humOffset = parseFloat(device.humidity_offset || 0);
      const gasScale = parseFloat(device.gas_scale || 1.0);
      const gasOffset = parseInt(device.gas_offset || 0, 10);

      if (finalTemp !== null) {
        finalTemp = parseFloat((finalTemp + tempOffset).toFixed(2));
      }
      if (finalHum !== null) {
        finalHum = parseFloat(Math.min(100, Math.max(0, finalHum + humOffset)).toFixed(2));
      }
      if (finalGas !== null) {
        finalGas = Math.max(0, Math.round(finalGas * gasScale + gasOffset));
      }
    }

    // Insert telemetry reading with calibrated / verified values
    const insertResult = await query(
      `INSERT INTO telemetry_readings (
        device_id, account_id, door_status, state,
        dht_exists, gas_exists, door_exists,
        temperature, humidity, gas_level,
        system_mode, inlet_fan, outlet_fan, humidifier, blue_led, white_led
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14, $15, $16
      ) RETURNING *`,
      [
        device_id.trim(),
        account_id.trim(),
        door_status,
        state,
        dht_exists,
        gas_exists,
        door_exists,
        finalTemp,
        finalHum,
        finalGas,
        system_mode,
        inlet_fan,
        outlet_fan,
        humidifier,
        blue_led,
        white_led,
      ]
    );

    const savedReading = insertResult.rows[0];

    // Format reading object for response and Socket.io broadcast
    const readingObject = {
      id: savedReading.id,
      device_id: savedReading.device_id,
      account_id: savedReading.account_id,
      door_status: savedReading.door_status,
      state: savedReading.state,
      dht_exists: savedReading.dht_exists,
      gas_exists: savedReading.gas_exists,
      door_exists: savedReading.door_exists,
      temperature: savedReading.temperature !== null ? parseFloat(savedReading.temperature) : null,
      humidity: savedReading.humidity !== null ? parseFloat(savedReading.humidity) : null,
      gas_level: savedReading.gas_level !== null ? parseInt(savedReading.gas_level, 10) : null,
      system_mode: savedReading.system_mode,
      inlet_fan: savedReading.inlet_fan,
      outlet_fan: savedReading.outlet_fan,
      humidifier: savedReading.humidifier,
      blue_led: savedReading.blue_led,
      white_led: savedReading.white_led,
      created_at: savedReading.created_at,
    };

    // Broadcast in real-time to the owning account's Socket.io room
    broadcastTelemetry(account_id.trim(), readingObject);

    // Evaluate automated alert rules
    await evaluateAlertRules(device_id.trim(), account_id.trim(), readingObject);

    res.status(201).json({
      success: true,
      command: 'OK',
      reset: false,
      message: 'Telemetry reading ingested successfully',
      reading: readingObject,
      calibration: {
        temp_offset: parseFloat(device.temp_offset || 0),
        humidity_offset: parseFloat(device.humidity_offset || 0),
        gas_scale: parseFloat(device.gas_scale || 1.0),
        gas_offset: parseInt(device.gas_offset || 0, 10),
        override_mode: Boolean(device.override_mode),
        custom_temp: device.custom_temp !== null && device.custom_temp !== undefined ? parseFloat(device.custom_temp) : null,
        custom_humidity: device.custom_humidity !== null && device.custom_humidity !== undefined ? parseFloat(device.custom_humidity) : null,
        custom_gas: device.custom_gas !== null && device.custom_gas !== undefined ? parseInt(device.custom_gas, 10) : null,
      },
    });
  } catch (err: any) {
    console.error('[Telemetry Ingestion Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

async function insertAndBroadcastAlert(
  deviceId: string,
  accountId: string,
  type: string,
  severity: string,
  title: string,
  message: string
) {
  try {
    const res = await query(
      `INSERT INTO alerts (device_id, account_id, type, severity, title, message, resolved)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING *`,
      [deviceId, accountId, type, severity, title, message]
    );
    const alert = res.rows[0];
    broadcastAlert(accountId, alert);
  } catch (err: any) {
    console.error('[Alert Insert Error]:', err.message);
  }
}

async function evaluateAlertRules(deviceId: string, accountId: string, reading: any) {
  try {
    const devRes = await query('SELECT * FROM devices WHERE device_id = $1', [deviceId]);
    if (devRes.rows.length === 0) return;
    const device = devRes.rows[0];

    // 1. Rule: Door left open > 2 min
    if (reading.door_status === 'OPEN') {
      const openSinceRes = await query(
        `SELECT created_at FROM telemetry_readings
         WHERE device_id = $1 AND door_status = 'OPEN'
         ORDER BY created_at ASC, id ASC LIMIT 1`,
        [deviceId]
      );

      if (openSinceRes.rows.length > 0) {
        const openTime = new Date(openSinceRes.rows[0].created_at).getTime();
        const durationSeconds = (Date.now() - openTime) / 1000;
        if (durationSeconds >= 120) {
          const existing = await query(
            `SELECT id FROM alerts WHERE device_id = $1 AND type = 'DOOR_OPEN_PROLONGED' AND resolved = false`,
            [deviceId]
          );
          if (existing.rows.length === 0) {
            await insertAndBroadcastAlert(
              deviceId,
              accountId,
              'DOOR_OPEN_PROLONGED',
              'CRITICAL',
              'Safety Alert: Chamber Door Left Open (>2 min)',
              `Chamber ${device.nickname || deviceId} door optical safety beam has been broken for over 2 minutes. Actuators halted.`
            );
          }
        }
      }
    }

    // 2. Rule: Sensor Offline
    if (!reading.dht_exists || !reading.gas_exists) {
      const existing = await query(
        `SELECT id FROM alerts WHERE device_id = $1 AND type = 'SENSOR_OFFLINE' AND resolved = false`,
        [deviceId]
      );
      if (existing.rows.length === 0) {
        const offlineSensors = [
          !reading.dht_exists ? 'DHT11 (Temp & RH)' : '',
          !reading.gas_exists ? 'MQ Gas Sensor (VOC Index)' : '',
        ].filter(Boolean).join(' and ');

        await insertAndBroadcastAlert(
          deviceId,
          accountId,
          'SENSOR_OFFLINE',
          'WARNING',
          'Hardware Alert: Sensor Offline',
          `Sensor hardware disconnected on ${device.nickname || deviceId}: ${offlineSensors} is not reporting.`
        );
      }
    }

    // 3. Rule: Ethylene index above threshold
    if (reading.gas_level !== null && reading.gas_level > (device.gas_threshold || 230)) {
      const existing = await query(
        `SELECT id FROM alerts WHERE device_id = $1 AND type = 'ETHYLENE_HIGH' AND resolved = false`,
        [deviceId]
      );
      if (existing.rows.length === 0) {
        await insertAndBroadcastAlert(
          deviceId,
          accountId,
          'ETHYLENE_HIGH',
          'WARNING',
          'Ethylene / VOC Level Exceeded Threshold',
          `Ethylene / VOC relative index reached ${reading.gas_level} (threshold: ${device.gas_threshold}). Catalytic scrubber fan triggered.`
        );
      }
    }

    // 4. Rule: Granule-replacement reminder
    const granuleInterval = device.granule_interval_days || 30;
    const lastReplaced = device.granule_last_replaced ? new Date(device.granule_last_replaced).getTime() : 0;
    const daysElapsed = (Date.now() - lastReplaced) / (1000 * 60 * 60 * 24);
    if (daysElapsed >= granuleInterval) {
      const existing = await query(
        `SELECT id FROM alerts WHERE device_id = $1 AND type = 'GRANULE_REPLACEMENT' AND resolved = false`,
        [deviceId]
      );
      if (existing.rows.length === 0) {
        await insertAndBroadcastAlert(
          deviceId,
          accountId,
          'GRANULE_REPLACEMENT',
          'INFO',
          'Filter Maintenance: Granule Replacement Reminder',
          `Catalytic scrubber granules on ${device.nickname || deviceId} have reached their ${granuleInterval}-day service interval. Replace active media.`
        );
      }
    }

    // 5. Rule: Temperature Excursion Alert (Passive thermal monitoring - no active cooler fitted)
    if (reading.dht_exists && reading.temperature !== null && reading.temperature !== undefined) {
      const minTemp = device.temp_min !== null && device.temp_min !== undefined ? parseFloat(device.temp_min) : null;
      const maxTemp = device.temp_max !== null && device.temp_max !== undefined ? parseFloat(device.temp_max) : null;

      if ((minTemp !== null && reading.temperature < minTemp) || (maxTemp !== null && reading.temperature > maxTemp)) {
        const existing = await query(
          `SELECT id FROM alerts WHERE device_id = $1 AND type = 'TEMPERATURE_EXCURSION' AND resolved = false`,
          [deviceId]
        );
        if (existing.rows.length === 0) {
          const isHigh = maxTemp !== null && reading.temperature > maxTemp;
          await insertAndBroadcastAlert(
            deviceId,
            accountId,
            'TEMPERATURE_EXCURSION',
            'WARNING',
            `Thermal Alert: Chamber Temperature ${isHigh ? 'High' : 'Low'}`,
            `Ambient chamber temperature on ${device.nickname || deviceId} is ${reading.temperature}°C (safe range: ${minTemp ?? '--'}°C – ${maxTemp ?? '--'}°C). Active cooler is not fitted; check ambient storage location.`
          );
        }
      }
    }
  } catch (err: any) {
    console.error('[Evaluate Alerts Error]:', err.message);
  }
}

export default router;
