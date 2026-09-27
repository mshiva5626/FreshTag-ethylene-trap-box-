import { Router, Response } from 'express';
import { query } from '../config/database.js';
import { authenticateJWT, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Demo public VAPID key for Web Push API subscription
const DEMO_VAPID_PUBLIC_KEY = 'BC_freshguard_public_vapid_demo_key_for_botanical_storage_chamber_notifications_2026';

// -------------------------------------------------------------
// GET /api/alerts: List alerts for authenticated user
// -------------------------------------------------------------
router.get('/', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accountId = req.user!.account_id;
    const { resolved } = req.query;

    let sql = 'SELECT * FROM alerts WHERE account_id = $1';
    const params: any[] = [accountId];

    if (resolved !== undefined) {
      params.push(resolved === 'true');
      sql += ` AND resolved = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC, id DESC LIMIT 100';

    const result = await query(sql, params);

    res.status(200).json({
      alerts: result.rows,
      unread_count: result.rows.filter((a: any) => !a.resolved).length,
    });
  } catch (err: any) {
    console.error('[Alerts List Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// PATCH /api/alerts/:id/resolve: Mark alert as resolved
// -------------------------------------------------------------
router.patch('/:id/resolve', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const accountId = req.user!.account_id;

    const result = await query(
      `UPDATE alerts
       SET resolved = true
       WHERE id = $1 AND account_id = $2
       RETURNING *`,
      [id, accountId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Alert not found or already resolved' });
      return;
    }

    res.status(200).json({
      message: 'Alert marked as resolved',
      alert: result.rows[0],
    });
  } catch (err: any) {
    console.error('[Alert Resolve Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/alerts/subscribe: Save browser Web Push subscription
// -------------------------------------------------------------
router.post('/subscribe', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accountId = req.user!.account_id;
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      res.status(400).json({ error: 'Validation Error', message: 'Valid push subscription object required' });
      return;
    }

    const endpoint = subscription.endpoint;
    const subscriptionJson = JSON.stringify(subscription);

    await query(
      `INSERT INTO push_subscriptions (account_id, endpoint, subscription_json)
       VALUES ($1, $2, $3)`,
      [accountId, endpoint, subscriptionJson]
    );

    console.log(`[Web Push] Registered browser push subscription for account ${accountId}`);

    res.status(201).json({
      success: true,
      message: 'Web push notifications enabled successfully',
    });
  } catch (err: any) {
    console.error('[Web Push Subscribe Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/alerts/vapid-key: Get public VAPID key
// -------------------------------------------------------------
router.get('/vapid-key', (req, res) => {
  res.status(200).json({
    publicKey: DEMO_VAPID_PUBLIC_KEY,
  });
});

export default router;
