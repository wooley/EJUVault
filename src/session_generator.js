const crypto = require('crypto');

const TIME_BUDGET_SECONDS = {
  1: 60,
  2: 90,
  3: 120,
  4: 180,
  5: 240
};

function mulberry32(seed) {
  let t = seed;
  return function next() {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), t | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input) {
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return parseInt(hash.slice(0, 8), 16);
}

function shuffleWithRng(items, rng) {
  const array = items.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildDifficultyPlan(size, current) {
  const high = current + 1;
  const low = current - 1;
  const currentCount = Math.round(size * 0.6);
  const lowCount = Math.round(size * 0.2);
  const highCount = size - currentCount - lowCount;
  return {
    low: low >= 1 ? lowCount : 0,
    current: currentCount,
    high: high <= 5 ? highCount : 0
  };
}

function pickDifficultySlot(plan, rng) {
  const buckets = [];
  if (plan.low > 0) {
    buckets.push('low');
  }
  if (plan.current > 0) {
    buckets.push('current');
  }
  if (plan.high > 0) {
    buckets.push('high');
  }
  if (buckets.length === 0) {
    return null;
  }
  const choice = buckets[Math.floor(rng() * buckets.length)];
  plan[choice] -= 1;
  return choice;
}

function difficultyFromSlot(slot, current) {
  if (slot === 'low') {
    return current - 1;
  }
  if (slot === 'high') {
    return current + 1;
  }
  return current;
}

function calculateRecommendedDifficulty(attempts, target) {
  if (Number.isInteger(target)) {
    return target;
  }
  const recent = attempts.slice(-50);
  const counts = {};
  for (const attempt of recent) {
    if (Number.isInteger(attempt.difficulty)) {
      counts[attempt.difficulty] = (counts[attempt.difficulty] || 0) + 1;
    }
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return 3;
  }
  entries.sort((a, b) => b[1] - a[1]);
  return Number(entries[0][0]);
}

function computePatternWeights(attempts) {
  const stats = new Map();
  for (const attempt of attempts) {
    const patternId = attempt.pattern_id || '__UNSPECIFIED__';
    if (!stats.has(patternId)) {
      stats.set(patternId, { total: 0, correct: 0 });
    }
    const entry = stats.get(patternId);
    entry.total += 1;
    if (attempt.is_correct) {
      entry.correct += 1;
    }
  }
  const weights = {};
  for (const [patternId, entry] of stats.entries()) {
    const accuracy = entry.total > 0 ? entry.correct / entry.total : 0;
    weights[patternId] = Number((1 - accuracy).toFixed(4));
  }
  return weights;
}

function ensurePatternWeights(patternWeights, patterns) {
  const result = { ...patternWeights };
  for (const pattern of patterns) {
    if (!(pattern in result)) {
      result[pattern] = 1.0;
    }
  }
  return result;
}

function buildCandidates(questionIds, content) {
  const candidates = [];
  for (const id of questionIds) {
    const entry = content.getQuestionIndex(id);
    if (!entry) {
      continue;
    }
    candidates.push({
      question_id: id,
      pattern_id: entry.pattern_id || '__UNSPECIFIED__',
      difficulty: Number.isInteger(entry.difficulty_level) ? entry.difficulty_level : null
    });
  }
  return candidates;
}

function filterByTags(content, tags, mode) {
  const tagIndex = content.getTagIndex();
  if (!tags || tags.length === 0) {
    if (mode === 'tag') {
      return [];
    }
    return content.getAllQuestionIds();
  }
  if (!tagIndex || !tagIndex.tags) {
    return [];
  }
  const ids = new Set();
  for (const tag of tags) {
    const patterns = tagIndex.tags[tag];
    if (!patterns) {
      continue;
    }
    for (const questionIds of Object.values(patterns)) {
      for (const questionId of questionIds) {
        ids.add(questionId);
      }
    }
  }
  return Array.from(ids);
}

function pickFromPattern(patternPool, targetDifficulty, rng) {
  const byDifficulty = patternPool.filter((item) =>
    targetDifficulty === null ? true : item.difficulty === targetDifficulty
  );
  const pool = byDifficulty.length > 0 ? byDifficulty : patternPool;
  if (pool.length === 0) {
    return null;
  }
  const choice = pool[Math.floor(rng() * pool.length)];
  return choice;
}

function generateCoreSession({
  candidates,
  size,
  recommendedDifficulty,
  patternWeights,
  seedParts
}) {
  if (candidates.length === 0) {
    return { error: 'NO_CANDIDATES' };
  }
  const difficultyPlan = buildDifficultyPlan(size, recommendedDifficulty);
  const patterns = Array.from(new Set(candidates.map((item) => item.pattern_id)));
  const weights = ensurePatternWeights(patternWeights, patterns);

  const rng = mulberry32(hashSeed(seedParts.join('|')));

  const patternPools = new Map();
  for (const item of candidates) {
    if (!patternPools.has(item.pattern_id)) {
      patternPools.set(item.pattern_id, []);
    }
    patternPools.get(item.pattern_id).push(item);
  }
  for (const [patternId, pool] of patternPools.entries()) {
    patternPools.set(patternId, shuffleWithRng(pool, rng));
  }

  const orderedPatterns = shuffleWithRng(patterns, rng).sort((a, b) =>
    weights[b] - weights[a]
  );

  const selected = [];
  const patternCounts = {};
  let lastPattern = null;
  let streak = 0;

  function consumePick(pick, patternId, pool) {
    selected.push(pick.question_id);
    patternCounts[patternId] = (patternCounts[patternId] || 0) + 1;
    if (pool) {
      const index = pool.indexOf(pick);
      if (index >= 0) {
        pool.splice(index, 1);
      }
    }
    if (patternId === lastPattern) {
      streak += 1;
    } else {
      lastPattern = patternId;
      streak = 1;
    }
  }

  function pickPatternWeighted() {
    const available = orderedPatterns.filter((patternId) => (patternPools.get(patternId) || []).length > 0);
    if (available.length === 0) {
      return null;
    }
    const totalWeight = available.reduce((sum, patternId) => sum + (weights[patternId] || 0), 0);
    if (totalWeight <= 0) {
      return available[Math.floor(rng() * available.length)];
    }
    let threshold = rng() * totalWeight;
    for (const patternId of available) {
      threshold -= weights[patternId] || 0;
      if (threshold <= 0) {
        return patternId;
      }
    }
    return available[available.length - 1];
  }

  for (const patternId of orderedPatterns) {
    if (selected.length >= size) {
      break;
    }
    const pool = patternPools.get(patternId) || [];
    if (pool.length === 0) {
      continue;
    }
    if (streak >= 2 && patternId === lastPattern) {
      continue;
    }
    const slot = pickDifficultySlot(difficultyPlan, rng);
    const target = slot ? difficultyFromSlot(slot, recommendedDifficulty) : null;
    const pick = pickFromPattern(pool, target, rng);
    if (pick) {
      consumePick(pick, patternId, pool);
    }
  }

  while (selected.length < size) {
    const slot = pickDifficultySlot(difficultyPlan, rng);
    const target = slot ? difficultyFromSlot(slot, recommendedDifficulty) : null;
    let patternId = pickPatternWeighted();
    if (!patternId) {
      break;
    }
    if (streak >= 2 && patternId === lastPattern) {
      const fallback = orderedPatterns.find((id) => id !== lastPattern && (patternPools.get(id) || []).length > 0);
      if (fallback) {
        patternId = fallback;
      }
    }
    const pool = patternPools.get(patternId) || [];
    if (pool.length === 0) {
      break;
    }
    const pick = pickFromPattern(pool, target, rng) || pool[0];
    if (!pick) {
      break;
    }
    consumePick(pick, patternId, pool);
  }

  return {
    question_ids: selected,
    pattern_counts: patternCounts,
    pattern_weights: weights,
    difficulty_plan: difficultyPlan
  };
}

function generateSession({
  mode,
  tags,
  targetDifficulty,
  size,
  userId,
  attempts,
  content
}) {
  const recommendedDifficulty = calculateRecommendedDifficulty(attempts, targetDifficulty);

  if (mode === 'review') {
    const wrongAttempts = attempts.filter((attempt) => !attempt.is_correct);
    const wrongPatterns = new Map();
    for (const attempt of wrongAttempts) {
      const patternId = attempt.pattern_id || '__UNSPECIFIED__';
      wrongPatterns.set(patternId, (wrongPatterns.get(patternId) || 0) + 1);
    }
    const reviewDifficulty = Math.max(1, recommendedDifficulty - 1);
    const reviewSize = size <= 2 ? size : size <= 4 ? 2 : 3;
    const recentQuestionIds = new Set(attempts.slice(-5).map((attempt) => attempt.question_id));

    const reviewQuestionIds = content.getAllQuestionIds().filter((id) => {
      if (recentQuestionIds.has(id)) {
        return false;
      }
      const entry = content.getQuestionIndex(id);
      if (!entry) {
        return false;
      }
      const patternId = entry.pattern_id || '__UNSPECIFIED__';
      if (!wrongPatterns.has(patternId)) {
        return false;
      }
      if (Number.isInteger(entry.difficulty_level) && entry.difficulty_level !== reviewDifficulty) {
        return false;
      }
      return true;
    });

    const reviewCandidates = buildCandidates(reviewQuestionIds, content);
    if (wrongPatterns.size === 0 || reviewCandidates.length === 0) {
      const fallbackTags = tags && tags.length > 0 ? tags : [];
      return generateSession({
        mode: fallbackTags.length > 0 ? 'tag' : 'daily',
        tags: fallbackTags,
        targetDifficulty,
        size,
        userId,
        attempts,
        content
      });
    }
    const reviewWeights = Object.fromEntries(wrongPatterns.entries());
    const reviewSeed = [
      mode,
      String(reviewDifficulty),
      String(reviewSize),
      userId,
      JSON.stringify(reviewWeights)
    ];
    const review = generateCoreSession({
      candidates: reviewCandidates,
      size: reviewSize,
      recommendedDifficulty: reviewDifficulty,
      patternWeights: reviewWeights,
      seedParts: reviewSeed
    });

    const remainingSize = size - (review.question_ids ? review.question_ids.length : 0);
    if (remainingSize <= 0) {
      return {
        session_id: crypto.randomUUID(),
        question_ids: review.question_ids || [],
        recommended_difficulty: recommendedDifficulty,
        time_budget: (review.question_ids || []).reduce((sum, questionId) => {
          const entry = content.getQuestionIndex(questionId);
          const diff = Number.isInteger(entry?.difficulty_level) ? entry.difficulty_level : recommendedDifficulty;
          return sum + (TIME_BUDGET_SECONDS[diff] || TIME_BUDGET_SECONDS[recommendedDifficulty] || 120);
        }, 0),
        explain: {
          mode,
          tags,
          difficulty_plan: review.difficulty_plan,
          pattern_weights: review.pattern_weights,
          pattern_counts: review.pattern_counts
        }
      };
    }

    const tagIds = tags && tags.length > 0 ? filterByTags(content, tags, 'tag') : content.getAllQuestionIds();
    const mainCandidates = buildCandidates(tagIds, content).filter((item) =>
      !(review.question_ids || []).includes(item.question_id)
    );
    const attemptsByPattern = computePatternWeights(attempts);
    const mainSeed = [
      'main',
      (tags || []).join(','),
      String(targetDifficulty ?? ''),
      String(remainingSize),
      userId,
      JSON.stringify(attemptsByPattern)
    ];
    const main = generateCoreSession({
      candidates: mainCandidates,
      size: remainingSize,
      recommendedDifficulty,
      patternWeights: attemptsByPattern,
      seedParts: mainSeed
    });

    const allQuestions = [...(review.question_ids || []), ...(main.question_ids || [])];
    const combinedPatternCounts = { ...review.pattern_counts };
    for (const [patternId, count] of Object.entries(main.pattern_counts || {})) {
      combinedPatternCounts[patternId] = (combinedPatternCounts[patternId] || 0) + count;
    }

    const totalBudget = allQuestions.reduce((sum, questionId) => {
      const entry = content.getQuestionIndex(questionId);
      const diff = Number.isInteger(entry?.difficulty_level) ? entry.difficulty_level : recommendedDifficulty;
      return sum + (TIME_BUDGET_SECONDS[diff] || TIME_BUDGET_SECONDS[recommendedDifficulty] || 120);
    }, 0);

    return {
      session_id: crypto.randomUUID(),
      question_ids: allQuestions,
      recommended_difficulty: recommendedDifficulty,
      time_budget: totalBudget,
      explain: {
        mode,
        tags,
        difficulty_plan: {
          review: review.difficulty_plan,
          main: main.difficulty_plan
        },
        pattern_weights: {
          review: review.pattern_weights,
          main: main.pattern_weights
        },
        pattern_counts: combinedPatternCounts
      }
    };
  }

  const tagIds = filterByTags(content, tags, mode);
  const candidates = buildCandidates(tagIds, content);
  if (candidates.length === 0) {
    return { error: 'NO_CANDIDATES' };
  }

  const attemptsByPattern = computePatternWeights(attempts);
  const seedParts = [
    mode,
    (tags || []).join(','),
    String(targetDifficulty ?? ''),
    String(size),
    userId,
    JSON.stringify(attemptsByPattern)
  ];
  if (mode === 'daily') {
    const today = new Date().toISOString().slice(0, 10);
    seedParts.push(today);
  }

  const core = generateCoreSession({
    candidates,
    size,
    recommendedDifficulty,
    patternWeights: attemptsByPattern,
    seedParts
  });

  const totalBudget = (core.question_ids || []).reduce((sum, questionId) => {
    const entry = content.getQuestionIndex(questionId);
    const diff = Number.isInteger(entry?.difficulty_level) ? entry.difficulty_level : recommendedDifficulty;
    return sum + (TIME_BUDGET_SECONDS[diff] || TIME_BUDGET_SECONDS[recommendedDifficulty] || 120);
  }, 0);

  return {
    session_id: crypto.randomUUID(),
    question_ids: core.question_ids || [],
    recommended_difficulty: recommendedDifficulty,
    time_budget: totalBudget,
    explain: {
      mode,
      tags,
      difficulty_plan: core.difficulty_plan,
      pattern_weights: core.pattern_weights,
      pattern_counts: core.pattern_counts
    }
  };
}

module.exports = { generateSession };
