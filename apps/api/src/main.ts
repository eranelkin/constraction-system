import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '@constractor/config';
import type { AuthUser } from '@constractor/types';
import { buildContainer } from './container.js';
import { createApp } from './app.js';

async function main() {
  const io = new Server({ cors: { origin: config.CORS_ORIGINS, credentials: true } });

  const container = await buildContainer(io);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    const result = await container.authProvider.verify(token);
    if (!result.valid || !result.user) return next(new Error(result.error ?? 'Invalid token'));
    socket.data['user'] = result.user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data['user'] as AuthUser;
    void socket.join(`user:${user.id}`);

    socket.on('join_conversation', (conversationId: string) => {
      void container.realtimeProvider.joinRoom(`conversation:${conversationId}`, user.id);
    });

    socket.on('leave_conversation', (conversationId: string) => {
      void container.realtimeProvider.leaveRoom(`conversation:${conversationId}`, user.id);
    });
  });

  const app = createApp(container);
  const httpServer = createServer(app);
  io.attach(httpServer);

  httpServer.listen(config.PORT, () => {
    console.log(`🚀 API running on http://localhost:${config.PORT}`);
    console.log(`   ENV: ${config.NODE_ENV}`);
    console.log(`   DB:  ${config.DATABASE_URL.replace(/:\/\/.*@/, '://<credentials>@')}`);
    console.log(`   AI:  ${config.USE_REAL_AI ? 'real' : 'mock'}`);
    console.log(`   WS:  ${config.USE_REAL_REALTIME ? 'socket.io' : 'in-memory'}`);
  });

  const shutdown = async () => {
    console.log('\nShutting down…');
    io.close();
    httpServer.close(async () => {
      await container.db.close();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
