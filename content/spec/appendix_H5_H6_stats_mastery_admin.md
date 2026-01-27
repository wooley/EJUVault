# 附录 H-5/H-6：统计、掌握度与校准规范

本规范用于阶段五/六实现的唯一真源。

## H5-1. 统计 API

### 维度
- tag / pattern / difficulty

### 指标定义（见附录 B）
- accuracy: 正确 attempts 数 / attempts 总数
- median_duration: 仅统计正确且不超时的 duration_ms 中位数
- p75_duration: 仅统计正确且不超时的第 75 百分位 duration_ms
- overtime_rate: duration_ms > time_budget 的 attempts 占比
- sign_error_rate: 若 expected 为 '-' 而 actual 为数字，或 expected 为数字而 actual 为 '-'，计为 sign error

### 统计范围
- 默认统计全部 attempts，可通过 window_days 参数限制时间范围

## H5-2. Mastery 更新

### 范围
- 按 user_id + pattern_id 统计
- 使用该 pattern 最近 10 次 attempts

### 状态判定（附录 B-6）
- 升级条件: accuracy ≥ 0.8 且 overtime_rate ≤ 0.2 且 连续正确 ≥ 3
- 降级条件: accuracy ≤ 0.5 或 overtime_rate ≥ 0.6
- “会但慢”: accuracy ≥ 0.8 且 overtime_rate > 0.2

### 输出字段
- user_id, pattern_id
- accuracy, overtime_rate, consecutive_correct
- status: promote | demote | accurate_but_slow | steady
- updated_at

## H5-3. 错题再练

- review 模式仅选取错题 pattern
- 难度设为推荐难度 -1（最低 1）
- 每次 session 前 2–3 题为 review，其余回归主难度
- review 题目避免与最近 5 次 attempts 重复；如无候选可降级该约束

## H6-1. 管理端内容检查

- integrity_report 展示
- 按 tag / pattern 搜索题目

## H6-2. 校准候选输出

### 样本门槛（附录 F）
- attempts ≥100
- 用户 ≥30
- 仅统计正确且不超时 attempts

### difficulty_adjustment_candidates
- correct_rate < 0.5 且 overtime_rate > 0.4 → upgrade
- correct_rate > 0.9 且 overtime_rate < 0.1 → downgrade

### pattern_split_candidates
- pattern 内各题正确率方差 > 0.2 且样本满足门槛

### time_budget_adjustment_candidates
- p75_duration > time_budget * 1.1 → increase_10_20_percent
