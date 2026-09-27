import { io, Socket } from 'socket.io-client';
import { getBackendUrl } from './backendUrl';

const BACKEND_URL = getBackendUrl();

let socketInstance: Socket | null = null;

export function getSocket(): Socket | null {
  return socketInstance;
}

export function initSocket(accountId: string, token?: string, onTelemetry?: (data: any) => void): Socket {
  if (socketInstance && socketInstance.connected) {
    socketInstance.emit('join_account', { account_id: accountId });
    return socketInstance;
  }

  const socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    auth: {
      token: token || '',
    },
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1500,
  });

  socket.on('connect', () => {
    console.log(`[Socket.io] Connected to FreshGuard server (${socket.id}). Joining room for account ${accountId}`);
    socket.emit('join_account', { account_id: accountId });
  });

  socket.on('telemetry', (data: any) => {
    console.log(`[Socket.io] Real-time telemetry received for ${data.device_id}:`, data);
    if (onTelemetry) {
      onTelemetry(data);
    }
  });

  socket.on('telemetry:new', (data: any) => {
    if (onTelemetry) {
      onTelemetry(data);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket.io] Disconnected:', reason);
  });

  socketInstance = socket;
  return socket;
}

export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
