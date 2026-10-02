/**
 * js/api.js — THE ONLY file that talks to the backend.
 *
 * WHY ONE FILE
 * Every page needs the same plumbing: build the URL, attach the JWT header,
 * parse JSON, unwrap our { success, data } envelope, and surface errors in
 * one consistent way. Centralizing it means pages never repeat fetch() code,
 * and if the API shape ever changes, this is the only file to fix.
 *
 * THE RESPONSE ENVELOPE (from server/utils/responses.js)
 * Success: { success: true,  data: ... }
 * Error:   { success: false, message: "...", errors?: [...] }
 */
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('campus_ai_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('campus_ai_token', token);
  else localStorage.removeItem('campus_ai_token');
}

/**
 * The one fetch wrapper every page uses.
 * @param {string} path - e.g. '/faqs' (API_BASE is prepended)
 * @param {{method?: string, body?: object, auth?: boolean}} [opts]
 */
export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (auth && token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Is it running? (npm start)');
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response (should not happen) */
  }

  if (!res.ok || !json?.success) {
    const message = json?.message || `Request failed (HTTP ${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.fieldErrors = json?.errors ?? [];
    // A dead/expired token should send the user back to login on protected pages.
    if (res.status === 401 && auth && getToken()) setToken(null);
    throw error;
  }
  return json.data;
}
