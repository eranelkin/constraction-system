export type RealtimePayload = Record<string, unknown>;

export type SubscriptionCallback<T extends RealtimePayload = RealtimePayload> = (
  payload: T,
) => void | Promise<void>;

export type UnsubscribeFn = () => void;

export interface IRealtimeProvider {
  emit<T extends RealtimePayload>(
    channel: string,
    event: string,
    payload: T,
  ): Promise<void>;

  subscribe<T extends RealtimePayload>(
    channel: string,
    event: string,
    callback: SubscriptionCallback<T>,
  ): UnsubscribeFn;

  joinRoom(roomId: string, userId: string): Promise<void>;

  leaveRoom(roomId: string, userId: string): Promise<void>;
}
