# Startup Guide

This guide covers running the current Express API and the training/admin pages.

## Prerequisites
- Node.js (recommended via `nvm`, e.g. Node 20)
- The content index must exist (`content/index/question_index.json`)

## 1) Install dependencies
```bash
nvm use 20
npm install
```
If you are not using nvm, ensure `node -v` is compatible and run `npm install`.

## 2) Generate content indexes
```bash
node scripts/content_indexer.js
```
This builds:
- `content/index/question_index.json`
- `content/index/tag_index.json`
- `content/index/pattern_index.json`
- `content/index/integrity_report.json`

Generate exercise HTML from `content/exercise` (Markdown Preview Enhanced engine):
```bash
node scripts/exercise_html_indexer.js
```
This builds:
- `content/index/exercise_html_index.json`
- `content/index/exercise_html/**.html`

Generate solution HTML from `content/solutions` (Markdown Preview Enhanced engine):
```bash
node scripts/solution_html_indexer.js
```
This builds:
- `content/index/solution_html_index.json`
- `content/index/solution_html/**.html`

## 3) Start the API server
```bash
JWT_SECRET=devsecret npm run dev
```
Optional:
- `DB_PATH=data/app.json` (default)
- `AUTH_DEBUG_CODE=true` (returns the verification code in responses for local testing)
- `ADMIN_TOKEN=adminsecret` (protect admin endpoints)
- `HOST=0.0.0.0` (binds to all IPv4 interfaces for LAN access)

Server will run at `http://localhost:3000`.

Optional: normalize answers into the unified format:
```bash
node scripts/normalize_answers.js
```

Landing page:
- Open `http://localhost:3000/` for the main entry page (includes login link).

## 4) Auth flow (for training)
Email login with verification code:
```bash
curl -s -X POST http://localhost:3000/auth/request-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com"}'
```
If `AUTH_DEBUG_CODE=true`, the response includes `debug_code`.

Verify the code and get a JWT:
```bash
curl -s -X POST http://localhost:3000/auth/verify-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","code":"123456"}'
```

## 5) Generate a session
```bash
curl -s -X POST http://localhost:3000/sessions/generate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <JWT>' \
  -d '{"mode":"tag","tags":["二次関数"],"target_difficulty":3,"size":5}'
```
Copy the returned `session_id`.

## 6) Open the training page
Visit:
```
http://localhost:3000/train/session/<session_id>
```
Paste the JWT token into the page when prompted.

Student workflow (UI):
1. Complete step 4/5 to obtain a JWT and `session_id`.
2. Open the training page URL.
3. Paste the JWT token into the “Access Token” panel.
4. Answer each question (single-character inputs auto-advance).
5. Submit to see correctness and (if wrong) solution details.

Alternative: use the login page
1. Open `http://localhost:3000/login`.
2. Enter your email to login (no code required).
3. You will be redirected to the session builder at `/session/new`.

Admin tools (separate pages):
- `http://localhost:3000/admin` (dashboard)
- `http://localhost:3000/admin/exams` (exam browser, structured by section/order)
- `http://localhost:3000/admin/integrity` (integrity report)
- `http://localhost:3000/admin/calibration` (calibration candidates)
- `http://localhost:3000/admin/question/<question_id>/edit` (question editor)

## 7) Admin console (optional)
Open:
```
http://localhost:3000/admin
```
If `ADMIN_TOKEN` is set, enter it in the admin page to load integrity/search/calibration data.
