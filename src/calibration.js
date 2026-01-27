const TIME_BUDGET = { 1: 60, 2: 90, 3: 120, 4: 180, 5: 240 };

function percentile(values, p) {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function buildQuestionStats(attempts) {
  const stats = new Map();
  for (const attempt of attempts) {
    if (!stats.has(attempt.question_id)) {
      stats.set(attempt.question_id, { total: 0, correct: 0, overtime: 0, durations: [] });
    }
    const entry = stats.get(attempt.question_id);
    entry.total += 1;
    if (attempt.is_correct) {
      entry.correct += 1;
    }
    if (attempt.overtime) {
      entry.overtime += 1;
    }
    if (attempt.is_correct && !attempt.overtime) {
      entry.durations.push(attempt.duration_ms);
    }
  }
  return stats;
}

function buildPatternStats(attempts) {
  const stats = new Map();
  for (const attempt of attempts) {
    const patternId = attempt.pattern_id || '__UNSPECIFIED__';
    if (!stats.has(patternId)) {
      stats.set(patternId, { total: 0, correct: 0, questionRates: new Map() });
    }
    const entry = stats.get(patternId);
    entry.total += 1;
    if (attempt.is_correct) {
      entry.correct += 1;
    }
    if (!entry.questionRates.has(attempt.question_id)) {
      entry.questionRates.set(attempt.question_id, { total: 0, correct: 0 });
    }
    const qEntry = entry.questionRates.get(attempt.question_id);
    qEntry.total += 1;
    if (attempt.is_correct) {
      qEntry.correct += 1;
    }
  }
  return stats;
}

function computeCalibration(attempts, content) {
  const users = new Set(attempts.map((attempt) => attempt.user_id));
  const eligible = attempts.filter((attempt) => attempt.is_correct && !attempt.overtime);
  if (eligible.length < 100 || users.size < 30) {
    return {
      eligible_attempts: eligible.length,
      eligible_users: users.size,
      difficulty_adjustment_candidates: [],
      pattern_split_candidates: [],
      time_budget_adjustment_candidates: []
    };
  }

  const questionStats = buildQuestionStats(attempts);
  const patternStats = buildPatternStats(attempts);

  const difficultyCandidates = [];
  for (const [questionId, stats] of questionStats.entries()) {
    if (stats.total < 20) {
      continue;
    }
    const accuracy = stats.correct / stats.total;
    const overtimeRate = stats.overtime / stats.total;
    if (accuracy < 0.5 && overtimeRate > 0.4) {
      difficultyCandidates.push({ question_id: questionId, action: 'upgrade', accuracy, overtime_rate: overtimeRate });
    } else if (accuracy > 0.9 && overtimeRate < 0.1) {
      difficultyCandidates.push({ question_id: questionId, action: 'downgrade', accuracy, overtime_rate: overtimeRate });
    }
  }

  const patternCandidates = [];
  for (const [patternId, stats] of patternStats.entries()) {
    if (stats.total < 50) {
      continue;
    }
    const rates = [];
    for (const qStats of stats.questionRates.values()) {
      if (qStats.total === 0) {
        continue;
      }
      rates.push(qStats.correct / qStats.total);
    }
    if (rates.length < 2) {
      continue;
    }
    const mean = rates.reduce((sum, v) => sum + v, 0) / rates.length;
    const variance = rates.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / rates.length;
    if (variance > 0.2) {
      patternCandidates.push({ pattern_id: patternId, variance: Number(variance.toFixed(4)) });
    }
  }

  const timeCandidates = [];
  for (const [questionId, stats] of questionStats.entries()) {
    if (stats.durations.length < 10) {
      continue;
    }
    const indexEntry = content.getQuestionIndex(questionId);
    const difficulty = indexEntry?.difficulty_level || 3;
    const budget = TIME_BUDGET[difficulty] || 120;
    const p75 = percentile(stats.durations, 0.75);
    if (p75 && p75 > budget * 1000 * 1.1) {
      timeCandidates.push({ question_id: questionId, p75_duration: p75, time_budget: budget });
    }
  }

  return {
    eligible_attempts: eligible.length,
    eligible_users: users.size,
    difficulty_adjustment_candidates: difficultyCandidates,
    pattern_split_candidates: patternCandidates,
    time_budget_adjustment_candidates: timeCandidates
  };
}

module.exports = { computeCalibration };
