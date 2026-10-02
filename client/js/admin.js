/**
 * js/admin.js — the creator/admin dashboard (admin.html).
 *
 * TABS: Stats | FAQs | Categories | AI Drafts | Unanswered
 * One page, two clearance levels — the BACKEND enforces every permission;
 * hiding tabs for creators is UX only, never the security boundary.
 *
 *   CREATOR: AI Drafts + FAQ management of THEIR OWN FAQs (Edit/Delete
 *            buttons render only on rows they own; the backend enforces 403
 *            regardless). Categories/Unanswered/Stats are admin-only.
 *   ADMIN:   everything, on every FAQ.
 *
 * Page guard: requireCreatorOrAdmin() (see bottom of file).
 */
import { api } from './api.js';
import { requireCreatorOrAdmin, renderAuthArea } from './auth.js';

const $ = (id) => document.getElementById(id);
const tabs = document.querySelectorAll('[data-tab]');
const sections = { stats: $('tab-stats'), faqs: $('tab-faqs'), categories: $('tab-categories'), drafts: $('tab-drafts'), unanswered: $('tab-unanswered') };

let categories = [];
// The DB-verified dashboard user (set once at startup, after the guard).
// A module-level `let` avoids temporal-dead-zone issues if a click lands
// while the startup guard is still awaiting /auth/me.
let currentUser = null;
// Set by "Convert to FAQ"; the unanswered question is marked resolved ONLY
// after the FAQ is successfully created (see faqForm submit handler).
let pendingUnansweredId = null;

// ── tab switching ────────────────────────────────────────────────────
function showTab(name) {
  for (const [key, el] of Object.entries(sections)) el?.classList.toggle('hidden', key !== name);
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  if (name === 'stats' && currentUser?.role === 'admin') loadStats();
  if (name === 'faqs') { refreshCategoryCache().then(loadFaqTable); }
  if (name === 'categories' && currentUser?.role === 'admin') loadCategoryTable();
  if (name === 'drafts') refreshCategoryCache().catch(() => {}); // fill the <select>
  if (name === 'unanswered' && currentUser?.role === 'admin') loadUnanswered();
}
tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

// ── stats ────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const s = await api('/admin/stats');
    $('statFaq').textContent = s.faqCount;
    $('statCategory').textContent = s.categoryCount;
    $('statUser').textContent = s.userCount;
    $('statUnanswered').textContent = s.openUnanswered;
  } catch (err) { alert(err.message); }
}

// ── categories ───────────────────────────────────────────────────────
/** Fills a <select> with options using safe DOM APIs (category names are
 *  user-entered text — never inject them via innerHTML). */
function fillSelect(selectEl, items) {
  selectEl.textContent = '';
  for (const c of items) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    selectEl.appendChild(opt);
  }
}

async function refreshCategoryCache() {
  const data = await api('/categories', { auth: false });
  categories = data.items;
  fillSelect($('faqCategory'), categories);   // FAQ create/edit form
  fillSelect($('draftCategory'), categories); // AI drafts target category
}

async function loadCategoryTable() {
  const data = await api('/categories', { auth: false });
  const tbody = $('categoryTable');
  tbody.innerHTML = '';
  for (const c of data.items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td></td><td></td><td></td>
      <td class="actions">
        <button class="btn small ghost">Rename</button>
        <button class="btn small danger">Delete</button>
      </td>`;
    tr.children[0].textContent = c.name;
    tr.children[1].textContent = c.description || '—';
    tr.children[2].textContent = c.faqCount;
    const [renameBtn, deleteBtn] = tr.querySelectorAll('button');
    renameBtn.addEventListener('click', async () => {
      const name = prompt('New category name:', c.name);
      if (!name) return;
      try { await api(`/categories/${c.id}`, { method: 'PATCH', body: { name } }); loadCategoryTable(); }
      catch (err) { alert(err.message); }
    });
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete category "${c.name}"?`)) return;
      try { await api(`/categories/${c.id}`, { method: 'DELETE' }); loadCategoryTable(); }
      catch (err) { alert(err.message); } // 409 when FAQs still use it — by design
    });
    tbody.appendChild(tr);
  }
}

$('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('categoryName').value.trim();
  const description = $('categoryDescription').value.trim();
  try {
    await api('/categories', { method: 'POST', body: { name, description } });
    $('categoryName').value = ''; $('categoryDescription').value = '';
    loadCategoryTable();
  } catch (err) { alert(err.message); }
});

// ── FAQs ─────────────────────────────────────────────────────────────
async function loadFaqTable() {
  const data = await api('/faqs?limit=100', { auth: false });
  const tbody = $('faqTable');
  tbody.innerHTML = '';
  for (const f of data.items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td></td><td></td><td></td>
      <td class="actions">
        <button class="btn small ghost">Edit</button>
        <button class="btn small danger">Delete</button>
      </td>`;
    tr.children[0].textContent = f.question;
    tr.children[1].textContent = f.category?.name ?? '—';
    tr.children[2].textContent = f.answer.length > 80 ? f.answer.slice(0, 80) + '…' : f.answer;
    const [editBtn, deleteBtn] = tr.querySelectorAll('button');
    // OWNERSHIP (UI only — the backend enforces it for real): admins may edit
    // any FAQ; creators only rows they created.
    const isMine = currentUser.role === 'admin' || f.createdBy === currentUser.id;
    if (!isMine) {
      editBtn.remove();
      deleteBtn.remove();
      const tag = document.createElement('span');
      tag.className = 'tag gray';
      tag.textContent = 'view only';
      tr.children[3].appendChild(tag);
      tbody.appendChild(tr);
      continue;
    }
    editBtn.addEventListener('click', () => {
      pendingUnansweredId = null; // editing a different FAQ cancels any conversion
      $('faqEditId').value = f.id;
      $('faqQuestion').value = f.question;
      $('faqAnswer').value = f.answer;
      $('faqCategory').value = f.category?.id ?? '';
      $('faqSubmitBtn').textContent = 'Update FAQ';
      $('faqCancelEdit').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this FAQ?')) return;
      try { await api(`/faqs/${f.id}`, { method: 'DELETE' }); loadFaqTable(); }
      catch (err) { alert(err.message); }
    });
    tbody.appendChild(tr);
  }
}

$('faqForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('faqEditId').value;
  const body = {
    question: $('faqQuestion').value.trim(),
    answer: $('faqAnswer').value.trim(),
    category: $('faqCategory').value,
  };
  try {
    if (id) {
      await api(`/faqs/${id}`, { method: 'PATCH', body });
    } else {
      await api('/faqs', { method: 'POST', body });
      // Create succeeded → NOW (and only now) mark the source question resolved.
      if (pendingUnansweredId) {
        const unresolvedId = pendingUnansweredId;
        pendingUnansweredId = null;
        try {
          await api(`/admin/unanswered/${unresolvedId}`, { method: 'PATCH', body: { status: 'resolved' } });
        } catch {
          alert('FAQ saved, but marking the question resolved failed. It stays in the Unanswered list — dismiss it manually.');
        }
      }
    }
    $('faqCancelEdit').click();
    loadFaqTable();
  } catch (err) {
    // Save failed → the pending unanswered question intentionally stays open.
    alert(err.message);
  }
});

$('faqCancelEdit').addEventListener('click', () => {
  pendingUnansweredId = null; // cancel → the unanswered question remains open
  $('faqEditId').value = '';
  $('faqForm').reset();
  $('faqSubmitBtn').textContent = 'Create FAQ';
  $('faqCancelEdit').classList.add('hidden');
});

// ── AI drafts ────────────────────────────────────────────────────────
$('draftForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('draftSubmitBtn');
  const notes = $('draftNotes').value.trim();
  // Source notes are REQUIRED: the AI may only draft from the admin's facts.
  if (notes.length < 10) {
    alert('Source information is required (at least 10 characters) — the AI drafts only from the facts you supply.');
    return;
  }
  btn.disabled = true; btn.textContent = 'Generating…';
  $('draftResult').classList.add('hidden');
  try {
    const data = await api('/ai/generate-faq', { // creator- or admin-protected
      method: 'POST',
      body: {
        // Send the selected category's NAME for the prompt (the select value is its id).
        categoryName: categories.find((c) => c.id === $('draftCategory').value)?.name ?? 'General',
        topic: $('draftTopic').value.trim(),
        notes,
        count: Number($('draftCount').value) || 3,
      },
    });
    renderDrafts(data.drafts);
  } catch (err) { alert(err.message); }
  btn.disabled = false; btn.textContent = 'Generate drafts';
});

function renderDrafts(drafts) {
  const wrap = $('draftList');
  wrap.innerHTML = '';
  $('draftResult').classList.remove('hidden');
  for (const d of drafts) {
    const card = document.createElement('div');
    card.className = 'faq-item';
    card.innerHTML = `
      <label>Question</label><input class="d-question" />
      <label>Answer</label><textarea class="d-answer" rows="3"></textarea>
      <div class="sources"><button class="btn small">Save as FAQ</button></div>`;
    card.querySelector('.d-question').value = d.question;
    card.querySelector('.d-answer').value = d.answer;
    card.querySelector('button').addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await api('/faqs', {
          method: 'POST',
          body: {
            question: card.querySelector('.d-question').value.trim(),
            answer: card.querySelector('.d-answer').value.trim(),
            category: $('draftCategory').value, // the admin-selected category id
          },
        });
        card.querySelector('button').textContent = 'Saved ✓';
        card.querySelector('button').disabled = true;
      } catch (err) { alert(err.message); }
    });
    wrap.appendChild(card);
  }
}

// ── unanswered questions ─────────────────────────────────────────────
async function loadUnanswered() {
  const data = await api('/admin/unanswered?status=open');
  const wrap = $('unansweredTable');
  wrap.innerHTML = '';
  if (data.items.length === 0) {
    wrap.innerHTML = '<p class="muted">No open unanswered questions. 🎉</p>';
    return;
  }
  for (const q of data.items) {
    const row = document.createElement('div');
    row.className = 'faq-item';
    const canConvert = currentUser.role === 'admin'; // creators cannot write FAQs from review
    row.innerHTML = `
      <h3></h3>
      <p class="muted"></p>
      <div class="sources">
        ${canConvert ? '<button class="btn small">Convert to FAQ</button>' : ''}
        <button class="btn small ghost">Dismiss</button>
      </div>`;
    row.querySelector('h3').textContent = q.question;
    row.querySelector('p').textContent =
      `asked ${new Date(q.createdAt).toLocaleString()}` +
      (q.askedBy ? ` by ${q.askedBy.name}` : ' (anonymous)') +
      (q.topScore !== null && q.topScore !== undefined ? ` · best score ${Number(q.topScore).toFixed(3)}` : '');
    const buttons = row.querySelectorAll('button');
    const dismissBtn = buttons[buttons.length - 1];
    const convertBtn = canConvert ? buttons[0] : null;
    convertBtn.addEventListener('click', () => { // ADMIN ONLY (button not rendered for creators)
      // ONLY pre-fill the FAQ form. The question stays OPEN here until the
      // FAQ is actually saved (see faqForm submit); cancel or a failed save
      // leaves it open for later.
      $('faqCancelEdit').click(); // start from a clean create-form
      $('faqQuestion').value = q.question;
      $('faqAnswer').value = '';
      $('faqSubmitBtn').textContent = 'Create FAQ';
      $('faqCancelEdit').classList.remove('hidden');
      pendingUnansweredId = q.id;
      showTab('faqs');
    });
    dismissBtn.addEventListener('click', async () => {
      try { await api(`/admin/unanswered/${q.id}`, { method: 'PATCH', body: { status: 'dismissed' } }); loadUnanswered(); }
      catch (err) { alert(err.message); } // creator → 403; admin → works
    });
    wrap.appendChild(row);
  }
}

// ── startup: guard the page, then adapt the UI to the role ────────────
currentUser = await requireCreatorOrAdmin();
if (currentUser) {
  renderAuthArea($('navAuth'), currentUser); // renderAuthArea wires its own #logoutBtn

  if (currentUser.role === 'creator') {
    // CREATOR clearance: hide admin-only tabs. (UX only — every hidden
    // endpoint ALSO returns 403 from the backend for creators.)
    document.querySelector('[data-tab="stats"]')?.remove();
    document.querySelector('[data-tab="categories"]')?.remove();
    document.querySelector('[data-tab="unanswered"]')?.remove();
    $('pageTitle').textContent = 'Creator workspace';
    $('pageIntro').textContent =
      'Create FAQs and edit/delete YOUR OWN FAQs. AI drafts help you write content from your source notes.';
  } else {
    $('pageTitle').textContent = 'Admin dashboard';
  }

  showTab(currentUser.role === 'admin' ? 'stats' : 'faqs');
}
