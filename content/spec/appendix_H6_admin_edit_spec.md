# 附录 H-6：管理端编辑与答案统一化规范

本规范用于阶段六管理端编辑功能的唯一真源。

## H6-3. 统一答案格式（方案 B）

### 目标
- 将所有答案归一化为 question_id -> group -> string 的扁平结构。
- 原始 answers 文件保留，仅新增统一化文件供系统读取与编辑。

### 文件位置
- `content/answers/normalized.json`

### 结构
```json
{
  "schema_version": "v1",
  "generated_at": "ISO-8601",
  "answers": {
    "<question_id>": {
      "<group>": "<string>"
    }
  }
}
```

### 规则
- group 为题目空格组名（如 "AB", "C", "FG"）。
- value 为严格字符序列（允许字符集由题目 blank_rules 决定）。
- 统一化导入脚本负责从现有 answers 文件解析并写入 normalized.json。

## H6-4. 题目编辑权限

- 仅管理员可写（管理员 API 需 `x-admin-token` 且与 `ADMIN_TOKEN` 一致）。

## H6-5. 可编辑字段（题目 JSON）

允许修改：
- `original_ja.text`
- `translation_zh.text`
- `original_ja.placeholders`
- `blanks`
- `blank_rules`
- `tags`
- `pattern_id`
- `difficulty.level`
- `solution_outline` 或 `solution.outline`
- `solution_ref`
- `images`（新增字段，见 H6-6）

## H6-6. 插图规范

### 存储路径
- `content/assets/<question_id>/<filename>`

### 题目字段
```json
"images": [
  { "path": "content/assets/<question_id>/<filename>", "caption": "..." }
]
```

### 规则
- 上传后需写入题目 JSON `images`。
- 题面显示可在前端自由扩展，本阶段仅提供存储与读取。

## H6-7. 管理端编辑功能

必须支持：
- 按 exam_id 查看试卷内题目列表
- 编辑题目 JSON（字段见 H6-5）
- 编辑统一化答案（normalized.json）
- 上传插图并写入 images
