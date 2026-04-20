function requireInProduction(name) {
  const value = process.env[name];
  if (process.env.NODE_ENV === 'production' && !value) {
    throw new Error(`Missing required environment variable in production: ${name}`);
  }
  return value || '';
}

function getEnv() {
  const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: Number(process.env.PORT || 3000),
    JWT_SECRET: requireInProduction('JWT_SECRET'),
    APP_URL: process.env.APP_URL || '',
    MONITOR_WORKER_MODE: process.env.MONITOR_WORKER_MODE || 'all',
    NOTIFICATION_WORKER_MODE: process.env.NOTIFICATION_WORKER_MODE || 'all',
    NOTIFICATION_QUEUE_BATCH_SIZE: Number(process.env.NOTIFICATION_QUEUE_BATCH_SIZE || 50),
    SOURCE_REGISTRY_MONITOR_ENABLED: String(process.env.SOURCE_REGISTRY_MONITOR_ENABLED || 'true').toLowerCase() !== 'false',
    SOURCE_REGISTRY_MONITOR_INTERVAL_MS: Number(process.env.SOURCE_REGISTRY_MONITOR_INTERVAL_MS || 120000)
  };

  if (!Number.isFinite(env.PORT) || env.PORT <= 0) {
    throw new Error('PORT must be a positive number');
  }
  if (!Number.isFinite(env.NOTIFICATION_QUEUE_BATCH_SIZE) || env.NOTIFICATION_QUEUE_BATCH_SIZE <= 0) {
    throw new Error('NOTIFICATION_QUEUE_BATCH_SIZE must be a positive number');
  }
  if (!Number.isFinite(env.SOURCE_REGISTRY_MONITOR_INTERVAL_MS) || env.SOURCE_REGISTRY_MONITOR_INTERVAL_MS <= 0) {
    throw new Error('SOURCE_REGISTRY_MONITOR_INTERVAL_MS must be a positive number');
  }

  return env;
}

module.exports = { getEnv };
