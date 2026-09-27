import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import devicesRoutes from './routes/devices.js';
import telemetryRoutes from './routes/telemetry.js';
import alertsRoutes from './routes/alerts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint for hosting platforms
  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'freshguard-backend', timestamp: new Date().toISOString() });
  });

  // Mount API routers
  app.use('/api/auth', authRoutes);
  app.use('/api/devices', devicesRoutes);
  app.use('/api/telemetry', telemetryRoutes);
  app.use('/api/alerts', alertsRoutes);

  // Serve frontend static assets if available (monolithic deployment on Render)
  const clientDistPath = path.resolve(__dirname, '../../app/dist');
  const altClientDistPath = path.resolve(__dirname, '../../../app/dist');
  const staticPath = fs.existsSync(clientDistPath) ? clientDistPath : (fs.existsSync(altClientDistPath) ? altClientDistPath : null);

  if (staticPath) {
    app.use(express.static(staticPath));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  } else {
    // Root status info if frontend build is not co-located
    app.get('/', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'online',
        service: 'FreshGuard IoT Platform Backend',
        health: '/api/health',
        telemetry: '/api/telemetry',
        documentation: 'https://github.com/mshiva5626/FreshTag-ethylene-trap-box-'
      });
    });
  }

  // 404 Handler for unhandled API routes
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
