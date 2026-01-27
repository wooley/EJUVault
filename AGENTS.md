# Repository Guidelines

## Agent-Specific Instructions
H-0 总体执行原则（必须写在 Codex Prompt 开头）

在给 Codex 的总指令中，必须明确以下约束：
1. ❌ 不允许自行修改数据结构或字段含义
2. ❌ 不允许合并模块以“省事”
3. ❌ 不允许提前实现未解锁阶段的功能
4. ✅ 所有实现必须以本 SPEC 为唯一真源
5. ✅ 每个阶段完成后，先通过验收清单，再进入下一阶段

## Project Structure & Module Organization
- `src/` for the Express API (auth, attempts, grading)
- `scripts/` for build-time tools like the content indexer
- `schemas/content/` for JSON schema definitions
- `content/` for questions, answers, solutions, and specs
- `content/index/` for generated indexes (question/tag/pattern)
- `public/` for the training page assets (served by the API)

## Build, Test, and Development Commands
- `nvm use 20` then `npm install` to install backend dependencies
- `npm run dev` to start the Express API (`JWT_SECRET` required)
- `node scripts/content_indexer.js` to generate `content/index/*.json`

Environment setup uses `uv` for Python tooling and `nvm` for Node.js. Document the chosen workflow (e.g., `uv venv` + `uv pip install -r requirements.txt`, then `nvm use 20` + `npm install`).

## Coding Style & Naming Conventions
No style rules are declared. If you add a formatter or linter, capture the defaults here (e.g., 2-space indentation for JS/TS, 4-space for Python) and reference the tool (`prettier`, `eslint`, `ruff`, `gofmt`, etc.). Use descriptive, kebab-case file names (e.g., `math-helpers.ts`) unless the language favors another convention.

## Testing Guidelines
No testing framework is configured. When tests are introduced, state the framework and naming conventions (for example, `*.test.ts` in `tests/`). Include any coverage targets and how to run a focused subset (e.g., `npm test -- math-helpers`).

## Commit & Pull Request Guidelines
There is no Git history or commit convention to summarize. Establish a lightweight standard such as short, imperative messages (e.g., `Add fraction simplifier`) and link PRs to relevant issues. For PRs, include a brief description, screenshots for UI changes, and a quick note on how you tested.

## Configuration & Secrets
If the project adds local configuration (e.g., `.env`), provide a `.env.example` and avoid committing secrets. Document required keys and defaults. The API requires `JWT_SECRET`, and uses `DB_PATH` optionally (JSON file storage by default).
