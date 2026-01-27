# 附录 H-3：题单生成与 Pattern 调度规范

本规范用于阶段三实现的唯一真源。

## H3-1. Session Generator

### 输入
- mode: "tag" | "review" | "daily"
- tags: string[]
- target_difficulty: integer | null
- size: integer

### 输出
- session_id: string (UUID)
- question_ids: string[]
- recommended_difficulty: integer
- time_budget: integer（秒，总时长）
- explain: object（用于可解释性）

### 约束
- size 必须 > 0
- mode=tag 时 tags 不能为空
- 结果应可复现：同样输入 + 同样历史 attempts -> 同样输出

## H3-2. Pattern 均衡调度

### 规则
- 同一 session 内尽量覆盖所有 pattern
- 避免连续 3 题同一 pattern（如无法满足，允许降级）
- 剩余题量向弱 pattern 倾斜

### 弱 pattern 定义
- 基于用户 attempts 按 pattern 聚合
- 准确率越低，权重越高
- 没有 attempts 的 pattern 视为弱（权重提高）

## H3-3. 难度配方

默认配方（以推荐难度为中心）：
- 60% 当前难度
- 20% 低一档
- 20% 高一档

### 推荐难度
- 若提供 target_difficulty，则推荐难度=target_difficulty
- 否则：取最近 50 条 attempts 的众数难度；若无 attempts，默认 3

### 时间预算
单题时间预算（秒）：
- 难度 1 → 60
- 难度 2 → 90
- 难度 3 → 120
- 难度 4 → 180
- 难度 5 → 240

总 time_budget = 题单中每题预算之和

## H3-4. 可解释性
explain 必须包含：
- difficulty_plan: { low, current, high }
- pattern_weights: { pattern_id: weight }
- pattern_counts: { pattern_id: count }
- mode, tags
