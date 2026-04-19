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
    APP_URL: process.env.APP_URL || ''
  };

  if (!Number.isFinite(env.PORT) || env.PORT <= 0) {
    throw new Error('PORT must be a positive number');
  }

  return env;
}

module.exports = { getEnv };
