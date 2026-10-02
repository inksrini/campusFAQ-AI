/**
 * js/login.js — logic for BOTH login.html and register.html.
 *
 * LOGIN:  POST /api/auth/login -> { token, user } -> store token -> redirect
 *         (admins land on the dashboard, students on the assistant).
 * REGISTER: POST /api/auth/register -> then auto-login for a smooth start.
 *
 * Server errors (e.g. "email already exists", validation lists) are shown in
 * the red alert box — the backend is the authority, never the browser checks.
 */
import { api, setToken } from './api.js';
import { cacheUser, getCurrentUser, renderAuthArea } from './auth.js';

function showError(el, err) {
  const lines = [err.message, ...(err.fieldErrors ?? []).map((e) => `• ${e}`)];
  el.textContent = lines.join('\n');
  el.classList.remove('hidden');
}
function hideError(el) {
  el.textContent = '';
  el.classList.add('hidden');
}

function redirectFor(user) {
  window.location.href = user.role === 'admin' ? '/admin.html' : '/index.html';
}

// ── login form ───────────────────────────────────────────────────────
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errEl);
    btn.disabled = true;
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          email: document.getElementById('email').value.trim(),
          password: document.getElementById('password').value,
        },
      });
      setToken(data.token);
      cacheUser(data.user);
      redirectFor(data.user);
    } catch (err) {
      showError(errEl, err);
      btn.disabled = false;
    }
  });
}

// ── register form ────────────────────────────────────────────────────
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  const errEl = document.getElementById('registerError');
  const btn = document.getElementById('registerBtn');

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errEl);
    btn.disabled = true;
    const body = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };
    try {
      await api('/auth/register', { method: 'POST', auth: false, body });
      // Registered → log in immediately with the same credentials.
      const data = await api('/auth/login', { method: 'POST', auth: false, body });
      setToken(data.token);
      cacheUser(data.user);
      redirectFor(data.user);
    } catch (err) {
      showError(errEl, err);
      btn.disabled = false;
    }
  });
}

// ── startup ──────────────────────────────────────────────────────────
const user = await getCurrentUser();
renderAuthArea(document.getElementById('navAuth'), user);
if (user) redirectFor(user); // already logged in? skip the form entirely.
