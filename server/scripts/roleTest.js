/**
 * scripts/roleTest.js — LIVE role-based permission tests (the full 16-point
 * matrix from the role-alignment requirements).
 *
 * REQUIRES (offline checks live in smokeTest.js / `npm test` instead):
 *   1. a reachable MongoDB Atlas + configured .env
 *   2. `npm run seed` completed
 *   3. the server running: `npm start`
 *
 * RUN from a second terminal:  npm run test:roles
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;
const tokens = {};

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}

async function call(method, path, { body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

async function login(email, password) {
  const r = await call('POST', '/api/auth/login', { body: { email, password } });
  if (!r.json?.success) throw new Error(`Login failed for ${email}: ${r.json?.message ?? r.status}`);
  return r.json.data.token;
}

async function main() {
  // Tokens for all three roles (seeded demo accounts).
  tokens.admin = await login('admin@campus.ai', 'Admin@12345');
  tokens.creator = await login('creator@campus.ai', 'Creator@12345');
  tokens.user = await login('student@campus.ai', 'Student@12345');
  check('login works for all three seeded roles', true);

  // A second creator is needed to prove creator-vs-creator 403s.
  const c2 = await call('POST', '/api/auth/register', {
    body: { name: 'Second Creator', email: 'creator2@campus.ai', password: 'Creator@99999' },
  });
  if (c2.status === 201) {
    tokens.creator2 = await login('creator2@campus.ai', 'Creator@99999');
  } else {
    tokens.creator2 = await login('creator2@campus.ai', 'Creator@99999'); // already seeded from a prior run
  }

  const categoryId = (await call('GET', '/api/categories')).json.data.items[0].id;

  console.log('\n— Public user (no token) —');
  check('1. public GET /api/faqs', (await call('GET', '/api/faqs')).status === 200);
  const pubSearch = await call('POST', '/api/search', { body: { question: 'library timings?' } });
  check('2. public POST /api/search', pubSearch.status === 200 && pubSearch.json.success);
  const pubChat = await call('POST', '/api/chat', { body: { question: 'library timings?' } });
  check('3. public POST /api/chat', pubChat.status === 200 && pubChat.json.success);
  check('15a. public cannot POST /api/faqs', (await call('POST', '/api/faqs', {
    body: { question: 'nope', answer: 'should be 401', category: categoryId },
  })).status === 401);
  check('15b. public cannot list users', (await call('GET', '/api/users')).status === 401);
  check('15c. public cannot read unanswered', (await call('GET', '/api/admin/unanswered')).status === 401);

  console.log('\n— Authenticated user (role: user) —');
  check('4a. user cannot POST /api/faqs', (await call('POST', '/api/faqs', {
    token: tokens.user,
    body: { question: 'user faq?', answer: 'should be 403', category: categoryId },
  })).status === 403);
  check('12. user cannot generate AI FAQ drafts', (await call('POST', '/api/ai/generate-faq', {
    token: tokens.user,
    body: { topic: 'library', notes: 'Official notice text with enough facts to draft from.' },
  })).status === 403);
  check('12b. user cannot use the admin draft route either', (await call('POST', '/api/admin/generate-faq-drafts', {
    token: tokens.user,
    body: { topic: 'library', notes: 'Official notice text with enough facts to draft from.' },
  })).status === 403);
  check('14a. user cannot GET /api/users', (await call('GET', '/api/users', { token: tokens.user })).status === 403);
  check('14b. user cannot PATCH /api/users/:id', (await call('PATCH', `/api/users/${'0'.repeat(24)}`, {
    token: tokens.user, body: { role: 'admin' },
  })).status === 403);
  check('14c. user cannot manage categories', (await call('POST', '/api/categories', {
    token: tokens.user, body: { name: 'Nope Category' },
  })).status === 403);

  console.log('\n— Content creator (ownership-based) —');
  const mine = await call('POST', '/api/faqs', {
    token: tokens.creator,
    body: {
      question: 'Creator-owned test FAQ?',
      answer: 'Created by the creator demo account for the role test.',
      category: categoryId,
    },
  });
  check('5. creator can POST /api/faqs', mine.status === 201, `got ${mine.status}`);
  check('5b. createdBy stamped with the creator', String(mine.json?.data?.faq?.createdBy) !== 'null' && mine.json?.data?.faq?.createdBy !== undefined);
  const myId = mine.json?.data?.faq?.id;
  const other = await call('POST', '/api/faqs', {
    token: tokens.creator2,
    body: {
      question: 'Other creator test FAQ?',
      answer: 'Created by creator2 for the ownership test.',
      category: categoryId,
    },
  });
  const otherId = other.json?.data?.faq?.id;
  check('6. creator can PATCH own FAQ', (await call('PATCH', `/api/faqs/${myId}`, {
    token: tokens.creator,
    body: { answer: 'Updated by its owner (creator).' },
  })).status === 200);
  check('7. creator cannot PATCH another creator FAQ (403)', (await call('PATCH', `/api/faqs/${otherId}`, {
    token: tokens.creator,
    body: { answer: 'hijack attempt' },
  })).status === 403);
  check('9a. creator cannot DELETE another creator FAQ (403)', (await call('DELETE', `/api/faqs/${otherId}`, {
    token: tokens.creator,
  })).status === 403);
  check('11. creator can generate AI FAQ drafts', (await call('POST', '/api/ai/generate-faq', {
    token: tokens.creator,
    body: { topic: 'library rules', notes: 'Laptops are issued for 3 days. Printing costs 2 rupees per page.' },
  })).status === 200);
  check('11b. creator cannot access admin-only management', (await call('GET', '/api/admin/stats', { token: tokens.creator })).status === 403);
  check('14d. creator cannot GET /api/users', (await call('GET', '/api/users', { token: tokens.creator })).status === 403);
  check('14e. creator cannot manage categories', (await call('POST', '/api/categories', {
    token: tokens.creator, body: { name: 'Creator Category' },
  })).status === 403);

  console.log('\n— Admin (full authority) —');
  check('10a. admin can PATCH any FAQ', (await call('PATCH', `/api/faqs/${otherId}`, {
    token: tokens.admin, body: { answer: 'Admin updated this FAQ.' },
  })).status === 200);
  check('10b. admin can DELETE any FAQ', (await call('DELETE', `/api/faqs/${myId}`, { token: tokens.admin })).status === 200);
  check('10c. admin can manage categories', (await call('POST', '/api/categories', {
    token: tokens.admin, body: { name: 'Admin Role Test Category' },
  })).status === 201);
  check('13. admin can read unanswered + stats', (await call('GET', '/api/admin/unanswered', { token: tokens.admin })).status === 200
    && (await call('GET', '/api/admin/stats', { token: tokens.admin })).status === 200);
  check('14f. admin can GET /api/users', (await call('GET', '/api/users', { token: tokens.admin })).status === 200);
  check('self-promotion blocked (admin-controlled roles)', (await call('PATCH', `/api/users/${'0'.repeat(24)}`, {
    token: tokens.user, body: { role: 'admin' },
  })).status === 403);

  console.log('\n— Creator cleanup + forged tokens —');
  check('8. creator can DELETE own FAQ', (await call('DELETE', `/api/faqs/${otherId}`, { token: tokens.creator2 })).status === 200);
  check('16. forged JWT → 401 (not 403)', (await call('GET', '/api/auth/me', { token: 'forged.token.value' })).status === 401);
  check('16b. garbage JWT → 401', (await call('GET', '/api/admin/stats', { token: 'garbage' })).status === 401);

  // Delete the second creator test account so the seed state stays clean.
  const users = (await call('GET', '/api/users', { token: tokens.admin })).json.data.items;
  const c2acct = users.find((u) => u.email === 'creator2@campus.ai');
  if (c2acct) await call('DELETE', `/api/users/${c2acct.id}`, { token: tokens.admin });

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[roleTest] failed:', err.message);
  process.exit(1);
});
