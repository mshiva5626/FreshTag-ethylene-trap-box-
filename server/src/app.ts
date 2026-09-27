import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import devicesRoutes from './routes/devices.js';
import telemetryRoutes from './routes/telemetry.js';
import alertsRoutes from './routes/alerts.js';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'freshguard-backend', timestamp: new Date().toISOString() });
  });

  // Mount API routers
  app.use('/api/auth', authRoutes);
  app.use('/api/devices', devicesRoutes);
  app.use('/api/telemetry', telemetryRoutes);
  app.use('/api/alerts', alertsRoutes);

  // 404 Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.originalUrl} not found` });
  });

  // Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('[Unhandled Express Error]:', err);
    res.status(err.status || 500).json({
      error: err.name || 'InternalServerError',
      message: err.message || 'An unexpected error occurred',
    });
  });

  return app;
}
