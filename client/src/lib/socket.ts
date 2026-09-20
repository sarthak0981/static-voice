import { io, Socket } from 'socket.io-client';
import { ConnectionStatus } from '../types/index.js';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    // Connect to custom backend URL if specified, or current origin, with fallback to port 3001 in dev
    const envUrl = (import.meta as any).env?.VITE_SERVER_URL;
    const isDev = window.location.port === '5173';
    const serverUrl = envUrl || (isDev ? 'http://localhost:3001' : window.location.origin);

    socketInstance = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });
  }
  return socketInstance;
}

export function subscribeConnectionStatus(onChange: (status: ConnectionStatus) => void): () => void {
  const socket = getSocket();

  const handleConnect = () => onChange('CONNECTED');
  const handleConnecting = () => onChange('CONNECTING');
  const handleReconnectAttempt = () => onChange('RECONNECTING');
  const handleDisconnect = () => onChange('OFFLINE');

  socket.on('connect', handleConnect);
  socket.on('connecting', handleConnecting);
  socket.on('reconnect_attempt', handleReconnectAttempt);
  socket.on('disconnect', handleDisconnect);

  if (socket.connected) {
    onChange('CONNECTED');
  } else {
    onChange('CONNECTING');
  }

  return () => {
    socket.off('connect', handleConnect);
    socket.off('connecting', handleConnecting);
    socket.off('reconnect_attempt', handleReconnectAttempt);
    socket.off('disconnect', handleDisconnect);
  };
}

export function getStoredSessionToken(roomId: string): string | null {
  try {
    return sessionStorage.getItem(`static_token_${roomId.toUpperCase()}`);
  } catch {
    return null;
  }
}

export function storeSessionToken(roomId: string, token: string): void {
  try {
    sessionStorage.setItem(`static_token_${roomId.toUpperCase()}`, token);
  } catch {}
}

export function clearStoredSessionToken(roomId: string): void {
  try {
    sessionStorage.removeItem(`static_token_${roomId.toUpperCase()}`);
  } catch {}
}
