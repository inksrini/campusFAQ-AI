/**
 * server/scripts/smokeTest.js — boots the REAL Express app WITHOUT a database
 * and verifies everything that must work before MongoDB/Gemini are configured:
 *
 *   ✔ static frontend is served at /
 *   ✔ GET /api/health answers (reports DB "not connected")
 *   ✔ unknown routes get clean JSON 404s
 *   ✔ request validation rejects bad bodies (400 + field errors)
 *   ✔ protected routes reject missing/invalid tokens (401)
 *   ✔ Gemini failures come back as safe JSON (502), never crashes or leaks
 *
 * RUN:  node server/scripts/smokeTest.js
 * (No .env needed — env vars are injected below with throwaway values.)
 */
process.env.MONGODB_URI ??= 'mongodb://dummy:dummy@localhost:27017/smoke';
process.env.JWT_SECRET ??= 'smoke-test-secret-not-used-in-production';
process.env.GEMINI_API_KEY ??= 'smoke-test-key';

// NOTE: these imports MUST be dynamic — static imports are hoisted and would
// evaluate config/env.js (which exits on missing vars) BEFORE the assignments above.
const { createApp } = await import('../app.js');
const { connectDB } = await import('../config/db.js');

// Connect lazily; if MongoDB isn't reachable the app still serves (health
// will report "not connected"), which is exactly what we're testing here.
const mongoose = (await import('mongoose')).default;
mongoose.set('bufferTimeoutMS', 250); // fail fast instead of buffering without a DB
await connectDB({ exitOnFail: false }).catch(() => {});

const server = createApp().listen(0); // random free port
const base = `http://127.0.0.1:${server.address().port}`;

let passed = 0;
let failed = 0;

async function call(method, path, { body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* static file */ }
  return { status: res.status, json, contentType: res.headers.get('content-type') ?? '' };
}

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}

console.log('Smoke test against', base);

// 1. Static frontend
const home = await fetch(`${base}/`);
const homeHtml = await home.text();
check('GET / serves the chat page', home.ok && homeHtml.includes('chatForm'));

// 2. Health endpoint
const health = await call('GET', '/api/health');
check('GET /api/health answers', health.status === 200 && health.json?.success === true);
check('health reports DB state', ['connected', 'not connected'].includes(health.json?.data?.database));

// 3. Unknown route → clean JSON 404
const missing = await call('GET', '/api/does-not-exist');
check('unknown API route → JSON 404', missing.status === 404 && missing.json?.success === false);

// 4. Validation: bad register body → 400 with field errors
const badReg = await call('POST', '/api/auth/register', { body: { name: 'X', email: 'nope', password: '123' } });
check('register validation → 400', badReg.status === 400, `got ${badReg.status}`);
check('register validation lists errors', Array.isArray(badReg.json?.errors) && badReg.json.errors.length > 0);

// 5. Login with garbage → 400 (validator) not 500
const badLogin = await call('POST', '/api/auth/login', { body: { email: 'not-an-email', password: '' } });
check('login validation → 400', badLogin.status === 400, `got ${badLogin.status}`);

// 6. Protected route without token → 401
const noAuth = await call('GET', '/api/admin/stats');
check('admin route without token → 401', noAuth.status === 401, `got ${noAuth.status}`);

// 7. Protected route with forged token → 401
const forged = await call('GET', '/api/admin/stats', { token: 'forged.token.value' });
check('forged token → 401', forged.status === 401, `got ${forged.status}`);

// 8. Chat with an invalid Gemini key → safe 502 JSON (never a crash/stack)
const badChat = await call('POST', '/api/chat', { body: { question: 'when does the library close' } });
check('chat with dead Gemini key → 502 JSON', badChat.status === 502 && badChat.json?.success === false, `got ${badChat.status}`);
check('no stack trace leaked', !JSON.stringify(badChat.json ?? {}).includes('at '));

// 9. DB-touching route without a DB → clean JSON failure, no hang
const login = await call('POST', '/api/auth/login', { body: { email: 'a@b.co', password: 'whatever123' } });
check('login without DB → clean JSON failure', login.json?.success === false, `got ${login.status}`);

// 10. Method not allowed / weird method
const weird = await call('DELETE', '/api/health');
check('DELETE /api/health → clean 404', weird.status === 404, `got ${weird.status}`);

// 11. Search category filter validation (runs BEFORE any Gemini/network call)
const badCat = await call('POST', '/api/search', {
  body: { question: 'when does the library close', categoryId: 'not-a-real-id' },
});
check('search with invalid categoryId → 400', badCat.status === 400, `got ${badCat.status}`);

// 12. Chat is public even with a BAD token: optionalAuth must never block it.
// (Expected status here is 502 because the test key is fake — anything except
//  401/403 proves the request proceeded anonymously.)
const chatBadToken = await call('POST', '/api/chat', {
  body: { question: 'when does the library close' },
  token: 'forged.token.value',
});
check('chat with invalid token → NOT blocked (no 401/403)',
  chatBadToken.status !== 401 && chatBadToken.status !== 403,
  `got ${chatBadToken.status}`);

// 13. ROLE MODEL — offline-verifiable authorization gates.
// (These guards fire BEFORE any DB access, so they hold without MongoDB.)
const faqNoAuth = await call('POST', '/api/faqs', {
  body: { question: 'Anonymous FAQ?', answer: 'Should be rejected with 401.', category: '0'.repeat(24) },
});
check('POST /api/faqs without token → 401', faqNoAuth.status === 401, `got ${faqNoAuth.status}`);

const faqForged = await call('POST', '/api/faqs', {
  token: 'forged.token.value',
  body: { question: 'Forged FAQ?', answer: 'Should be rejected with 401.', category: '0'.repeat(24) },
});
check('POST /api/faqs with forged token → 401', faqForged.status === 401, `got ${faqForged.status}`);

const aiNoAuth = await call('POST', '/api/ai/generate-faq', {
  body: { topic: 'x', notes: 'y'.repeat(20) },
});
check('POST /api/ai/generate-faq without token → 401', aiNoAuth.status === 401, `got ${aiNoAuth.status}`);

const searchAlias = await call('GET', '/api/faqs/search?q=when%20does%20the%20library%20close');
check('GET /api/faqs/search is public (no 401/403)',
  searchAlias.status !== 401 && searchAlias.status !== 403,
  `got ${searchAlias.status}`); // 502 here = reached the (fake-key) Gemini call via the shared service

server.close();
console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
