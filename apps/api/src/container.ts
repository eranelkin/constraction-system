import { config } from '@constractor/config';
import type { IStorageProvider, IQueueProvider, IRealtimeProvider, IAuthProvider, ISpeechProvider, ITranslationProvider, IFieldExtractionProvider } from '@constractor/types';
import { PostgreSQLAdapter } from './database/adapters/PostgreSQLAdapter.js';
import { UserRepository } from './database/repositories/UserRepository.js';
import { ConversationRepository } from './database/repositories/ConversationRepository.js';
import { MessageRepository } from './database/repositories/MessageRepository.js';
import { JobRepository } from './database/repositories/JobRepository.js';
import { JobApplicationRepository } from './database/repositories/JobApplicationRepository.js';
import { JWTAuthProvider } from './providers/auth/JWTAuthProvider.js';
import { LocalStorageProvider } from './providers/storage/LocalStorageProvider.js';
import { InMemoryQueueProvider } from './providers/queue/InMemoryQueueProvider.js';
import { InMemoryRealtimeProvider } from './providers/realtime/InMemoryRealtimeProvider.js';
import { SocketIOProvider } from './providers/realtime/SocketIOProvider.js';
import type { Server } from 'socket.io';
import { GroupRepository } from './database/repositories/GroupRepository.js';
import { TranslationCacheRepository } from './database/repositories/TranslationCacheRepository.js';
import { FieldReportRepository } from './database/repositories/FieldReportRepository.js';
import { ScheduleTaskRepository } from './database/repositories/ScheduleTaskRepository.js';
import { RfiRepository } from './database/repositories/RfiRepository.js';
import { MockSpeechProvider } from './providers/speech/MockSpeechProvider.js';
import { GroqSpeechProvider } from './providers/speech/GroqSpeechProvider.js';
import { MockTranslationProvider } from './providers/translation/MockTranslationProvider.js';
import { GroqTranslationProvider } from './providers/translation/GroqTranslationProvider.js';
import { MockFieldExtractionProvider } from './providers/field-extraction/MockFieldExtractionProvider.js';
import { GroqFieldExtractionProvider } from './providers/field-extraction/GroqFieldExtractionProvider.js';
import type { IDatabase } from './database/DatabaseProvider.js';
import type { IUserRepository } from './database/repositories/IUserRepository.js';
import type { IConversationRepository } from './database/repositories/IConversationRepository.js';
import type { IMessageRepository } from './database/repositories/IMessageRepository.js';
import type { IJobRepository } from './database/repositories/IJobRepository.js';
import type { IJobApplicationRepository } from './database/repositories/IJobApplicationRepository.js';
import type { IGroupRepository } from './database/repositories/IGroupRepository.js';
import type { IFieldReportRepository } from './database/repositories/IFieldReportRepository.js';
import type { IScheduleTaskRepository } from './database/repositories/IScheduleTaskRepository.js';
import type { IRfiRepository } from './database/repositories/IRfiRepository.js';

export interface AppContainer {
  db: IDatabase;
  userRepository: IUserRepository;
  conversationRepository: IConversationRepository;
  messageRepository: IMessageRepository;
  jobRepository: IJobRepository;
  jobApplicationRepository: IJobApplicationRepository;
  authProvider: IAuthProvider;
  storageProvider: IStorageProvider;
  queueProvider: IQueueProvider;
  realtimeProvider: IRealtimeProvider;
  speechProvider: ISpeechProvider;
  translationProvider: ITranslationProvider;
  fieldExtractionProvider: IFieldExtractionProvider;
  translationCacheRepository: TranslationCacheRepository;
  groupRepository: IGroupRepository;
  fieldReportRepository: IFieldReportRepository;
  scheduleTaskRepository: IScheduleTaskRepository;
  rfiRepository: IRfiRepository;
}

export async function buildContainer(io?: Server): Promise<AppContainer> {
  const db = new PostgreSQLAdapter(config.DATABASE_URL);
  const userRepository = new UserRepository(db);
  const conversationRepository = new ConversationRepository(db);
  const translationCacheRepository = new TranslationCacheRepository(db);
  const messageRepository = new MessageRepository(db, translationCacheRepository);
  const jobRepository = new JobRepository(db);
  const jobApplicationRepository = new JobApplicationRepository(db);
  const groupRepository = new GroupRepository(db);
  const fieldReportRepository = new FieldReportRepository(db);
  const scheduleTaskRepository = new ScheduleTaskRepository(db);
  const rfiRepository = new RfiRepository(db);
  const authProvider = new JWTAuthProvider(userRepository, db, config);

  const storageProvider: IStorageProvider = config.USE_REAL_STORAGE
    ? (() => { throw new Error('CloudStorageProvider not yet implemented'); })()
    : new LocalStorageProvider(config.UPLOAD_DIR);

  const queueProvider: IQueueProvider = config.USE_REAL_QUEUE
    ? (() => { throw new Error('BullMQProvider not yet implemented'); })()
    : new InMemoryQueueProvider();

  const realtimeProvider: IRealtimeProvider = io
    ? new SocketIOProvider(io)
    : new InMemoryRealtimeProvider();

  const speechProvider: ISpeechProvider = config.USE_REAL_SPEECH
    ? new GroqSpeechProvider(config.GROQ_API_KEY ?? (() => { throw new Error('GROQ_API_KEY is required when USE_REAL_SPEECH=true'); })())
    : new MockSpeechProvider();

  const groqApiKey = config.GROQ_API_KEY;
  const translationProvider: ITranslationProvider = config.USE_REAL_TRANSLATION
    ? new GroqTranslationProvider(groqApiKey ?? (() => { throw new Error('GROQ_API_KEY is required when USE_REAL_TRANSLATION=true'); })())
    : new MockTranslationProvider();

  const fieldExtractionProvider: IFieldExtractionProvider = config.USE_REAL_FIELD_EXTRACTION
    ? new GroqFieldExtractionProvider(groqApiKey ?? (() => { throw new Error('GROQ_API_KEY is required when USE_REAL_FIELD_EXTRACTION=true'); })())
    : new MockFieldExtractionProvider();

  return {
    db,
    userRepository,
    conversationRepository,
    messageRepository,
    jobRepository,
    jobApplicationRepository,
    authProvider,
    storageProvider,
    queueProvider,
    realtimeProvider,
    speechProvider,
    translationProvider,
    translationCacheRepository,
    fieldExtractionProvider,
    groupRepository,
    fieldReportRepository,
    scheduleTaskRepository,
    rfiRepository,
  };
}
