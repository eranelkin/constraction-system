import { config } from '@constractor/config';
import { buildContainer } from './container.js';
import { createApp } from './app.js';

async function main() {
  const container = await buildContainer();
  const app = createApp(container);

  const server = app.listen(config.PORT, () => {
    console.log(`🚀 API running on http://localhost:${config.PORT}`);
    console.log(`   ENV: ${config.NODE_ENV}`);
    console.log(`   DB:  ${config.DATABASE_URL.replace(/:\/\/.*@/, '://<credentials>@')}`);
    console.log(`   AI:  ${config.USE_REAL_AI ? 'real' : 'mock'}`);
  });

  const shutdown = async () => {
    console.log('\nShutting down…');
    server.close(async () => {
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
