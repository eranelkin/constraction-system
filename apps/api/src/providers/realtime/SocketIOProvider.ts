import EventEmitter from 'node:events';
import type { Server } from 'socket.io';
import type { IRealtimeProvider, RealtimePayload, SubscriptionCallback, UnsubscribeFn } from '@constractor/types';

export class SocketIOProvider implements IRealtimeProvider {
  private readonly emitter = new EventEmitter();

  constructor(private readonly io: Server) {}

  async emit<T extends RealtimePayload>(channel: string, event: string, payload: T): Promise<void> {
    this.io.to(channel).emit(event, payload);
  }

  subscribe<T extends RealtimePayload>(channel: string, event: string, callback: SubscriptionCallback<T>): UnsubscribeFn {
    const key = `${channel}:${event}`;
    this.emitter.on(key, callback as (...args: unknown[]) => void);
    return () => this.emitter.off(key, callback as (...args: unknown[]) => void);
  }

  async joinRoom(roomId: string, userId: string): Promise<void> {
    const sockets = await this.io.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
      socket.join(roomId);
    }
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const sockets = await this.io.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
      socket.leave(roomId);
    }
  }
}
