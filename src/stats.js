function percentile(values, p) {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function computeOvertime(attempt, timeBudgetSeconds) {
  return attempt.duration_ms > timeBudgetSeconds * 1000;
}

function computeSignErrors(attempt) {
  const perBlank = attempt.per_blank || {};
  let signErrors = 0;
  let blanks = 0;
  for (const entry of Object.values(perBlank)) {
    if (!entry) {
      continue;
    }
    blanks += 1;
    const expected = entry.expected;
    const actual = entry.actual;
    if (expected === '-' && typeof actual === 'string' && /[0-9]/.test(actual)) {
      signErrors += 1;
    } else if (typeof expected === 'string' && /[0-9]/.test(expected) && actual === '-') {
      signErrors += 1;
    }
  }
  return { signErrors, blanks };
}

function groupKeyForAttempt(attempt, groupBy) {
  if (groupBy === 'pattern') {
    return attempt.pattern_id || '__UNSPECIFIED__';
  }
  if (groupBy === 'difficulty') {
    return Number.isInteger(attempt.difficulty) ? String(attempt.difficulty) : 'unknown';
  }
  if (groupBy === 'tag') {
    return attempt.tags || [];
  }
  return [];
}

function computeStats(attempts, groupBy, content, windowDays) {
  const now = Date.now();
  const filtered = windowDays
    ? attempts.filter((attempt) => {
        const ts = new Date(attempt.created_at).getTime();
        return now - ts <= windowDays * 24 * 60 * 60 * 1000;
      })
    : attempts;

  const groups = new Map();

  for (const attempt of filtered) {
    const key = groupKeyForAttempt(attempt, groupBy);
    const keys = Array.isArray(key) ? key : [key];

    for (const item of keys) {
      if (!item) {
        continue;
      }
      if (!groups.has(item)) {
        groups.set(item, {
          attempts: 0,
          correct: 0,
          overtime: 0,
          durations_for_stats: [],
          sign_errors: 0,
          sign_blanks: 0
        });
      }
      const entry = groups.get(item);
      entry.attempts += 1;
      if (attempt.is_correct) {
        entry.correct += 1;
      }

      const timeBudget = content.getQuestionIndex(attempt.question_id)?.difficulty_level
        ? ({ 1: 60, 2: 90, 3: 120, 4: 180, 5: 240 })[content.getQuestionIndex(attempt.question_id).difficulty_level]
        : ({ 1: 60, 2: 90, 3: 120, 4: 180, 5: 240 })[attempt.difficulty] || 120;
      const overtime = typeof attempt.overtime === 'boolean' ? attempt.overtime : computeOvertime(attempt, timeBudget);
      if (overtime) {
        entry.overtime += 1;
      }
      if (attempt.is_correct && !overtime) {
        entry.durations_for_stats.push(attempt.duration_ms);
      }
      const sign = computeSignErrors(attempt);
      entry.sign_errors += sign.signErrors;
      entry.sign_blanks += sign.blanks;
    }
  }

  const result = {};
  for (const [key, entry] of groups.entries()) {
    const accuracy = entry.attempts > 0 ? entry.correct / entry.attempts : 0;
    const overtimeRate = entry.attempts > 0 ? entry.overtime / entry.attempts : 0;
    const signRate = entry.sign_blanks > 0 ? entry.sign_errors / entry.sign_blanks : 0;
    result[key] = {
      attempts: entry.attempts,
      accuracy: Number(accuracy.toFixed(4)),
      median_duration: median(entry.durations_for_stats),
      p75_duration: percentile(entry.durations_for_stats, 0.75),
      overtime_rate: Number(overtimeRate.toFixed(4)),
      sign_error_rate: Number(signRate.toFixed(4))
    };
  }

  return result;
}

module.exports = { computeStats };
