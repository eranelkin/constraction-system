import { io, type Socket } from 'socket.io-client';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4501';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  // Reuse the existing socket even during reconnection — replacing it while it's
  // reconnecting would orphan any handlers registered on the old instance.
  if (socket) return socket;
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
