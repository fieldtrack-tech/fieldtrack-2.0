import { env } from "./config/env.js";
import { buildApp } from "./app.js";
import { performStartupRecovery } from "./workers/distance.worker.js";

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`Server running in ${env.NODE_ENV} mode`);

    // Phase 10: Crash recovery runs AFTER the server is fully listening.
    // Orphaned sessions are re-enqueued into Redis via BullMQ.
    // performStartupRecovery is non-blocking internally (setImmediate batching)
    // so this call returns almost immediately and enqueuing happens in the
    // background on subsequent event loop ticks.
    performStartupRecovery(app);
  } catch (error) {
    app.log.error(error, "Failed to start server");
    process.exit(1);
  }
}

start();
