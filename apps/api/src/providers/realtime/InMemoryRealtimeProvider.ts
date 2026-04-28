import type {
  IRealtimeProvider,
  RealtimePayload,
  SubscriptionCallback,
  UnsubscribeFn,
} from '@constractor/types';

type ChannelKey = `${string}:${string}`;

export class InMemoryRealtimeProvider implements IRealtimeProvider {
  private subscribers = new Map<ChannelKey, Set<SubscriptionCallback>>();
  private rooms = new Map<string, Set<string>>();

  async emit<T extends RealtimePayload>(
    channel: string,
    event: string,
    payload: T,
  ): Promise<void> {
    const key: ChannelKey = `${channel}:${event}`;
    const callbacks = this.subscribers.get(key);
    if (!callbacks) return;

    const promises: Promise<void>[] = [];
    for (const cb of callbacks) {
      const result = cb(payload);
      if (result instanceof Promise) promises.push(result);
    }
    await Promise.all(promises);
  }

  subscribe<T extends RealtimePayload>(
    channel: string,
    event: string,
    callback: SubscriptionCallback<T>,
  ): UnsubscribeFn {
    const key: ChannelKey = `${channel}:${event}`;
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    const cb = callback as SubscriptionCallback;
    this.subscribers.get(key)!.add(cb);

    return () => {
      this.subscribers.get(key)?.delete(cb);
    };
  }

  async joinRoom(roomId: string, userId: string): Promise<void> {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId)!.add(userId);
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    this.rooms.get(roomId)?.delete(userId);
  }
}
