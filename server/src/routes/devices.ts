import { Router, Response } from 'express';
import { query } from '../config/database.js';
import { authenticateJWT, AuthRequest } from '../middleware/auth.js';

const router = Router();

// -------------------------------------------------------------
// GET /api/devices: Fetch device list for authenticated account
// -------------------------------------------------------------
router.get('/', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accountId = req.user!.account_id;

    const devicesRes = await query(
      `SELECT *
       FROM devices
       WHERE account_id = $1
       ORDER BY created_at DESC`,
      [accountId]
    );

    // Fetch latest reading for each device
    const devicesWithLatest = await Promise.all(
      devicesRes.rows.map(async (device: any) => {
        const latestReadingRes = await query(
          `SELECT * FROM telemetry_readings
           WHERE device_id = $1
           ORDER BY created_at DESC, id DESC LIMIT 1`,
          [device.device_id]
        );

        return {
          ...device,
          thresholds: {
            temp_min: parseFloat(device.temp_min),
            temp_max: parseFloat(device.temp_max),
            humidity_min: parseFloat(device.humidity_min),
            humidity_max: parseFloat(device.humidity_max),
            gas_threshold: device.gas_threshold,
          },
          calibration: {
            temp_offset: parseFloat(device.temp_offset ?? 0.0),
            humidity_offset: parseFloat(device.humidity_offset ?? 0.0),
            gas_scale: parseFloat(device.gas_scale ?? 1.0),
            gas_offset: parseInt(device.gas_offset ?? 0, 10),
            override_mode: Boolean(device.override_mode),
            custom_temp: device.custom_temp !== null && device.custom_temp !== undefined ? parseFloat(device.custom_temp) : null,
            custom_humidity: device.custom_humidity !== null && device.custom_humidity !== undefined ? parseFloat(device.custom_humidity) : null,
            custom_gas: device.custom_gas !== null && device.custom_gas !== undefined ? parseInt(device.custom_gas, 10) : null,
            reset_pending: Boolean(device.reset_pending),
          },
          latest_reading: latestReadingRes.rows[0] || null,
        };
      })
    );

    res.status(200).json({ devices: devicesWithLatest });
  } catch (err: any) {
    console.error('[Devices List Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/devices: Register / pair a new device
// -------------------------------------------------------------
router.post('/', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accountId = req.user!.account_id;
    const { device_id, nickname, temp_min, temp_max, humidity_min, humidity_max, gas_threshold } = req.body;

    if (!device_id) {
      res.status(400).json({ error: 'Validation Error', message: 'device_id is required' });
      return;
    }

    // Check if device already registered
    const existing = await query('SELECT device_id, account_id FROM devices WHERE device_id = $1', [device_id]);
    if (existing.rows.length > 0) {
      // If already owned by this account, return it; otherwise conflict
      if (existing.rows[0].account_id === accountId) {
        res.status(200).json({ message: 'Device already registered to your account', device: existing.rows[0] });
        return;
      }
      res.status(409).json({ error: 'Conflict', message: 'Device is already paired with another account' });
      return;
    }

    const result = await query(
      `INSERT INTO devices (device_id, account_id, nickname, temp_min, temp_max, humidity_min, humidity_max, gas_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        device_id.trim(),
        accountId,
        nickname?.trim() || 'FreshGuard Vault',
        temp_min !== undefined ? parseFloat(temp_min) : 1.0,
        temp_max !== undefined ? parseFloat(temp_max) : 4.0,
        humidity_min !== undefined ? parseFloat(humidity_min) : 90.0,
        humidity_max !== undefined ? parseFloat(humidity_max) : 95.0,
        gas_threshold !== undefined ? parseInt(gas_threshold, 10) : 230,
      ]
    );

    res.status(201).json({
      message: 'Device registered successfully',
      device: result.rows[0],
    });
  } catch (err: any) {
    console.error('[Device Register Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/devices/:deviceId/latest: Get latest telemetry reading
// -------------------------------------------------------------
router.get('/:deviceId/latest', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;

    const readingRes = await query(
      `SELECT * FROM telemetry_readings
       WHERE device_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [deviceId]
    );

    if (readingRes.rows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: `No telemetry readings found for device ${deviceId}`,
        reading: null,
      });
      return;
    }

    res.status(200).json({
      device_id: deviceId,
      reading: readingRes.rows[0],
    });
  } catch (err: any) {
    console.error('[Device Latest Reading Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/devices/:deviceId/history: Fetch telemetry history range
// -------------------------------------------------------------
router.get('/:deviceId/history', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const { from, to, limit } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 500);

    let sql = 'SELECT * FROM telemetry_readings WHERE device_id = $1';
    const params: any[] = [deviceId];

    if (from) {
      params.push(new Date(from as string).toISOString());
      sql += ` AND created_at >= $${params.length}`;
    }

    if (to) {
      params.push(new Date(to as string).toISOString());
      sql += ` AND created_at <= $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1}`;
    params.push(parsedLimit);

    const result = await query(sql, params);

    res.status(200).json({
      device_id: deviceId,
      count: result.rows.length,
      history: result.rows,
    });
  } catch (err: any) {
    console.error('[Device History Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// PUT / PATCH /api/devices/:deviceId/thresholds: Update thresholds
// -------------------------------------------------------------
const updateThresholdsHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const accountId = req.user!.account_id;
    const { temp_min, temp_max, humidity_min, humidity_max, gas_threshold, nickname, granule_interval_days, granule_last_replaced } = req.body;

    // Verify device belongs to account
    const deviceCheck = await query(
      'SELECT * FROM devices WHERE device_id = $1 AND account_id = $2',
      [deviceId, accountId]
    );

    if (deviceCheck.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Device not found or not owned by your account' });
      return;
    }

    const current = deviceCheck.rows[0];

    const newTempMin = temp_min !== undefined ? parseFloat(temp_min) : current.temp_min;
    const newTempMax = temp_max !== undefined ? parseFloat(temp_max) : current.temp_max;
    const newHumMin = humidity_min !== undefined ? parseFloat(humidity_min) : current.humidity_min;
    const newHumMax = humidity_max !== undefined ? parseFloat(humidity_max) : current.humidity_max;
    const newGasThreshold = gas_threshold !== undefined ? parseInt(gas_threshold, 10) : current.gas_threshold;
    const newNickname = nickname !== undefined ? nickname.trim() : current.nickname;
    const newGranuleInterval = granule_interval_days !== undefined ? parseInt(granule_interval_days, 10) : (current.granule_interval_days || 30);
    const newGranuleLastReplaced = granule_last_replaced !== undefined ? new Date(granule_last_replaced).toISOString() : (current.granule_last_replaced || new Date().toISOString());

    const result = await query(
      `UPDATE devices
       SET temp_min = $1, temp_max = $2, humidity_min = $3, humidity_max = $4,
           gas_threshold = $5, nickname = $6, granule_interval_days = $7,
           granule_last_replaced = $8, updated_at = CURRENT_TIMESTAMP
       WHERE device_id = $9 AND account_id = $10
       RETURNING *`,
      [newTempMin, newTempMax, newHumMin, newHumMax, newGasThreshold, newNickname, newGranuleInterval, newGranuleLastReplaced, deviceId, accountId]
    );

    const updated = result.rows[0];

    res.status(200).json({
      message: 'Thresholds updated successfully',
      device: {
        ...updated,
        granule_interval_days: updated.granule_interval_days,
        granule_last_replaced: updated.granule_last_replaced,
        thresholds: {
          temp_min: parseFloat(updated.temp_min),
          temp_max: parseFloat(updated.temp_max),
          humidity_min: parseFloat(updated.humidity_min),
          humidity_max: parseFloat(updated.humidity_max),
          gas_threshold: updated.gas_threshold,
        },
      },
    });
  } catch (err: any) {
    console.error('[Device Thresholds Update Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

router.put('/:deviceId/thresholds', authenticateJWT, updateThresholdsHandler);
router.patch('/:deviceId/thresholds', authenticateJWT, updateThresholdsHandler);

// -------------------------------------------------------------
// DELETE /api/devices/:deviceId: Unpair/delete device from account
// -------------------------------------------------------------
router.delete('/:deviceId', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const accountId = req.user!.account_id;

    // Verify device belongs to account
    const deviceCheck = await query(
      'SELECT * FROM devices WHERE device_id = $1 AND account_id = $2',
      [deviceId, accountId]
    );

    if (deviceCheck.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Device not found or not owned by your account' });
      return;
    }

    // Delete device from devices table
    await query('DELETE FROM devices WHERE device_id = $1 AND account_id = $2', [deviceId, accountId]);

    // Also remove associated alerts
    await query('DELETE FROM alerts WHERE device_id = $1 AND account_id = $2', [deviceId, accountId]);

    res.status(200).json({
      success: true,
      message: `Device ${deviceId} successfully unpaired from account`,
      device_id: deviceId,
    });
  } catch (err: any) {
    console.error('[Device Unpair Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/devices/:deviceId/calibration: Fetch device calibration
// -------------------------------------------------------------
router.get('/:deviceId/calibration', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const accountId = req.user!.account_id;

    const deviceCheck = await query(
      'SELECT * FROM devices WHERE device_id = $1 AND account_id = $2',
      [deviceId, accountId]
    );

    if (deviceCheck.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Device not found or not owned by your account' });
      return;
    }

    const dev = deviceCheck.rows[0];
    res.status(200).json({
      device_id: deviceId,
      calibration: {
        temp_offset: parseFloat(dev.temp_offset ?? 0.0),
        humidity_offset: parseFloat(dev.humidity_offset ?? 0.0),
        gas_scale: parseFloat(dev.gas_scale ?? 1.0),
        gas_offset: parseInt(dev.gas_offset ?? 0, 10),
        override_mode: Boolean(dev.override_mode),
        custom_temp: dev.custom_temp !== null && dev.custom_temp !== undefined ? parseFloat(dev.custom_temp) : null,
        custom_humidity: dev.custom_humidity !== null && dev.custom_humidity !== undefined ? parseFloat(dev.custom_humidity) : null,
        custom_gas: dev.custom_gas !== null && dev.custom_gas !== undefined ? parseInt(dev.custom_gas, 10) : null,
        reset_pending: Boolean(dev.reset_pending),
      },
    });
  } catch (err: any) {
    console.error('[Device Calibration Fetch Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// PUT /api/devices/:deviceId/calibration: Update sensor calibration
// -------------------------------------------------------------
router.put('/:deviceId/calibration', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const accountId = req.user!.account_id;
    const {
      temp_offset,
      humidity_offset,
      gas_scale,
      gas_offset,
      override_mode,
      custom_temp,
      custom_humidity,
      custom_gas,
    } = req.body;

    const deviceCheck = await query(
      'SELECT * FROM devices WHERE device_id = $1 AND account_id = $2',
      [deviceId, accountId]
    );

    if (deviceCheck.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Device not found or not owned by your account' });
      return;
    }

    const current = deviceCheck.rows[0];

    const newTempOffset = temp_offset !== undefined ? parseFloat(temp_offset) : current.temp_offset;
    const newHumOffset = humidity_offset !== undefined ? parseFloat(humidity_offset) : current.humidity_offset;
    const newGasScale = gas_scale !== undefined ? parseFloat(gas_scale) : current.gas_scale;
    const newGasOffset = gas_offset !== undefined ? parseInt(gas_offset, 10) : current.gas_offset;
    const newOverrideMode = override_mode !== undefined ? Boolean(override_mode) : current.override_mode;
    const newCustomTemp = custom_temp !== undefined ? (custom_temp === null ? null : parseFloat(custom_temp)) : current.custom_temp;
    const newCustomHum = custom_humidity !== undefined ? (custom_humidity === null ? null : parseFloat(custom_humidity)) : current.custom_humidity;
    const newCustomGas = custom_gas !== undefined ? (custom_gas === null ? null : parseInt(custom_gas, 10)) : current.custom_gas;

    const result = await query(
      `UPDATE devices
       SET temp_offset = $1, humidity_offset = $2, gas_scale = $3, gas_offset = $4,
           override_mode = $5, custom_temp = $6, custom_humidity = $7, custom_gas = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE device_id = $9 AND account_id = $10
       RETURNING *`,
      [newTempOffset, newHumOffset, newGasScale, newGasOffset, newOverrideMode, newCustomTemp, newCustomHum, newCustomGas, deviceId, accountId]
    );

    const dev = result.rows[0];
    res.status(200).json({
      message: 'Calibration settings updated successfully',
      device_id: deviceId,
      calibration: {
        temp_offset: parseFloat(dev.temp_offset ?? 0.0),
        humidity_offset: parseFloat(dev.humidity_offset ?? 0.0),
        gas_scale: parseFloat(dev.gas_scale ?? 1.0),
        gas_offset: parseInt(dev.gas_offset ?? 0, 10),
        override_mode: Boolean(dev.override_mode),
        custom_temp: dev.custom_temp !== null && dev.custom_temp !== undefined ? parseFloat(dev.custom_temp) : null,
        custom_humidity: dev.custom_humidity !== null && dev.custom_humidity !== undefined ? parseFloat(dev.custom_humidity) : null,
        custom_gas: dev.custom_gas !== null && dev.custom_gas !== undefined ? parseInt(dev.custom_gas, 10) : null,
        reset_pending: Boolean(dev.reset_pending),
      },
    });
  } catch (err: any) {
    console.error('[Device Calibration Update Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/devices/:deviceId/reset: Queue remote factory reset / pairing mode
// -------------------------------------------------------------
router.post('/:deviceId/reset', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const accountId = req.user!.account_id;

    const deviceCheck = await query(
      'SELECT * FROM devices WHERE device_id = $1 AND account_id = $2',
      [deviceId, accountId]
    );

    if (deviceCheck.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Device not found or not owned by your account' });
      return;
    }

    await query(
      'UPDATE devices SET reset_pending = true, updated_at = CURRENT_TIMESTAMP WHERE device_id = $1 AND account_id = $2',
      [deviceId, accountId]
    );

    res.status(200).json({
      success: true,
      message: `Remote reset command queued for device ${deviceId}. The chamber will wipe its credentials and enter pairing mode on next telemetry transmission.`,
      device_id: deviceId,
      reset_pending: true,
    });
  } catch (err: any) {
    console.error('[Device Remote Reset Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
