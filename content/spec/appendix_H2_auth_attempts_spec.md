# 附录 H-2：账户系统与 Attempts 数据管道规范

本规范用于阶段二实现的唯一真源。

## H2-1. Auth（Email + 验证码）

### 目标
- 无密码登录
- Email + 验证码
- Token 可长期有效（30 天）

### 数据字段
- email: string
- code: string（6 位数字）
- expires_at: datetime（请求后 10 分钟）
- requested_at: datetime
- consumed_at: datetime | null
- user_id: string（UUID）

### 接口
- POST /auth/request-code
  - body: { email }
  - 校验 email 格式
  - 同一 email 60 秒内只能请求一次
  - 返回 { sent: true, ttl_seconds: 600 }
  - 发送方式由服务端实现（无外部邮件服务时可输出到服务器日志）
- POST /auth/verify-code
  - body: { email, code }
  - 校验 code 正确且未过期、未使用
  - 返回 { token, user_id, expires_in_days: 30 }

### Token
- JWT 或等价方案
- payload 至少包含: sub=user_id, email
- 有效期 30 天

## H2-2. Attempts 存储

### Attempts 字段（必须 100% 对齐）
- user_id: string
- question_id: string
- answers_user: object（group -> string）
- answers_correct: object（group -> string）
- is_correct: boolean
- per_blank: object（blank_id -> { expected, actual, is_correct }）
- duration_ms: integer
- difficulty: integer | null
- tags: string[]
- pattern_id: string | null
- created_at: datetime

### 约束
- 未登录用户不能写入 attempts
- attempts 必须可完整还原一次作答
- answers_correct 只在提交后返回，不提供预取接口

## H2-3. 判题规则（Strict Match）

### 输入合法性
- 若题目含 blank_rules.allowed_chars，则以该集合为准
- 否则默认允许字符集: {'-', '0'..'9'}

### 判题
- 不进行数值计算、不做表达式解析
- 每个 blank 使用字符级严格匹配
- 缺失 blank 视为错误

## H2-4. 内容依赖
- 从 H-1 index 读取 question 元数据
- 从 content/answers 解析正确答案
