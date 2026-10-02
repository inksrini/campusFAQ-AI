/**
 * js/faq.js — the public FAQ browser (browse.html).
 * Loads categories -> renders them as filter chips -> loads FAQs (optionally
 * filtered by category). Read endpoints are public, so no login needed.
 */
import { api } from './api.js';
import { getCurrentUser, renderAuthArea } from './auth.js';

const categoryBar = document.getElementById('categoryBar');
const faqList = document.getElementById('faqList');
const statusEl = document.getElementById('browseStatus');

let categories = [];
let activeCategoryId = null;

function renderCategoryChips() {
  categoryBar.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'btn small ghost';
  all.textContent = `All (${categories.reduce((n, c) => n + c.faqCount, 0)})`;
  all.setAttribute('aria-selected', String(activeCategoryId === null));
  all.addEventListener('click', () => selectCategory(null));
  categoryBar.appendChild(all);

  for (const c of categories) {
    const chip = document.createElement('button');
    chip.className = 'btn small ghost';
    chip.textContent = `${c.name} (${c.faqCount})`;
    chip.setAttribute('aria-selected', String(activeCategoryId === c.id));
    chip.addEventListener('click', () => selectCategory(c.id));
    categoryBar.appendChild(chip);
  }
}

function renderFaqs(faqs) {
  faqList.innerHTML = '';
  if (faqs.length === 0) {
    statusEl.textContent = 'No FAQs in this category yet.';
    return;
  }
  statusEl.textContent = `${faqs.length} FAQ(s)`;
  for (const f of faqs) {
    const item = document.createElement('div');
    item.className = 'faq-item';
    const catName = f.category?.name ?? 'General';
    item.innerHTML = `
      <h3></h3>
      <p></p>
      <div class="sources"><span class="tag gray"></span></div>`;
    item.querySelector('h3').textContent = f.question;
    item.querySelector('p').textContent = f.answer;
    item.querySelector('.tag').textContent = catName;
    faqList.appendChild(item);
  }
}

async function loadFaqs() {
  statusEl.textContent = 'Loading…';
  const query = activeCategoryId ? `?category=${encodeURIComponent(activeCategoryId)}&limit=100` : '?limit=100';
  const data = await api(`/faqs${query}`, { auth: false });
  renderFaqs(data.items);
}

async function selectCategory(id) {
  activeCategoryId = id;
  renderCategoryChips();
  try {
    await loadFaqs();
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

// ── startup ──────────────────────────────────────────────────────────
const user = await getCurrentUser();
renderAuthArea(document.getElementById('navAuth'), user);

try {
  const data = await api('/categories', { auth: false });
  categories = data.items;
  renderCategoryChips();
  await loadFaqs();
} catch (err) {
  statusEl.textContent = `Could not load FAQs: ${err.message}`;
}
