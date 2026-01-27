const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./config');

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadStore() {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    return { users: [], auth_codes: [], attempts: [], sessions: [], mastery: [] };
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try {
    const data = JSON.parse(raw);
    return {
      users: Array.isArray(data.users) ? data.users : [],
      auth_codes: Array.isArray(data.auth_codes) ? data.auth_codes : [],
      attempts: Array.isArray(data.attempts) ? data.attempts : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      mastery: Array.isArray(data.mastery) ? data.mastery : []
    };
  } catch (error) {
    return { users: [], auth_codes: [], attempts: [], sessions: [], mastery: [] };
  }
}

function saveStore(store) {
  ensureDataDir();
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2));
  fs.renameSync(tempPath, DB_PATH);
}

function createStore() {
  let store = loadStore();

  function persist() {
    saveStore(store);
  }

  function getLatestAuthCode(email) {
    const codes = store.auth_codes.filter((entry) => entry.email === email);
    if (codes.length === 0) {
      return null;
    }
    return codes.reduce((latest, entry) =>
      new Date(entry.requested_at) > new Date(latest.requested_at) ? entry : latest
    );
  }

  function insertAuthCode({ email, code, requested_at, expires_at }) {
    const id = store.auth_codes.length + 1;
    store.auth_codes.push({ id, email, code, requested_at, expires_at, consumed_at: null });
    persist();
    return id;
  }

  function consumeAuthCode(id, consumed_at) {
    const entry = store.auth_codes.find((record) => record.id === id);
    if (!entry) {
      return false;
    }
    entry.consumed_at = consumed_at;
    persist();
    return true;
  }

  function findUserByEmail(email) {
    return store.users.find((user) => user.email === email) || null;
  }

  function insertUser({ id, email, created_at }) {
    store.users.push({ id, email, created_at });
    persist();
  }

  function insertAttempt(attempt) {
    const id = store.attempts.length + 1;
    const record = { id, ...attempt };
    store.attempts.push(record);
    persist();
    return id;
  }

  function listAttemptsByUser(userId) {
    return store.attempts.filter((attempt) => attempt.user_id === userId);
  }

  function listAttemptsAll() {
    return store.attempts.slice();
  }

  function insertSession(session) {
    const id = store.sessions.length + 1;
    const record = { id, ...session };
    store.sessions.push(record);
    persist();
    return record;
  }

  function getSessionById(sessionId) {
    return store.sessions.find((session) => session.session_id === sessionId) || null;
  }

  function upsertMastery(entry) {
    const index = store.mastery.findIndex(
      (record) => record.user_id === entry.user_id && record.pattern_id === entry.pattern_id
    );
    if (index >= 0) {
      store.mastery[index] = { ...store.mastery[index], ...entry };
    } else {
      store.mastery.push(entry);
    }
    persist();
  }

  function listMasteryByUser(userId) {
    return store.mastery.filter((record) => record.user_id === userId);
  }

  return {
    getLatestAuthCode,
    insertAuthCode,
    consumeAuthCode,
    findUserByEmail,
    insertUser,
    insertAttempt,
    listAttemptsByUser,
    listAttemptsAll,
    insertSession,
    getSessionById,
    upsertMastery,
    listMasteryByUser
  };
}

module.exports = { createStore };
