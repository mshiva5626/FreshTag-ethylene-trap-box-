import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';

let ioInstance: SocketIOServer | null = null;

const JWT_SECRET = process.env.JWT_SECRET || 'freshguard_super_secret_jwt_key_2026';

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
  });

  io.on('connection', (socket: Socket) => {
    let accountId: string | null = null;

    // Check auth token from handshake
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token && typeof token === 'string') {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded?.account_id) {
          accountId = decoded.account_id;
          socket.join(`account:${accountId}`);
          console.log(`[Socket.io] Client authenticated & joined room 'account:${accountId}' (socket ${socket.id})`);
        }
      } catch (err: any) {
        console.warn(`[Socket.io] Token verification failed for socket ${socket.id}:`, err.message);
      }
    }

    // Allow explicit room join by account_id (e.g., during testing or from client handshake)
    socket.on('join_account', (data: { account_id: string; token?: string }) => {
      const targetAccount = data?.account_id;
      if (targetAccount) {
        socket.join(`account:${targetAccount}`);
        accountId = targetAccount;
        socket.emit('joined_account', { account_id: targetAccount, status: 'ok' });
        console.log(`[Socket.io] Socket ${socket.id} joined 'account:${targetAccount}'`);
      }
    });

    socket.on('disconnect', () => {
      // console.log(`[Socket.io] Socket ${socket.id} disconnected.`);
    });
  });

  ioInstance = io;
  return io;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export function broadcastTelemetry(accountId: string, telemetryData: any): void {
  if (!ioInstance) {
    console.warn('[Socket.io] Cannot broadcast telemetry: Socket.io server not initialized');
    return;
  }

  const room = `account:${accountId}`;
  ioInstance.to(room).emit('telemetry', telemetryData);
  // Also emit 'telemetry:new' for backwards/flexible compatibility
  ioInstance.to(room).emit('telemetry:new', telemetryData);

  console.log(`[Socket.io] Broadcast telemetry to room '${room}' for device '${telemetryData.device_id}'`);
}

export function broadcastAlert(accountId: string, alertData: any): void {
  if (!ioInstance) return;
  const room = `account:${accountId}`;
  ioInstance.to(room).emit('alert:new', alertData);
  ioInstance.to(room).emit('alert', alertData);
  console.log(`[Socket.io] Broadcast alert '${alertData.type}' to room '${room}'`);
}
