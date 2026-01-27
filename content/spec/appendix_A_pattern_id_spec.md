# 附录 A：pattern_id 设计与命名规范（EJU 数学）

## A-1. 设计原则

### 原则 1：pattern ≠ 知识点（tag）
- tag 回答“考什么”
- pattern 回答“怎么做”
- 同一 tag 下必须允许存在多个 pattern，否则无法有效提速

### 原则 2：pattern 是可自动化的解题动作模板
一个 pattern 必须满足：
- 看到题目后 10–20 秒内可识别
- 解题步骤高度固定
- 通过重复训练可显著降低耗时

### 原则 3：pattern 数量可控
- 初版建议：60–80 个
- 单一大 tag 下：3–10 个
- 允许版本化拆分，不追求一次性完美

---

## A-2. 命名规范（强制）

### 命名结构
```
<DOMAIN>_<MECHANISM>_<GOAL>
```

### DOMAIN（题材域）
- ALG：代数
- QF：二次函数
- SEQ：数列
- GEO：平面几何
- VEC：向量
- PROB：概率
- CALC：微积分
- INT：整数・数论
- DATA：统计

### MECHANISM（核心机制）
- DIRECT：直接代入 / 公式
- DISCRIMINANT：判别式
- INTERVAL：区间 / 数轴
- TRANSFORM：变形
- COUNT：计数
- ELIMINATION：消元
- CONSTRAINT：条件约束
- CASE：分类讨论
- PROJECTION：投影
- AREA：面积关系
- RATE：变化率

### GOAL（目标）
- SOLVE_X
- SOLVE_PARAM
- FIND_RANGE
- COUNT_INT
- MINMAX
- INTERSECTION
- LENGTH
- ANGLE
- PROBABILITY

---

## A-3. 初版 pattern 分类示例

### 二次函数（QF）
| pattern_id | 说明 |
|---|---|
| QF_DIRECT_VERTEX | 顶点公式 / 配方 |
| QF_DISCRIMINANT_SOLVE_PARAM | 判别式反推参数 |
| QF_INTERSECTION_COUNT | 交点个数 |
| QF_INTERVAL_INEQUALITY | 不等式区间 |
| QF_TRANSFORM_SHIFT | 平移 / 缩放 |

### 数列（SEQ）
| pattern_id | 说明 |
|---|---|
| SEQ_ARITH_DIRECT | 等差直代 |
| SEQ_GEOM_DIRECT | 等比直代 |
| SEQ_RECURR_LINEAR | 线性递推 |
| SEQ_SUM_FORMULA | 求和公式 |
| SEQ_CONSTRAINT_FIND_N | 条件反推项数 |

### 平面几何（GEO）
| pattern_id | 说明 |
|---|---|
| GEO_TRI_COSINE_SOLVE_SIDE | 余弦定理解边 |
| GEO_TRI_SINE_SOLVE_ANGLE | 正弦定理解角 |
| GEO_AREA_RATIO | 面积比 |
| GEO_PROJECTION_LENGTH | 投影长度 |
| GEO_SIMILAR_RATIO | 相似比 |

### 向量（VEC）
| pattern_id | 说明 |
|---|---|
| VEC_DOT_ANGLE | 点积求角 |
| VEC_DOT_ORTHO | 点积判垂直 |
| VEC_PROJECTION_LENGTH | 投影 |
| VEC_COORD_DIRECT | 坐标直代 |
| VEC_RATIO_INTERNAL | 内分外分 |

### 概率（PROB）
| pattern_id | 说明 |
|---|---|
| PROB_CLASSICAL_COUNT | 古典概率 |
| PROB_CONDITIONAL_TABLE | 条件概率表 |
| PROB_BINOMIAL | 二项分布 |
| PROB_EXPECTATION | 期望 |
| PROB_CASE_SPLIT | 分类讨论 |

---

## A-4. pattern 元信息字段

每个 pattern 在 patterns.current.json 中必须包含：
- trigger_rules：触发特征
- core_steps：核心步骤（3–6 条）
- common_errors：常见错误类型
- related_tags：关联知识点
- version：版本号

---

## A-5. 与调度和统计的绑定关系

- 调度：题单生成必须按 pattern 均衡覆盖
- 统计：正确率、耗时、超时率必须支持按 pattern 聚合
- 纠错：错题再练默认同 pattern、低一档难度
