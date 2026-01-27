# 附录 F：基于 Attempts 的反向校准方法论

## F-1. 校准目标
- 修正 difficulty
- 优化 pattern
- 校准 time_budget

---

## F-2. 校准原则
- 样本 ≥100 attempts
- ≥30 用户
- 只看正确且不超时

---

## F-3. Difficulty 校准
- 正确率过低 + 超时高 → 升级候选
- 正确率过高 + 超时低 → 降级候选

---

## F-4. Pattern 校准
- 方差大
- 错因分散
→ 拆分 pattern

---

## F-5. Time Budget 校准
- p75 明显超过预算
→ 上调 10–20%
