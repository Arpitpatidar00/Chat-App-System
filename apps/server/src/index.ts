import { buildApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from '@chat/database';
import { closeRedisConnections } from './core/redis/redis-client.js';
import { wsGateway } from './core/websocket/gateway.js';

async function main() {
  const app = await buildApp();

  // Test database connection at startup
  try {
    await prisma.$queryRaw`SELECT 1`;
    app.log.info('✅ Supabase PostgreSQL Database connected successfully');
  } catch (error: any) {
    app.log.error({ err: error.message }, '❌ Failed to connect to Supabase PostgreSQL');
  }

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down server gracefully...');
    try {
      wsGateway.destroy();
      await app.close();
      await prisma.$disconnect();
      await closeRedisConnections();
      app.log.info('Server exited cleanly');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 E2EE Chat Gateway listening at http://${env.HOST}:${env.PORT}`);
    app.log.info(`🔌 WebSocket Gateway ready at ws://${env.HOST}:${env.PORT}/ws`);
  } catch (err) {
    app.log.error({ err }, 'Failed to bind server port');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
