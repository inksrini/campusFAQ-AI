/**
 * js/auth.js — shared authentication helpers for every page.
 *
 * WHAT "LOGGED IN" MEANS HERE
 * The JWT lives in localStorage. Pages call getCurrentUser() at startup:
 * - token exists -> GET /api/auth/me verifies it is still valid and returns
 *   the profile (the SERVER is the authority; localStorage is just the key).
 * - no token / invalid token -> treated as anonymous.
 *
 * PAGE GUARDS
 * requireAuth(): pages that need a user -> redirect to login.
 * requireAdmin(): pages that need an admin -> redirect (login or home).
 */
import { api, setToken } from './api.js';

const USER_KEY = 'campus_ai_user';

export function cacheUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function cachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) ?? null;
  } catch {
    return null;
  }
}

/** Verifies the stored token against the server; returns user or null. */
export async function getCurrentUser() {
  if (!localStorage.getItem('campus_ai_token')) return null;
  try {
    const data = await api('/auth/me', { auth: true });
    cacheUser(data.user);
    return data.user;
  } catch {
    setToken(null);
    cacheUser(null);
    return null;
  }
}

export function logout() {
  setToken(null);
  cacheUser(null);
  window.location.href = '/index.html';
}

/**
 * Renders the navbar auth area according to the current user's role.
 * SECURITY: user-provided values (e.g. user.name) are inserted with
 * textContent — NEVER via innerHTML, which would execute injected HTML/JS.
 * Only fixed, app-defined strings may go through innerHTML.
 */
export function renderAuthArea(navElement, user) {
  if (!navElement) return;
  navElement.textContent = ''; // clear previous content

  const browseLink = document.createElement('a');
  browseLink.className = 'btn ghost small';
  browseLink.href = '/browse.html';
  browseLink.textContent = 'Browse FAQs';
  navElement.appendChild(browseLink);

  if (user) {
    if (user.role === 'admin') {
      const adminLink = document.createElement('a');
      adminLink.className = 'btn ghost small';
      adminLink.href = '/admin.html';
      adminLink.textContent = 'Admin';
      navElement.appendChild(adminLink);
    }
    const tag = document.createElement('span');
    tag.className = 'tag gray';
    tag.textContent = `${user.name} · ${user.role}`; // safe: textContent
    navElement.appendChild(tag);

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn small';
    logoutBtn.id = 'logoutBtn';
    logoutBtn.textContent = 'Logout';
    logoutBtn.addEventListener('click', logout);
    navElement.appendChild(logoutBtn);
  } else {
    const loginLink = document.createElement('a');
    loginLink.className = 'btn ghost small';
    loginLink.href = '/login.html';
    loginLink.textContent = 'Login';
    navElement.appendChild(loginLink);

    const registerLink = document.createElement('a');
    registerLink.className = 'btn small';
    registerLink.href = '/register.html';
    registerLink.textContent = 'Register';
    navElement.appendChild(registerLink);
  }
}

/** Guards: redirect away if the visitor is not allowed here.
 *  NOTE: page guards are UX routing only — the BACKEND enforces the real
 *  permissions on every API call (401/403). */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) window.location.href = '/login.html';
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) window.location.href = '/login.html';
  else if (user.role !== 'admin') window.location.href = '/index.html';
  return user;
}

/** Creator dashboard guard: creators and admins both land on admin.html. */
export async function requireCreatorOrAdmin() {
  const user = await getCurrentUser();
  if (!user) window.location.href = '/login.html';
  else if (!['creator', 'admin'].includes(user.role)) window.location.href = '/index.html';
  return user;
}
