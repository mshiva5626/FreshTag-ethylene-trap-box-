import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { authenticateJWT, AuthRequest } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'freshguard_super_secret_jwt_key_2026';

// Helper to sign JWT
function signToken(user: { id: number; account_id: string; email: string; name: string }) {
  return jwt.sign(
    {
      id: user.id,
      account_id: user.account_id,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// -------------------------------------------------------------
// POST /api/auth/register
// -------------------------------------------------------------
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, phone, account_id } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Validation Error', message: 'Email, password, and name are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Validation Error', message: 'Password must be at least 6 characters' });
      return;
    }

    // Check if user exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Conflict', message: 'User with this email already exists' });
      return;
    }

    // Determine account_id
    const finalAccountId = account_id?.trim() || `acc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (account_id, email, phone, password_hash, name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, account_id, email, phone, name, created_at`,
      [finalAccountId, email.toLowerCase().trim(), phone || null, passwordHash, name.trim()]
    );

    const newUser = result.rows[0];
    const token = signToken(newUser);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        account_id: newUser.account_id,
        email: newUser.email,
        phone: newUser.phone,
        name: newUser.name,
      },
    });
  } catch (err: any) {
    console.error('[Auth Register Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/auth/login
// -------------------------------------------------------------
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, phone, identifier, password } = req.body;

    const loginId = (identifier || email || phone || '').toLowerCase().trim();
    if (!loginId || !password) {
      res.status(400).json({ error: 'Validation Error', message: 'Email or phone and password are required' });
      return;
    }

    // Find by email or phone
    const result = await query(
      'SELECT id, account_id, email, phone, password_hash, name FROM users WHERE email = $1 OR phone = $1',
      [loginId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
      return;
    }

    const token = signToken(user);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        account_id: user.account_id,
        email: user.email,
        phone: user.phone,
        name: user.name,
      },
    });
  } catch (err: any) {
    console.error('[Auth Login Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/auth/otp/request
// -------------------------------------------------------------
router.post('/otp/request', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, email, phone } = req.body;
    const target = (identifier || email || phone || '').toLowerCase().trim();

    if (!target) {
      res.status(400).json({ error: 'Validation Error', message: 'Email or phone is required to send OTP' });
      return;
    }

    // Generate 6-digit OTP code (fixed 123456 in dev/test or randomized)
    const otpCode = process.env.NODE_ENV === 'test' ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await query(
      `INSERT INTO otps (identifier, otp_code, expires_at, used)
       VALUES ($1, $2, $3, false)`,
      [target, otpCode, expiresAt]
    );

    console.log(`[Auth OTP] Generated OTP ${otpCode} for ${target}`);

    res.status(200).json({
      message: 'OTP generated and sent',
      identifier: target,
      // Include OTP in response for test / dev convenience
      otp: otpCode,
      expires_in_seconds: 600,
    });
  } catch (err: any) {
    console.error('[Auth OTP Request Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/auth/otp/verify
// -------------------------------------------------------------
router.post('/otp/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, email, phone, otp } = req.body;
    const target = (identifier || email || phone || '').toLowerCase().trim();
    const code = (otp || '').trim();

    if (!target || !code) {
      res.status(400).json({ error: 'Validation Error', message: 'Identifier and OTP code are required' });
      return;
    }

    // Check valid unused OTP
    const now = new Date();
    const otpRes = await query(
      `SELECT id FROM otps 
       WHERE identifier = $1 AND otp_code = $2 AND used = false AND expires_at > $3
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [target, code, now]
    );

    if (otpRes.rows.length === 0) {
      res.status(400).json({ error: 'Invalid OTP', message: 'OTP is invalid or has expired' });
      return;
    }

    // Mark as used
    await query('UPDATE otps SET used = true WHERE id = $1', [otpRes.rows[0].id]);

    // Check if user exists or auto-create
    let userResult = await query(
      'SELECT id, account_id, email, phone, name FROM users WHERE email = $1 OR phone = $1',
      [target]
    );

    let user: any;
    if (userResult.rows.length === 0) {
      // Auto-provision user on verified phone/email
      const isEmail = target.includes('@');
      const accountId = `acc_${Date.now().toString(36)}`;
      const dummyPasswordHash = await bcrypt.hash(Math.random().toString(), 10);
      const inserted = await query(
        `INSERT INTO users (account_id, email, phone, password_hash, name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, account_id, email, phone, name`,
        [accountId, isEmail ? target : `${target}@freshguard.local`, !isEmail ? target : null, dummyPasswordHash, 'OTP User']
      );
      user = inserted.rows[0];
    } else {
      user = userResult.rows[0];
    }

    const token = signToken(user);

    res.status(200).json({
      message: 'OTP verified successfully',
      token,
      user: {
        id: user.id,
        account_id: user.account_id,
        email: user.email,
        phone: user.phone,
        name: user.name,
      },
    });
  } catch (err: any) {
    console.error('[Auth OTP Verify Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/auth/me
// -------------------------------------------------------------
router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRes = await query(
      'SELECT id, account_id, email, phone, name, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (userRes.rows.length === 0) {
      res.status(404).json({ error: 'Not Found', message: 'User not found' });
      return;
    }

    const user = userRes.rows[0];

    // Fetch user's devices
    const devicesRes = await query(
      'SELECT device_id, nickname, temp_min, temp_max, humidity_min, humidity_max, gas_threshold FROM devices WHERE account_id = $1',
      [user.account_id]
    );

    res.status(200).json({
      user,
      devices: devicesRes.rows,
    });
  } catch (err: any) {
    console.error('[Auth Me Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
