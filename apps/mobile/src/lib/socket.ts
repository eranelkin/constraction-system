import { io, type Socket } from 'socket.io-client';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4501';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
