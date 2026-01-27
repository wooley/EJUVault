const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.json');
const CODE_TTL_MINUTES = process.env.CODE_TTL_MINUTES ? Number(process.env.CODE_TTL_MINUTES) : 10;
const CODE_COOLDOWN_SECONDS = process.env.CODE_COOLDOWN_SECONDS
  ? Number(process.env.CODE_COOLDOWN_SECONDS)
  : 60;
const TOKEN_EXPIRES_DAYS = process.env.TOKEN_EXPIRES_DAYS
  ? Number(process.env.TOKEN_EXPIRES_DAYS)
  : 30;
const AUTH_DEBUG_CODE = process.env.AUTH_DEBUG_CODE === 'true';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function assertConfig() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is required. Set it in the environment.');
  }
}

module.exports = {
  PORT,
  HOST,
  JWT_SECRET,
  DB_PATH,
  CODE_TTL_MINUTES,
  CODE_COOLDOWN_SECONDS,
  TOKEN_EXPIRES_DAYS,
  AUTH_DEBUG_CODE,
  ADMIN_TOKEN,
  assertConfig
};
