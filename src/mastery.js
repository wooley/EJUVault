function computeMastery(attempts, patternId) {
  const relevant = attempts.filter((attempt) => attempt.pattern_id === patternId);
  const recent = relevant.slice(-10);
  if (recent.length === 0) {
    return null;
  }
  let correctCount = 0;
  let overtimeCount = 0;
  let consecutiveCorrect = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const attempt = recent[i];
    if (attempt.is_correct) {
      consecutiveCorrect += 1;
    } else {
      break;
    }
  }
  for (const attempt of recent) {
    if (attempt.is_correct) {
      correctCount += 1;
    }
    if (attempt.overtime) {
      overtimeCount += 1;
    }
  }
  const accuracy = correctCount / recent.length;
  const overtimeRate = overtimeCount / recent.length;

  let status = 'steady';
  if (accuracy >= 0.8 && overtimeRate <= 0.2 && consecutiveCorrect >= 3) {
    status = 'promote';
  } else if (accuracy <= 0.5 || overtimeRate >= 0.6) {
    status = 'demote';
  } else if (accuracy >= 0.8 && overtimeRate > 0.2) {
    status = 'accurate_but_slow';
  }

  return {
    accuracy: Number(accuracy.toFixed(4)),
    overtime_rate: Number(overtimeRate.toFixed(4)),
    consecutive_correct: consecutiveCorrect,
    status
  };
}

module.exports = { computeMastery };
