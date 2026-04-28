import { config } from '@constractor/config';
import type { IAIProvider, IStorageProvider, IQueueProvider, IRealtimeProvider, IAuthProvider } from '@constractor/types';
import { PostgreSQLAdapter } from './database/adapters/PostgreSQLAdapter.js';
import { UserRepository } from './database/repositories/UserRepository.js';
import { JWTAuthProvider } from './providers/auth/JWTAuthProvider.js';
import { MockAIProvider } from './providers/ai/MockAIProvider.js';
import { LocalStorageProvider } from './providers/storage/LocalStorageProvider.js';
import { InMemoryQueueProvider } from './providers/queue/InMemoryQueueProvider.js';
import { InMemoryRealtimeProvider } from './providers/realtime/InMemoryRealtimeProvider.js';
import type { IDatabase } from './database/DatabaseProvider.js';
import type { IUserRepository } from './database/repositories/IUserRepository.js';

export interface AppContainer {
  db: IDatabase;
  userRepository: IUserRepository;
  authProvider: IAuthProvider;
  aiProvider: IAIProvider;
  storageProvider: IStorageProvider;
  queueProvider: IQueueProvider;
  realtimeProvider: IRealtimeProvider;
}

export async function buildContainer(): Promise<AppContainer> {
  const db = new PostgreSQLAdapter(config.DATABASE_URL);
  const userRepository = new UserRepository(db);
  const authProvider = new JWTAuthProvider(userRepository, db, config);

  const aiProvider: IAIProvider = config.USE_REAL_AI
    ? (() => { throw new Error('RealAIProvider not yet implemented'); })()
    : new MockAIProvider();

  const storageProvider: IStorageProvider = config.USE_REAL_STORAGE
    ? (() => { throw new Error('CloudStorageProvider not yet implemented'); })()
    : new LocalStorageProvider(config.UPLOAD_DIR);

  const queueProvider: IQueueProvider = config.USE_REAL_QUEUE
    ? (() => { throw new Error('BullMQProvider not yet implemented'); })()
    : new InMemoryQueueProvider();

  const realtimeProvider: IRealtimeProvider = config.USE_REAL_REALTIME
    ? (() => { throw new Error('SocketIOProvider not yet implemented'); })()
    : new InMemoryRealtimeProvider();

  return {
    db,
    userRepository,
    authProvider,
    aiProvider,
    storageProvider,
    queueProvider,
    realtimeProvider,
  };
}
