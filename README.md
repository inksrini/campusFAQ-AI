# CAMPUS AI — Intelligent College FAQ Assistant

An AI-powered FAQ assistant for colleges. Students ask questions in natural language
("Can I use the library at 5 in the evening?"); the system finds the relevant trusted
FAQs using **semantic search (MongoDB Atlas Vector Search + Gemini embeddings)** and
generates a concise, grounded answer with **Google Gemini**.

## Meet NILA 

**NILA** is the AI assistant behind CAMPUS AI.

She helps students find answers about college life, academics, facilities, policies, and more  using information from the college's verified knowledge base.

> "Ask me anything about college. I'll try to save you from asking five people and getting six different answers."

### Why NILA?

NILA means **"moon" (நிலா)** in Tamil.

But there's another reason behind the name. Some names are chosen. Some names have a story.
This one does....🌙

> **The knowledge base is the source of truth.** Gemini never invents college facts —
> it only writes answers from the FAQs retrieved from MongoDB. If nothing relevant is
> found, the assistant says so and logs the question for admin review.



## Table of contents
1. [Problem statement & objectives](#1-problem-statement--objectives)
2. [Features](#2-features)
3. [Technology stack](#3-technology-stack)
4. [Architecture & data flow](#4-architecture--data-flow)
5. [Folder structure](#5-folder-structure)
6. [Prerequisites](#6-prerequisites)
7. [Installation](#7-installation)
8. [Environment variables](#8-environment-variables)
9. [MongoDB Atlas setup](#9-mongodb-atlas-setup)
10. [MongoDB Vector Search setup](#10-mongodb-vector-search-setup)
11. [Gemini API setup](#11-gemini-api-setup)
12. [Running the application](#12-running-the-application)
13. [Seed data](#13-seed-data)
14. [API overview](#14-api-overview)
15. [Authentication & roles](#15-authentication--roles)
16. [Semantic search explained](#16-semantic-search-explained)
17. [AI answer generation explained](#17-ai-answer-generation-explained)
18. [AI FAQ generation (admin)](#18-ai-faq-generation-admin)
19. [Testing with Postman](#19-testing-with-postman)

---

## 1. Problem statement & objectives

**Problem:** Students repeatedly ask the same questions (admissions, fees, exams,
library, hostel…). The office answers them one by one, and generic chatbots hallucinate
college-specific rules.

**Objectives:**
- Answer student questions instantly, in natural language.
- Ground every answer in a **college-maintained knowledge base** (no hallucination).
- Understand *meaning*, not just keywords (semantic search).
- Give admins full CRUD control, AI-assisted FAQ drafting, and a loop for closing
  knowledge gaps (unanswered-question review).

## 2. Features

| Feature | Where |
|---|---|
| AI question answering (RAG) | `POST /api/chat`, [index.html](client/index.html) |
| Semantic search (independently testable) | `POST /api/search`, `server/scripts/testSearch.js` |
| FAQ CRUD + auto embedding lifecycle | `POST/PATCH/DELETE /api/faqs` |
| Category CRUD with safe deletion (409) | `/api/categories` |
| Auth: register/login (bcrypt + JWT) | `/api/auth` |
| Role-based access control (public / user / creator / admin) | `server/middleware/auth.js` + `server/utils/faqAuthz.js` |
| Centralized error handling | `server/middleware/errorHandler.js` |
| Schema + request validation (3 layers) | models + `server/validators/` |
| AI FAQ draft generation (admin-reviewed) | `POST /api/admin/generate-faq-drafts` |
| Unanswered-question workflow | `/api/admin/unanswered` |
| Admin dashboard | [admin.html](client/admin.html) |
| Public FAQ browser | [browse.html](client/browse.html) |

## 3. Technology stack

| Layer | Technology |
|---|---|
| Backend | Node.js 24 LTS, Express 5 |
| Database | MongoDB Atlas + Mongoose |
| Vector search | MongoDB Atlas Vector Search (`$vectorSearch`) — **no external vector DB** |
| Frontend | HTML, CSS, Vanilla JavaScript (ES modules) — no frameworks |
| AI | Google Gemini API via the official `@google/genai` SDK (embeddings + generation) |
| Auth/security | JWT (`jsonwebtoken`), password hashing (`bcryptjs`), env vars (`dotenv`) |
| API testing | Postman / Thunder Client (`postman/CampusAI.postman_collection.json`) |

**Dependencies (7 total):** `express`, `mongoose`, `@google/genai`, `jsonwebtoken`,
`bcryptjs`, `dotenv`, `cors` (used only if you serve the client from a different origin).

## 4. Architecture & data flow

```
            ┌──────────────────────────────────────────────────┐
            │                     BROWSER                      │
            │   HTML + CSS + Vanilla JS  (client/)             │
            └───────────────┬──────────────────────────────────┘
                            │  fetch() → JSON (REST)
                            ▼
            ┌──────────────────────────────────────────────────┐
            │           EXPRESS SERVER  (server/)              │
            │  routes → middleware → controllers → services    │
            │  PUBLIC: health, reads, search, chat, auth       │
            │  ADMIN:  faq/category/user writes, /api/admin/*  │
            └──────┬───────────────────────────┬───────────────┘
                   │                           │
                   ▼                           ▼
   ┌───────────────────────────┐   ┌────────────────────────────┐
   │  MongoDB Atlas (Mongoose) │   │   Google Gemini API        │
   │  users, categories, faqs, │   │  • embeddings (text→vector)│
   │  unansweredquestions      │   │  • grounded answers        │
   │  ★ Atlas Vector Search    │   │  • FAQ drafts (admin-only) │
   │    index on faqs.embedding│   └────────────────────────────┘
   └───────────────────────────┘
```

**Question flow (RAG):**
1. Student types a question → `POST /api/chat { question }`.
2. Backend embeds the question (Gemini embedding model).
3. `$vectorSearch` finds the top-k FAQs by cosine similarity; results below
   `SIMILARITY_THRESHOLD` are dropped.
4. **Nothing found** → safe fallback answer + the question is stored in
   `unansweredquestions`. Gemini is **never called**.
5. **Relevant FAQs found** → numbered trusted context + question → Gemini writes
   a concise answer from that context only → response includes answer + sources.

**Knowledge flow:** admin creates/updates an FAQ → validator checks the body →
Mongoose validates the schema → the FAQ text is embedded and the vector is stored on
the document → the Atlas Vector Search index picks it up automatically (it reads the
collection continuously).

## 5. Folder structure

```
campus-ai/
├── client/                     Frontend (vanilla, served statically by Express)
│   ├── index.html              AI chat assistant (home)
│   ├── browse.html             Public category/FAQ browser
│   ├── login.html  register.html
│   ├── admin.html              Admin dashboard (5 tabs)
│   ├── css/styles.css          Shared stylesheet (light/dark aware, responsive)
│   └── js/
│       ├── api.js              THE only fetch() wrapper (JWT, envelope, errors)
│       ├── auth.js             token/user helpers, navbar, page guards
│       ├── chat.js  faq.js  admin.js  login.js   (one per page)
├── server/
│   ├── config/env.js           loads + validates .env (fail fast)
│   ├── config/db.js            Mongoose connection
│   ├── models/                 User, Category, FAQ (with embedding), UnansweredQuestion
│   ├── middleware/auth.js      requireAuth / optionalAuth / requireRole('admin')
│   ├── middleware/errorHandler.js  one error→JSON mapping for the whole app
│   ├── validators/             request-body validation (before the DB)
│   ├── controllers/            auth, users, categories, faqs, search, chat, admin
│   ├── services/               embeddingService, searchService, geminiService
│   ├── routes/                 /api wiring (7 groups + index)
│   ├── utils/                  ApiError, asyncHandler, responses
│   ├── scripts/seed.js         demo data + embeddings
│   ├── scripts/testSearch.js   semantic-search test (independent of Gemini answers)
│   ├── app.js                  express app assembly
│   └── server.js               entry point
├── postman/CampusAI.postman_collection.json
├── .env.example                template (never commit the real .env)
└── package.json
```

## 6. Prerequisites

- **Node.js 24 LTS** (project standard) — `node --version`
- A **MongoDB Atlas** account (free M0 tier is enough) — local MongoDB will NOT work
  because Vector Search is an Atlas feature. Cluster version ≥ 6.0.11 / 7.0.2.
- A **Google Gemini API key** — free tier is sufficient.

## 7. Installation

```bash
npm install
cp .env.example .env        # then fill in your real values (see §8)
```

## 8. Environment variables

Copy `.env.example` → `.env` and fill in:

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `NODE_ENV` | `development` / `production` |
| `MONGODB_URI` | Atlas connection string (includes DB name `campus-ai`) |
| `JWT_SECRET` | long random string — signs tokens |
| `JWT_EXPIRES_IN` | token lifetime (default `7d`) |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | generation model (e.g. `gemini-3.5-flash-lite`) |
| `GEMINI_EMBEDDING_MODEL` | embedding model (e.g. `gemini-embedding-001`) |
| `EMBEDDING_DIMENSIONS` | vector size — **must equal the Atlas index `numDimensions`** |
| `SIMILARITY_THRESHOLD` | minimum cosine score to accept a match (default 0.5) |
| `SEARCH_TOP_K` | how many FAQs are retrieved as context (default 4) |
| `BCRYPT_SALT_ROUNDS` | hashing cost (default 10) |

Model names live in env **only**: if Google deprecates a model, you change `.env`,
not the code. If you change the embedding model/dimensions: re-run
`node server/scripts/seed.js` (or re-embed all FAQs) **and** update the Atlas index.

## 9. MongoDB Atlas setup

1. Create a free account at <https://cloud.mongodb.com> → build an **M0 (free)** cluster.
2. **Database Access** → add a database user (username + password).
3. **Network Access** → add your IP (or `0.0.0.0/0` for a college demo; note the trade-off).
4. **Connect → Drivers** → copy the connection string into `MONGODB_URI`.
   URL-encode special characters in the password; keep `campus-ai` as the DB name:
   `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/campus-ai?retryWrites=true&w=majority`

## 10. MongoDB Vector Search setup

The Vector Search index **cannot be created from Mongoose** — it is an Atlas-side index:

1. In Atlas, open your cluster → **Atlas Search** tab (or "Search" under the cluster).
2. Click **Create Search Index** → choose the **`faqs`** collection → JSON editor.
3. Name it exactly **`faq_vector_index`** and paste:

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "category" }
  ]
}
```

4. `numDimensions` MUST equal `EMBEDDING_DIMENSIONS` (default 768). A mismatch breaks
   every query.
5. Wait until the index status is **ACTIVE** (a few minutes on an empty collection).

## 11. Gemini API setup

1. Visit <https://aistudio.google.com/apikey> → **Create API key**.
2. Put it in `.env` as `GEMINI_API_KEY`.
3. Models are configured in `.env` (`GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`). Verify
   current model names against the official docs at <https://ai.google.dev/gemini-api/docs>
   before your demo — Google ships new models regularly.
4. The SDK used is the **official current** `@google/genai` (`ai.models.embedContent` for
   vectors, `ai.models.generateContent` for answers/drafts).
5. The generation model is `gemini-3.5-flash-lite` — the Flash-lite endpoint
   serves less traffic, so busy demo hours rarely hit the 503 "high demand"
   errors the bigger Flash models return. Current Gemini models no longer accept
   legacy sampling parameters, so requests send only the model, prompt, and
   `systemInstruction` — deterministic grounding comes from the prompt, not
   from `temperature`. Transient 5xx responses are retried automatically
   (3 attempts, ~2s/~4s backoff with jitter).
   **Note:** if your existing `.env` still sets an older `GEMINI_MODEL`, that
   value overrides the code default — update it to `gemini-3.5-flash-lite`.

## 12. Running the application

```bash
npm start          # production-style start
npm run dev        # auto-restart on file changes (node --watch)
```

Expected console output:

```
[db] Connected to MongoDB Atlas (database: campus-ai)
[server] Campus AI running on http://localhost:3000
[server] API base: http://localhost:3000/api  (try GET /api/health)
```

Open <http://localhost:3000> — the assistant is the home page.

## 13. Seed data

```bash
npm run seed
```

Creates (idempotent — wipes the 4 collections first):
- **DEMO accounts (development/demo credentials — never reuse in production):**
  `admin@campus.ai / Admin@12345` (admin) ·
  `creator@campus.ai / Creator@12345` (creator) ·
  `student@campus.ai / Student@12345` (user)
- **10 categories:** Admissions, Fees, Courses, Examinations, Library, Hostel, Transport, Placements, Scholarships, General
- **~30 realistic FAQs**, each embedded via Gemini (300 ms pause between calls for free-tier limits).

Run the seed **before** creating the Vector Search index (the index builds over the
existing collection). Then verify retrieval independently of the answer AI:

```bash
node server/scripts/testSearch.js "can I use the library at 5 in the evening"
node server/scripts/testSearch.js "what is the principal's favourite colour" --all   # tune the threshold
```

`--all` prints raw scores with no threshold filter: pick `SIMILARITY_THRESHOLD`
between your "related" and "unrelated" score bands.

## 14. API overview

All responses use one envelope:
`{ "success": true, "data": ... }` or `{ "success": false, "message": "...", "errors?: [...] }`.

| Method | Endpoint | Auth | Role | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | – | – | liveness + DB status |
| POST | `/api/auth/register` | – | – | create student account |
| POST | `/api/auth/login` | – | – | returns `{ token, user }` |
| GET | `/api/auth/me` | JWT | user | current profile |
| GET | `/api/faqs` | – | – | list (`?category=&page=&limit=&q=`) |
| GET | `/api/faqs/:id` | – | – | single FAQ |
| GET | `/api/faqs/search?q=` | – | – | semantic search (public alias of `/api/search`) |
| POST | `/api/faqs` | JWT | creator, admin | create (embeds automatically; stamps `createdBy`) |
| PATCH | `/api/faqs/:id` | JWT | creator (own) / admin (any) | update (re-embeds when text changed) |
| DELETE | `/api/faqs/:id` | JWT | creator (own) / admin (any) | delete |
| POST | `/api/ai/generate-faq` | JWT | creator, admin | AI drafts for review (alias of the admin drafts route) |
| GET | `/api/categories` | – | – | list with faqCount |
| POST | `/api/categories` | JWT | admin | create |
| PATCH | `/api/categories/:id` | JWT | admin | rename |
| DELETE | `/api/categories/:id` | JWT | admin | **409** if FAQs still use it |
| POST | `/api/search` | – | – | semantic search, raw scored matches |
| POST | `/api/chat` | – (optional JWT) | – | full RAG answer |
| GET | `/api/users` | JWT | admin | list users |
| PATCH | `/api/users/:id` | JWT | admin | change name/role |
| DELETE | `/api/users/:id` | JWT | admin | delete user |
| GET | `/api/admin/unanswered` | JWT | admin | `?status=open` |
| PATCH | `/api/admin/unanswered/:id` | JWT | admin | `{ status }` resolve/dismiss |
| POST | `/api/admin/generate-faq-drafts` | JWT | creator, admin | drafts returned, **not saved** |
| GET | `/api/admin/stats` | JWT | admin | dashboard counts |

**Representative request/response examples**

```http
POST /api/auth/login
Content-Type: application/json
{ "email": "admin@campus.ai", "password": "Admin@12345" }
→ 200 { "success": true, "data": { "token": "eyJ...", "user": { "id": "...", "role": "admin", ... } } }
```

```http
POST /api/chat
Content-Type: application/json
{ "question": "Can I use the library at 5 in the evening?" }
→ 200 { "success": true, "data": {
    "answer": "The main library closes at 6 PM, but the reading hall stays open until 8 PM during exam months.",
    "sources": [ { "id": "...", "question": "What are the library working hours?", "categoryName": "Library", "score": 0.7812 } ],
    "answeredByKnowledgeBase": true,
    "topScore": 0.7812 } }
```

```http
POST /api/categories          (Authorization: Bearer <student-token>)
{ "name": "Sports" }
→ 403 { "success": false, "message": "You do not have permission to perform this action." }
```

**Status codes:** 200 OK · 201 Created · 400 bad body/id · 401 no/bad token or bad
credentials · 403 wrong role · 404 not found · 409 duplicate email/category or
category-delete blocked · 422 Mongoose validation · 500 unexpected · 502 Gemini
unavailable · 503 Vector Search index missing/not ready.

## 15. Authentication & roles

Four usage levels — the PUBLIC level needs no account:

| Level | Who | Can do |
|---|---|---|
| **Public User** | no token | view published FAQs & categories, semantic search, AI chat |
| **Authenticated User** | role `user` | everything public + login/profile |
| **Content Creator** | role `creator` | + create FAQs, edit/delete **own** FAQs, organize them in categories, generate AI FAQ drafts |
| **Admin** | role `admin` | everything + update/delete **any** FAQ, manage categories, manage users & roles, review drafts and unanswered questions, dashboard stats |

- Passwords are hashed with **bcrypt** (salt rounds from env) — plain text is never stored.
- Login returns a **JWT** containing `{ sub: userId, role }`, signed with `JWT_SECRET`.
- Clients send it as `Authorization: Bearer <token>`.
- `requireAuth` verifies the token **and reloads the user from the DB** — deleted users
  or demoted admins lose access immediately, even with an unexpired token.
- `requireAnyRole([...])` / `creatorOrAdmin` guard the write routes; `requireRole('admin')`
  guards management routes (users, categories, unanswered review, stats).
- `optionalAuth` attaches the user when a valid token exists but never blocks public
  routes (chat/search are public by design; it attributes unanswered questions).
- Responses never include password hashes (`toSafeJSON()` + `select: false`).

**401 vs 403 (enforced consistently):**
- **401 Unauthorized** — not authenticated: missing, invalid, expired or forged token,
  or a deleted account.
- **403 Forbidden** — authenticated, but this role lacks the permission (e.g. a `user`
  creating an FAQ, or a creator touching another creator's FAQ).

**FAQ ownership rules** — one reusable check (`server/utils/faqAuthz.js`) applied to
both PATCH and DELETE, so they can never drift apart:

| Who | May modify |
|---|---|
| `admin` | any FAQ (admin override) |
| `creator` | only FAQs where `createdBy === their own _id` |
| `creator` on another creator's FAQ | **403 Forbidden** |
| `user` / public | no FAQ write access at all |

Creating an FAQ (creator or admin) automatically stores the author's id in `createdBy`.
Roles are admin-controlled: public registration always creates role `user`; only an
admin can change roles (`PATCH /api/users/:id`).

## 16. Semantic search explained

**Keyword search** matches words. *"Can I use the library at 5 in the evening?"* shares
almost no words with *"What are the library working hours?"* — keyword search fails.

**Embeddings** map text to a vector (list of numbers) where **similar meaning ⇒ nearby
vectors**. Both questions above land close together in the vector space.

Pipeline (documents): `FAQ text → Gemini embedding model → faqs.embedding → Atlas index`
Pipeline (queries): `question → Gemini embedding (RETRIEVAL_QUERY) → $vectorSearch → top-k → threshold`

- Embeddings are generated on FAQ **create**, **update** (only when text actually
  changed), seed, and draft-approval — and per **question** at query time.
- `$vectorSearch` uses **cosine similarity** and returns `vectorSearchScore` (~0–1).
- The **threshold gate** (`SIMILARITY_THRESHOLD`, default 0.5) is deterministic: below
  it, no answer is generated and the question is logged as unanswered. Tune it with
  `scripts/testSearch.js --all`.
- Search is testable **independently** of Gemini answers: `POST /api/search` and the
  test script both stop after retrieval.

## 17. AI answer generation explained

- Gemini receives a **system instruction**: answer only from the numbered trusted
  context; if it's insufficient, reply with the exact fallback sentence; be concise;
  don't mention "context". Temperature 0.2 for consistency.
- The **frontend shows the sources** (category + score) under every AI answer, so users
  can see the grounding.
- If Gemini itself returns the fallback line, the chat treats it as unanswered.
- Gemini errors surface as **502** with a friendly message; index-not-ready as **503**.

## 18. AI FAQ generation (admin)

1. Admin opens **AI Drafts**, picks a category, enters a topic + **source notes**.
2. `POST /api/admin/generate-faq-drafts` → Gemini drafts JSON `{question, answer}` pairs.
3. Drafts are rendered as editable cards — **nothing is saved yet**.
4. Admin edits/approves → **Save as FAQ** → normal `POST /api/faqs` flow runs
   (validation → embedding → searchable instantly).

This keeps a human in the loop: AI-generated text never becomes trusted knowledge
without explicit admin approval.

## 19. Testing with Postman

Import `postman/CampusAI.postman_collection.json`. Set collection variables
`baseUrl` (`http://localhost:3000`) and `token` after login (the collection scripts do
this automatically when you run **Auth → Login** for admin, creator and student).

For the full role-based permission matrix (public/user/creator/admin, ownership 403s,
forged-token 401s), run against a seeded, running server:

```bash
npm run test:roles   # server/scripts/roleTest.js — 30+ live authorization checks
```

Recommended test sequence (negative cases included):

| # | Request | Expect |
|---|---|---|
| 1 | GET `/api/health` | 200, `database: "connected"` |
| 2 | POST `/api/auth/register` (valid) | 201 |
| 3 | POST `/api/auth/register` (short password) | 400 with field errors |
| 4 | POST `/api/auth/register` (duplicate email) | 409 |
| 5 | POST `/api/auth/login` (admin) → stores `token` | 200 |
| 6 | GET `/api/auth/me` (Bearer token) | 200 |
| 7 | GET `/api/faqs` (no token) | 200 — public read |
| 8 | POST `/api/faqs` **without** token | 401 |
| 9 | POST `/api/faqs` with **student** token | 403 |
| 10 | POST `/api/faqs` with admin token + invalid category id | 400 |
| 11 | POST `/api/faqs` with admin token (valid) | 201 (embedding generated) |
| 12 | PATCH `/api/faqs/:id` (change answer) | 200 (`embeddingUpdatedAt` bumped) |
| 13 | POST `/api/search` `{ "question": "library timings?" }` | 200 with scored matches |
| 14 | POST `/api/search` `{ "question": "who won the cricket world cup" }` | 200, empty `matches` |
| 15 | POST `/api/chat` (related question) | 200, grounded answer + sources |
| 16 | POST `/api/chat` (gibberish) | 200 fallback + unanswered logged |
| 17 | GET `/api/admin/stats` with student token | 403 |
| 18 | DELETE a category that has FAQs | 409 |
| 19 | DELETE an empty category | 200 |
| 20 | GET `/api/faqs/not-a-valid-id` | 400 (CastError mapping) |

