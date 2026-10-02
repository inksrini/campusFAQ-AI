/**
 * js/chat.js — the AI assistant page (index.html).
 *
 * FLOW: user submits the form -> POST /api/chat { question } -> render the
 * answer as a chat bubble. "sources" shows WHICH knowledge-base FAQs were
 * used (transparency: the student can see the answer is grounded).
 *
 * AUTH: chat stays PUBLIC (no login required). We send the default auth flag
 * so api() attaches the JWT when the user is logged in; the backend's
 * optionalAuth middleware then attributes unanswered questions to that user.
 * Anonymous users simply send no token and are never blocked.
 */
import { api } from './api.js';
import { getCurrentUser, renderAuthArea } from './auth.js';

const form = document.getElementById('chatForm');
const input = document.getElementById('chatInput');
const window_ = document.getElementById('chatWindow');
const clearBtn = document.getElementById('clearChat');

const WELCOME =
  'Hi! I am NILA. Ask me anything about the college — admissions, fees, exams, library, hostel, transport, placements or scholarships. Yes even the questions you were afraid to ask the office';

function addBubble(text, who, { fallback = false, sources = [] } = {}) {
  const div = document.createElement('div');
  div.className = `msg ${who}${fallback ? ' fallback' : ''}`;
  div.textContent = text;
  if (who === 'bot' && sources.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'sources';
    for (const s of sources) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `${s.categoryName} · ${s.score.toFixed(2)}`;
      tag.title = s.question;
      wrap.appendChild(tag);
    }
    div.appendChild(wrap);
  }
  window_.appendChild(div);
  window_.scrollTop = window_.scrollHeight;
  return div;
}

function showTyping() {
  const t = document.createElement('div');
  t.className = 'msg bot typing';
  t.id = 'typing';
  t.textContent = 'NILA is thinking…';
  window_.appendChild(t);
  window_.scrollTop = window_.scrollHeight;
}
function hideTyping() {
  document.getElementById('typing')?.remove();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question) return;

  addBubble(question, 'user');
  input.value = '';
  input.focus();
  showTyping();

  try {
    // No auth:false here — the token is attached IF one exists (optionalAuth
    // on the server uses it only to attribute unanswered questions).
    const data = await api('/chat', { method: 'POST', body: { question } });
    hideTyping();
    addBubble(data.answer, 'bot', {
      fallback: !data.answeredByKnowledgeBase,
      sources: data.sources ?? [],
    });
  } catch (err) {
    hideTyping();
    addBubble(`Sorry, something went wrong: ${err.message}`, 'bot', { fallback: true });
  }
});

clearBtn.addEventListener('click', () => {
  window_.innerHTML = '';
  addBubble(WELCOME, 'bot');
});

// ── startup ──────────────────────────────────────────────────────────
const user = await getCurrentUser();
renderAuthArea(document.getElementById('navAuth'), user);
addBubble(WELCOME, 'bot');
input.focus();
