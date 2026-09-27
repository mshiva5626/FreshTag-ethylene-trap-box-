import http from 'http';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { initSocketServer } from './socket/socketServer.js';
import { initializeDatabase } from './db/init.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '8080', 10);

async function startServer() {
  try {
    // 1. Initialize PostgreSQL database and schemas
    await initializeDatabase();

    // 2. Create Express app
    const app = createApp();

    // 3. Create HTTP server and bind Socket.io
    const httpServer = http.createServer(app);
    initSocketServer(httpServer);

    // 4. Start listening
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n======================================================`);
      console.log(`  FreshGuard IoT Backend Server Active`);
      console.log(`  HTTP API:   http://0.0.0.0:${PORT}`);
      console.log(`  Telemetry:  POST http://0.0.0.0:${PORT}/api/telemetry`);
      console.log(`  WebSocket:  ws://0.0.0.0:${PORT} (Socket.io)`);
      console.log(`======================================================\n`);
    });

    const shutdown = () => {
      console.log('\nShutting down FreshGuard backend...');
      httpServer.close(() => {
        console.log('HTTP & WebSocket server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err: any) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

startServer();
