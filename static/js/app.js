/* =============================================
   AOQRWE — Full Frontend App (LocalStorage SPA)
   ============================================= */
'use strict';

// ─── NAMESPACE KEYS ──────────────────────────
const NS = {
  users:         'AOQRWE_users',
  subjects:      'AOQRWE_subjects',
  questions:     'AOQRWE_questions',
  results:       'AOQRWE_results',
  attempts:      'AOQRWE_attempts',
  dailyAttempts: 'AOQRWE_daily_attempts',
  session:       'AOQRWE_session',
};

// ─── DATA LAYER ──────────────────────────────
const DB = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  getObj(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; }
    catch { return null; }
  },
  setObj(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  // Users
  findUser(email, role) {
    return DB.get(NS.users).find(u => u.email.toLowerCase() === email.toLowerCase() && u.role === role);
  },
  registerUser(name, email, password, role) {
    const users = DB.get(NS.users);
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.role === role))
      return { ok: false, msg: 'Email already registered for this role.' };
    const user = { id: DB.uid(), name, email: email.toLowerCase(), password, role };
    users.push(user);
    DB.set(NS.users, users);
    return { ok: true, user };
  },

  // Session
  getSession() { return DB.getObj(NS.session); },
  setSession(user) { DB.setObj(NS.session, user); },
  clearSession() { localStorage.removeItem(NS.session); },

  // Subjects
  getSubjects() { return DB.get(NS.subjects); },
  addSubject(name, desc) {
    const subs = DB.get(NS.subjects);
    const s = { id: DB.uid(), name, desc: desc || '' };
    subs.push(s); DB.set(NS.subjects, subs); return s;
  },
  updateSubject(id, name, desc) {
    const subs = DB.get(NS.subjects).map(s => s.id === id ? { ...s, name, desc } : s);
    DB.set(NS.subjects, subs);
  },
  deleteSubject(id) {
    DB.set(NS.subjects, DB.get(NS.subjects).filter(s => s.id !== id));
    DB.set(NS.questions, DB.get(NS.questions).filter(q => q.subject_id !== id));
  },

  // Questions
  getQuestions(subjectId) { return DB.get(NS.questions).filter(q => q.subject_id === subjectId); },
  getAllQuestions() { return DB.get(NS.questions); },
  addQuestion(subjectId, text, options, answer) {
    const qs = DB.get(NS.questions);
    const q = { id: DB.uid(), subject_id: subjectId, text, options, answer };
    qs.push(q); DB.set(NS.questions, qs); return q;
  },
  updateQuestion(id, text, options, answer) {
    const qs = DB.get(NS.questions).map(q => q.id === id ? { ...q, text, options, answer } : q);
    DB.set(NS.questions, qs);
  },
  deleteQuestion(id) { DB.set(NS.questions, DB.get(NS.questions).filter(q => q.id !== id)); },

  // Results
  saveResult(userId, subjectId, score, total, answers) {
    const pct = Math.round((score / total) * 100);
    const passed = pct >= 40;
    const r = { id: DB.uid(), user_id: userId, subject_id: subjectId, score, total, pct, passed, timestamp: new Date().toISOString() };
    const res = DB.get(NS.results); res.push(r); DB.set(NS.results, res);
    // Save individual attempts
    const atts = DB.get(NS.attempts);
    Object.entries(answers).forEach(([qid, { selected, correct, is_correct }]) => {
      atts.push({ id: DB.uid(), user_id: userId, question_id: qid, selected_answer: selected, correct_answer: correct, is_correct });
    });
    DB.set(NS.attempts, atts);
    return r;
  },
  getResultsByUser(userId) { return DB.get(NS.results).filter(r => r.user_id === userId); },
  getResultById(id) { return DB.get(NS.results).find(r => r.id === id); },

  // Daily attempt limits (2 per day per subject)
  getDailyCount(userId, subjectId) {
    const today = new Date().toISOString().slice(0, 10);
    const rec = DB.get(NS.dailyAttempts).find(d => d.user_id === userId && d.subject_id === subjectId && d.date === today);
    return rec ? rec.count : 0;
  },
  incrementDailyCount(userId, subjectId) {
    const today = new Date().toISOString().slice(0, 10);
    const list = DB.get(NS.dailyAttempts);
    const idx = list.findIndex(d => d.user_id === userId && d.subject_id === subjectId && d.date === today);
    if (idx >= 0) list[idx].count++;
    else list.push({ user_id: userId, subject_id: subjectId, date: today, count: 1 });
    DB.set(NS.dailyAttempts, list);
  },

  // Stats for admin
  getStats() {
    const users = DB.get(NS.users).filter(u => u.role === 'student');
    const results = DB.get(NS.results);
    const attempted = new Set(results.map(r => r.user_id)).size;
    const subjects = DB.get(NS.subjects);
    const questions = DB.get(NS.questions);
    return { students: users.length, attempted, subjects: subjects.length, questions: questions.length, totalAttempts: results.length };
  }
};

// ─── SESSION / AUTH HELPERS ───────────────────
let currentPage = 'landing';
let quizState = null; // active quiz context

function getSession() { return DB.getSession(); }
function isLoggedIn() { return !!getSession(); }
function requireAuth(role) {
  const s = getSession();
  if (!s || s.role !== role) { Router.go('landing'); return false; }
  return true;
}

// ─── TOAST NOTIFICATIONS ──────────────────────
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}

// ─── GENERIC CONFIRM DIALOG ───────────────────
function showConfirm(title, msg) {
  return new Promise(resolve => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmModal').classList.add('active');
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    function cleanup() {
      document.getElementById('confirmModal').classList.remove('active');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
    }
    function onOk() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

// ─── ROUTER ──────────────────────────────────
const Router = {
  go(page, params = {}) {
    currentPage = page;
    const root = document.getElementById('appRoot');
    root.innerHTML = '';
    Pages[page] ? Pages[page](params) : Pages.landing();
    updateNav();
    window.scrollTo(0, 0);
  }
};

// ─── NAV UPDATE ──────────────────────────────
function updateNav() {
  const nav = document.getElementById('navActions');
  const s = getSession();
  if (s) {
    nav.innerHTML = `
      <span class="nav-user"><i class="fas fa-circle-user"></i> ${s.name}</span>
      <button class="btn btn-secondary btn-sm" id="navLogout">Logout</button>`;
    document.getElementById('navLogout').addEventListener('click', () => {
      DB.clearSession();
      Router.go('landing');
      toast('Logged out successfully.');
    });
  } else {
    nav.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="navAuth">
        <i class="fas fa-right-to-bracket"></i> Login / Signup
      </button>`;
    document.getElementById('navAuth').addEventListener('click', () => openAuthModal());
  }
}

// ─── AUTH MODAL CONTROL ───────────────────────
function openAuthModal(defaultTab = 'student', defaultForm = null) {
  const modal = document.getElementById('authModal');
  modal.classList.add('active');
  // switch tab
  switchAuthTab(defaultTab);
  if (defaultForm) switchForm(defaultTab, defaultForm);
}
function closeAuthModal() { document.getElementById('authModal').classList.remove('active'); }

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('studentSection').classList.toggle('active', tab === 'student');
  document.getElementById('adminSection').classList.toggle('active', tab === 'admin');
}

function switchForm(section, formName) {
  const sectionEl = document.getElementById(section === 'student' ? 'studentSection' : 'adminSection');
  sectionEl.querySelectorAll('.auth-toggle').forEach(t => t.classList.toggle('active', t.dataset.form === formName));
  sectionEl.querySelectorAll('.auth-form').forEach(f => f.classList.toggle('active',
    f.id === formName + 'Form' || f.id === formName.replace(/([A-Z])/g, m => m) + 'Form'));
}

// ─── AUTH FORM HANDLERS ───────────────────────
function setupAuthForms() {
  // Tab switching
  document.querySelectorAll('.auth-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab));
  });
  // Form toggle (Login / Register)
  document.querySelectorAll('.auth-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const form = toggle.dataset.form;
      const section = toggle.closest('.auth-section');
      section.querySelectorAll('.auth-toggle').forEach(t => t.classList.toggle('active', t === toggle));
      section.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      const target = document.getElementById(form + 'Form');
      if (target) target.classList.add('active');
    });
  });
  // Close button
  document.getElementById('closeAuthModal').addEventListener('click', closeAuthModal);
  document.getElementById('authModal').addEventListener('click', e => { if (e.target === document.getElementById('authModal')) closeAuthModal(); });

  // Student Login
  document.getElementById('studentLoginForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('sLoginEmail').value.trim();
    const pass = document.getElementById('sLoginPass').value;
    const user = DB.findUser(email, 'student');
    if (!user || user.password !== pass) {
      document.getElementById('sLoginErr').textContent = 'Invalid email or password.'; return;
    }
    document.getElementById('sLoginErr').textContent = '';
    DB.setSession(user); closeAuthModal();
    toast(`Welcome back, ${user.name}!`);
    Router.go('studentDashboard');
  });

  // Student Register
  document.getElementById('studentRegisterForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('sRegName').value.trim();
    const email = document.getElementById('sRegEmail').value.trim();
    const pass = document.getElementById('sRegPass').value;
    if (!name || !email || !pass) { document.getElementById('sRegErr').textContent = 'All fields required.'; return; }
    if (pass.length < 6) { document.getElementById('sRegErr').textContent = 'Password must be ≥ 6 characters.'; return; }
    const result = DB.registerUser(name, email, pass, 'student');
    if (!result.ok) { document.getElementById('sRegErr').textContent = result.msg; return; }
    document.getElementById('sRegErr').textContent = '';
    DB.setSession(result.user); closeAuthModal();
    toast(`Welcome to AOQRWE, ${name}!`);
    Router.go('studentDashboard');
  });

  // Admin Login
  document.getElementById('adminLoginForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('aLoginEmail').value.trim();
    const pass = document.getElementById('aLoginPass').value;
    const user = DB.findUser(email, 'admin');
    if (!user || user.password !== pass) {
      document.getElementById('aLoginErr').textContent = 'Invalid admin credentials.'; return;
    }
    document.getElementById('aLoginErr').textContent = '';
    DB.setSession(user); closeAuthModal();
    toast(`Welcome, Admin ${user.name}!`);
    Router.go('adminDashboard');
  });

  // Admin Register
  document.getElementById('adminRegisterForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('aRegName').value.trim();
    const email = document.getElementById('aRegEmail').value.trim();
    const pass = document.getElementById('aRegPass').value;
    if (!name || !email || !pass) { document.getElementById('aRegErr').textContent = 'All fields required.'; return; }
    if (pass.length < 6) { document.getElementById('aRegErr').textContent = 'Password must be ≥ 6 characters.'; return; }
    const result = DB.registerUser(name, email, pass, 'admin');
    if (!result.ok) { document.getElementById('aRegErr').textContent = result.msg; return; }
    document.getElementById('aRegErr').textContent = '';
    DB.setSession(result.user); closeAuthModal();
    toast(`Admin account created. Welcome, ${name}!`);
    Router.go('adminDashboard');
  });
}

// ─── ROLE MODAL ────────────────────────────────
function setupRoleModal() {
  document.getElementById('closeRoleModal').addEventListener('click', () => document.getElementById('roleModal').classList.remove('active'));
  document.getElementById('roleModal').addEventListener('click', e => { if (e.target === document.getElementById('roleModal')) document.getElementById('roleModal').classList.remove('active'); });
  document.getElementById('roleStudent').addEventListener('click', () => {
    document.getElementById('roleModal').classList.remove('active');
    openAuthModal('student');
  });
  document.getElementById('roleAdmin').addEventListener('click', () => {
    document.getElementById('roleModal').classList.remove('active');
    openAuthModal('admin');
  });
}

// ─── PAGES ────────────────────────────────────
const Pages = {};

// ── LANDING PAGE ──────────────────────────────
Pages.landing = function() {
  const s = getSession();
  if (s) {
    if (s.role === 'admin') { Router.go('adminDashboard'); return; }
    if (s.role === 'student') { Router.go('studentDashboard'); return; }
  }
  const root = document.getElementById('appRoot');
  root.innerHTML = `
    <div class="landing-wrapper">
      <header class="hero-section">
        <div class="hero-content">
          <h1 class="brand-title neon-text">AOQRWE</h1>
          <p class="brand-subtitle">Advanced Online Quiz System<br>with Real-time Evaluation</p>
          <div class="hero-badges">
            <span class="hero-badge"><i class="fas fa-stopwatch"></i> 30-sec timer</span>
            <span class="hero-badge"><i class="fas fa-chart-bar"></i> Instant results</span>
            <span class="hero-badge"><i class="fas fa-file-pdf"></i> PDF export</span>
          </div>
          <button class="btn btn-primary btn-glow btn-start" id="startBtn">
            <i class="fas fa-rocket"></i> Start &nbsp; 🚀
          </button>
        </div>
        <div class="hero-graphics">
          <div class="glass-card decorative-card">
            <i class="fas fa-brain fa-3x neon-text"></i>
            <h3>30-Second Challenge</h3>
            <p>Test your knowledge under pressure with adaptive quizzes.</p>
            <div class="deco-stats">
              <div><strong class="text-teal">${DB.get(NS.users).filter(u=>u.role==='student').length}</strong><br><small>Students</small></div>
              <div><strong class="text-purple">${DB.get(NS.subjects).length}</strong><br><small>Subjects</small></div>
              <div><strong class="text-orange">${DB.get(NS.results).length}</strong><br><small>Attempts</small></div>
            </div>
          </div>
        </div>
      </header>
    </div>`;

  document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('roleModal').classList.add('active');
  });
};

// ── STUDENT DASHBOARD ─────────────────────────
Pages.studentDashboard = function() {
  if (!requireAuth('student')) return;
  const s = getSession();
  const root = document.getElementById('appRoot');
  const results = DB.getResultsByUser(s.id);
  const subjects = DB.getSubjects();

  root.innerHTML = `
    <div class="dashboard-header glass-panel">
      <div>
        <h2><i class="fas fa-user-graduate text-accent"></i> AOQRWE Student Portal</h2>
        <p class="text-muted">Welcome, ${s.name} | <span class="link-text" id="changePassBtn">Modify Password</span></p>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Subject Library -->
      <div class="glass-card pd-2 span-2">
        <h3><i class="fas fa-layer-group text-teal"></i> AOQRWE Subject Banks</h3>
        <p class="text-muted small mb-2">Select a subject below to start your 30-Second Challenge.</p>
        
        <div class="subject-grid mt-2" id="subjectGrid">
          ${subjects.length ? subjects.map(sub => {
            const count = DB.getQuestions(sub.id).length;
            const dailyCount = DB.getDailyCount(s.id, sub.id);
            const canAttempt = dailyCount < 2;
            return `
              <div class="subject-card glass-panel-light">
                <div class="subject-icon"><i class="fas fa-bolt text-purple fa-2x"></i></div>
                <h4>${sub.name}</h4>
                <p class="text-muted small">${sub.desc || 'No description'}</p>
                <div class="subject-stats mt-1">
                  <span class="badge"><i class="fas fa-question-circle"></i> ${count} Qs</span>
                  <span class="badge ${dailyCount >= 2 ? 'text-red' : ''}"><i class="fas fa-redo"></i> ${dailyCount}/2 Attempts</span>
                </div>
                ${count > 0 ? `
                  <button class="btn btn-primary btn-block mt-2 start-quiz-btn" 
                          data-id="${sub.id}" ${!canAttempt ? 'disabled' : ''}>
                    ${canAttempt ? '<i class="fas fa-play"></i> Start Challenge' : 'Limit Reached'}
                  </button>` 
                : `<button class="btn btn-secondary btn-block mt-2" disabled>Empty</button>`}
              </div>`;
          }).join('') : '<p class="text-muted pd-2">No subjects available yet.</p>'}
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="glass-card pd-2">
        <h3 class="mb-2"><i class="fas fa-history text-teal"></i> Quiz History</h3>
        <div class="activity-list mt-2">
          ${results.length ? results.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).map(r => {
            const sub = subjects.find(sb => sb.id === r.subject_id);
            return `
              <div class="activity-item glass-panel-light mb-1">
                <div class="activity-header">
                  <strong>${sub ? sub.name : 'Deleted Subject'}</strong>
                  <span class="score-badge ${r.passed ? 'success' : 'danger'}">
                    ${r.score}/${r.total} (${r.pct}%)
                  </span>
                </div>
                <div class="activity-meta text-muted small mt-1">
                  <span><i class="fas fa-calendar"></i> ${new Date(r.timestamp).toLocaleDateString()}</span>
                  <span class="link-text float-right view-result-btn" data-id="${r.id}">Review</span>
                </div>
              </div>`;
          }).join('') : '<p class="text-muted small text-center pd-2">No attempts recorded yet.</p>'}
        </div>
      </div>
    </div>`;

  // Events
  document.getElementById('changePassBtn').addEventListener('click', () => Router.go('modifyPassword'));
  root.querySelectorAll('.start-quiz-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = subjects.find(x => x.id === btn.dataset.id);
      startQuizFlow(sub);
    });
  });
  root.querySelectorAll('.view-result-btn').forEach(btn => {
    btn.addEventListener('click', () => Router.go('result', { id: btn.dataset.id }));
  });
};

// ── MODIFY PASSWORD ───────────────────────────
Pages.modifyPassword = function() {
  if (!isLoggedIn()) return;
  const s = getSession();
  const root = document.getElementById('appRoot');
  root.innerHTML = `
    <div class="glass-card pd-3" style="max-width:500px;margin:2rem auto;">
      <h2 class="mb-2"><i class="fas fa-key text-teal"></i> Modify Password</h2>
      <p class="text-muted mb-3">Ref: ${s.email}</p>
      <form id="modPassForm">
        <div class="form-group">
          <i class="fas fa-lock text-icon"></i>
          <input type="password" id="curPass" placeholder="Current Password" required />
        </div>
        <div class="form-group">
          <i class="fas fa-shield-alt text-icon"></i>
          <input type="password" id="newPass" placeholder="New Password" required />
        </div>
        <div id="modPassErr" class="form-error"></div>
        <div class="flex-row">
          <button type="button" class="btn btn-secondary" onclick="Router.go('landing')">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Password</button>
        </div>
      </form>
    </div>`;

  document.getElementById('modPassForm').addEventListener('submit', e => {
    e.preventDefault();
    const cur = document.getElementById('curPass').value;
    const nxt = document.getElementById('newPass').value;
    if (cur !== s.password) {
      document.getElementById('modPassErr').textContent = 'Incorrect current password.'; return;
    }
    if (nxt.length < 6) {
      document.getElementById('modPassErr').textContent = 'New password too short.'; return;
    }
    const users = DB.get(NS.users);
    const uIdx = users.findIndex(u => u.id === s.id);
    users[uIdx].password = nxt;
    DB.set(NS.users, users);
    s.password = nxt;
    DB.setSession(s);
    toast('Password updated successfully!');
    s.role === 'admin' ? Router.go('adminDashboard') : Router.go('studentDashboard');
  });
};

// ── ADMIN DASHBOARD ───────────────────────────
Pages.adminDashboard = function() {
  if (!requireAuth('admin')) return;
  const s = getSession();
  const root = document.getElementById('appRoot');
  const stats = DB.getStats();

  root.innerHTML = `
    <div class="dashboard-header glass-panel mb-3">
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
        <div>
          <h2><i class="fas fa-shield-alt text-accent"></i> Administrator Portal</h2>
          <p class="text-muted">Welcome, ${s.name}</p>
        </div>
        <div class="quick-stats" style="display:flex;gap:1.5rem;text-align:center;">
          <div class="stat"><div class="text-teal font-bold" style="font-size:1.5rem;">${stats.students}</div><div class="text-muted small">Students</div></div>
          <div class="stat"><div class="text-purple font-bold" style="font-size:1.5rem;">${stats.subjects}</div><div class="text-muted small">Quizzes</div></div>
          <div class="stat"><div class="text-orange font-bold" style="font-size:1.5rem;">${stats.totalAttempts}</div><div class="text-muted small">Attempts</div></div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Subjects Grid -->
      <div class="glass-card pd-2 span-2">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3><i class="fas fa-database text-purple"></i> Manage Subject Banks</h3>
          <button class="btn btn-primary btn-sm" id="createSubjectBtn"><i class="fas fa-plus"></i> New Bank</button>
        </div>
        <div class="banks-list mt-2" id="adminBanksList">
          ${DB.getSubjects().map(sub => `
            <div class="bank-item glass-panel-light">
              <div class="bank-info">
                <h4>${sub.name}</h4>
                <p class="text-muted small">${sub.desc || 'No description'}</p>
                <span class="badge small"><i class="fas fa-question-circle"></i> ${DB.getQuestions(sub.id).length} Qs</span>
              </div>
              <div class="bank-actions">
                <button class="btn btn-accent btn-sm manage-qs-btn" data-id="${sub.id}"><i class="fas fa-list-check"></i> Manage Questions</button>
                <button class="btn btn-secondary btn-sm edit-sub-btn" data-id="${sub.id}"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm delete-sub-btn" data-id="${sub.id}"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          `).join('') || '<p class="text-muted text-center pd-3">No subjects found. Use "New Bank" to start.</p>'}
        </div>
      </div>

      <!-- Misc Admin Actions -->
      <div class="glass-card pd-2">
        <h3><i class="fas fa-tools text-orange"></i> Quick Actions</h3>
        <button class="btn btn-secondary btn-block mt-2" id="adminChangePassBtn"><i class="fas fa-key"></i> Modify My Password</button>
        <button class="btn btn-admin btn-block mt-2" id="manageDbBtn" style="border-color:var(--accent-red);color:var(--accent-red);">
          <i class="fas fa-server"></i> Manage Database System
        </button>
      </div>
    </div>`;

  // Events
  document.getElementById('createSubjectBtn').addEventListener('click', () => promptSubject());
  document.getElementById('adminChangePassBtn').addEventListener('click', () => Router.go('modifyPassword'));
  document.getElementById('manageDbBtn').addEventListener('click', () => Router.go('manageDatabase'));
  root.querySelectorAll('.manage-qs-btn').forEach(btn => {
    btn.addEventListener('click', () => Router.go('manageQuestions', { id: btn.dataset.id }));
  });
  root.querySelectorAll('.edit-sub-btn').forEach(btn => {
    btn.addEventListener('click', () => promptSubject(btn.dataset.id));
  });
  root.querySelectorAll('.delete-sub-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (await showConfirm('Delete Subject?', 'This will permanently remove the subject and all its questions.')) {
        DB.deleteSubject(btn.dataset.id); toast('Subject deleted.'); Router.go('adminDashboard');
      }
    });
  });
};

// ── SUBJECT PROMPT OVERLAY ────────────────────
async function promptSubject(id = null) {
  const sub = id ? DB.getSubjects().find(s => s.id === id) : null;
  const root = document.getElementById('appRoot');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-content glass-panel">
      <h3>${id ? 'Edit' : 'Create'} Subject Bank</h3>
      <div class="form-group mt-2">
        <input type="text" id="pSubName" value="${sub ? sub.name : ''}" placeholder="Subject Name (e.g. Mathematics)" class="form-control-cool" />
      </div>
      <div class="form-group">
        <textarea id="pSubDesc" placeholder="Brief description..." class="form-control-cool" rows="2">${sub ? sub.desc : ''}</textarea>
      </div>
      <div class="flex-row">
        <button class="btn btn-secondary" id="pSubCancel">Cancel</button>
        <button class="btn btn-primary" id="pSubSave">Save Bank</button>
      </div>
    </div>`;
  root.appendChild(overlay);

  return new Promise(resolve => {
    document.getElementById('pSubCancel').onclick = () => { overlay.remove(); resolve(null); };
    document.getElementById('pSubSave').onclick = () => {
      const name = document.getElementById('pSubName').value.trim();
      const desc = document.getElementById('pSubDesc').value.trim();
      if (!name) return toast('Name required', 'error');
      if (id) DB.updateSubject(id, name, desc);
      else DB.addSubject(name, desc);
      overlay.remove();
      toast('Subject saved.');
      Router.go('adminDashboard');
      resolve({ name, desc });
    };
  });
}

// ── MANAGE QUESTIONS ──────────────────────────
Pages.manageQuestions = function({ id }) {
  if (!requireAuth('admin')) return;
  const sub = DB.getSubjects().find(s => s.id === id);
  if (!sub) return Router.go('adminDashboard');
  const root = document.getElementById('appRoot');
  const qs = DB.getQuestions(id);

  root.innerHTML = `
    <div class="dashboard-header glass-panel mb-3">
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
        <div>
          <h2><i class="fas fa-list-check text-accent"></i> Questions: ${sub.name}</h2>
          <button class="btn btn-secondary btn-sm mt-1" onclick="Router.go('adminDashboard')">
            <i class="fas fa-arrow-left"></i> Back to Banks
          </button>
        </div>
        <button class="btn btn-primary" id="addQBtn"><i class="fas fa-plus"></i> Add Question</button>
      </div>
    </div>

    <div class="glass-card pd-2">
      <div id="qsList">
        ${qs.map((q, idx) => `
          <div class="question-item glass-panel-light">
            <div style="flex:1;">
              <strong>Q${idx + 1}: ${q.text}</strong>
              <div class="q-opts-grid mt-1">
                ${Object.entries(q.options).map(([key, val]) => `
                  <div class="small ${q.answer === key ? 'text-teal font-bold' : 'text-muted'}">
                    ${key}: ${val} ${q.answer === key ? '✓' : ''}
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="bank-actions">
              <button class="btn btn-secondary btn-sm edit-q-btn" data-id="${q.id}"><i class="fas fa-edit"></i></button>
              <button class="btn btn-danger btn-sm delete-q-btn" data-id="${q.id}"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        `).join('') || '<p class="text-muted text-center pd-3">No questions in this bank yet.</p>'}
      </div>
    </div>`;

  // Events
  document.getElementById('addQBtn').onclick = () => promptQuestion(id);
  root.querySelectorAll('.edit-q-btn').forEach(btn => {
    btn.onclick = () => promptQuestion(id, btn.dataset.id);
  });
  root.querySelectorAll('.delete-q-btn').forEach(btn => {
    btn.onclick = async () => {
      if (await showConfirm('Delete Question?', 'Permanently remove this question?')) {
        DB.deleteQuestion(btn.dataset.id); toast('Question deleted.'); Router.go('manageQuestions', { id });
      }
    };
  });
};

// ── QUESTION PROMPT OVERLAY ───────────────────
async function promptQuestion(subId, qId = null) {
  const q = qId ? DB.getAllQuestions().find(x => x.id === qId) : null;
  const root = document.getElementById('appRoot');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-content glass-panel" style="max-width:600px;">
      <h3>${qId ? 'Edit' : 'Add'} Question</h3>
      <div class="form-group mt-2">
        <textarea id="pQText" placeholder="Question Text..." class="form-control-cool" rows="3">${q ? q.text : ''}</textarea>
      </div>
      <div class="options-edit-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
        <input type="text" id="pOptA" value="${q ? q.options.A : ''}" placeholder="Option A" class="form-control-cool" />
        <input type="text" id="pOptB" value="${q ? q.options.B : ''}" placeholder="Option B" class="form-control-cool" />
        <input type="text" id="pOptC" value="${q ? q.options.C : ''}" placeholder="Option C" class="form-control-cool" />
        <input type="text" id="pOptD" value="${q ? q.options.D : ''}" placeholder="Option D" class="form-control-cool" />
      </div>
      <div class="form-group">
        <label class="small text-muted">Correct Answer:</label>
        <select id="pQAns" class="form-control-cool">
          <option value="A" ${q?.answer === 'A' ? 'selected' : ''}>A</option>
          <option value="B" ${q?.answer === 'B' ? 'selected' : ''}>B</option>
          <option value="C" ${q?.answer === 'C' ? 'selected' : ''}>C</option>
          <option value="D" ${q?.answer === 'D' ? 'selected' : ''}>D</option>
        </select>
      </div>
      <div class="flex-row">
        <button class="btn btn-secondary" id="pQCancel">Cancel</button>
        <button class="btn btn-primary" id="pQSave">Save Question</button>
      </div>
    </div>`;
  root.appendChild(overlay);

  document.getElementById('pQCancel').onclick = () => overlay.remove();
  document.getElementById('pQSave').onclick = () => {
    const text = document.getElementById('pQText').value.trim();
    const opts = {
      A: document.getElementById('pOptA').value.trim(),
      B: document.getElementById('pOptB').value.trim(),
      C: document.getElementById('pOptC').value.trim(),
      D: document.getElementById('pOptD').value.trim()
    };
    const ans = document.getElementById('pQAns').value;
    if (!text || !opts.A || !opts.B || !opts.C || !opts.D) return toast('Fill all fields', 'error');
    if (qId) DB.updateQuestion(qId, text, opts, ans);
    else DB.addQuestion(subId, text, opts, ans);
    overlay.remove();
    toast('Question saved.');
    Router.go('manageQuestions', { id: subId });
  };
}

// ── MANAGE DATABASE (CRUD) ────────────────────
Pages.manageDatabase = function() {
  if (!requireAuth('admin')) return;
  const root = document.getElementById('appRoot');
  const tables = Object.keys(NS).filter(k=>k!=='session');
  let activeTab = tables[0];

  function renderTable(tableName) {
    const data = DB.get(NS[tableName]);
    if (!data.length) return `<p class="pd-3 text-muted text-center">Table "${tableName}" is empty.</p>`;
    const keys = Object.keys(data[0]);
    return `
      <div class="db-table-wrapper" style="overflow-x:auto;">
        <table class="db-table">
          <thead><tr>${keys.map(k=>`<th>${k}</th>`).join('')}<th>Actions</th></tr></thead>
          <tbody>
            ${data.map((row, rIdx) => `
              <tr>
                ${keys.map(k => `<td><textarea class="db-cell-edit" data-table="${tableName}" data-row="${rIdx}" data-key="${k}">${typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]}</textarea></td>`).join('')}
                <td><button class="btn btn-danger btn-sm db-del-row" data-table="${tableName}" data-row="${rIdx}"><i class="fas fa-trash"></i></button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  root.innerHTML = `
    <div class="dashboard-header glass-panel mb-3">
      <h2><i class="fas fa-server text-red"></i> Central Database System</h2>
      <button class="btn btn-secondary btn-sm" onclick="Router.go('adminDashboard')"><i class="fas fa-arrow-left"></i> Exit</button>
    </div>
    
    <div class="glass-card pd-2">
      <div class="auth-tabs" id="dbTabs">
        ${tables.map(t => `<button class="tab-btn ${t === activeTab ? 'active' : ''}" data-tab="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join('')}
      </div>
      <div id="dbContent" class="mt-2">${renderTable(activeTab)}</div>
      <div class="mt-2 flex-row" style="justify-content:flex-end;">
         <button class="btn btn-primary" id="dbSaveAll"><i class="fas fa-save"></i> Save All Changes</button>
      </div>
    </div>`;

  // Events
  root.querySelectorAll('#dbTabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      activeTab = btn.dataset.tab;
      root.querySelectorAll('#dbTabs .tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('dbContent').innerHTML = renderTable(activeTab);
      setupTableEvents();
    };
  });

  function setupTableEvents() {
    root.querySelectorAll('.db-del-row').forEach(btn => {
      btn.onclick = async () => {
        if (await showConfirm('Delete Row?', 'This action is immediate and dangerous.')) {
          const list = DB.get(NS[btn.dataset.table]);
          list.splice(parseInt(btn.dataset.row), 1);
          DB.set(NS[btn.dataset.table], list);
          toast('Row deleted locally.');
          btn.closest('tr').remove();
        }
      };
    });
  }
  setupTableEvents();

  document.getElementById('dbSaveAll').onclick = () => {
    root.querySelectorAll('.db-cell-edit').forEach(cell => {
      const { table, row, key } = cell.dataset;
      const list = DB.get(NS[table]);
      let val = cell.value;
      try { if (val.startsWith('{') || val.startsWith('[')) val = JSON.parse(val); } catch(e){}
      list[row][key] = val;
      DB.set(NS[table], list);
    });
    toast('Database synced successfully!');
    Router.go('manageDatabase');
  };
};

// ── QUIZ FLOW LOGIC ───────────────────────────
function startQuizFlow(subject) {
  const s = getSession();
  const dailyCount = DB.getDailyCount(s.id, subject.id);
  if (dailyCount >= 2) return toast('Daily limit reached (2/day).', 'error');
  
  const qs = DB.getQuestions(subject.id);
  if (!qs.length) return toast('This bank is empty.', 'error');

  // Increment attempt count immediately on start
  DB.incrementDailyCount(s.id, subject.id);
  
  quizState = {
    subject,
    questions: qs.sort(() => Math.random() - 0.5), // Shuffle
    currentIdx: 0,
    answers: {}, // { qid: { selected, correct, is_correct } }
    timer: 30,
    interval: null,
    startTime: Date.now()
  };
  
  Router.go('quiz');
}

// ── QUIZ PAGE ─────────────────────────────────
Pages.quiz = function() {
  if (!quizState) return Router.go('studentDashboard');
  const root = document.getElementById('appRoot');
  
  function renderQuestion() {
    const q = quizState.questions[quizState.currentIdx];
    const isLast = quizState.currentIdx === quizState.questions.length - 1;
    const answered = Object.keys(quizState.answers).length;
    const total = quizState.questions.length;

    root.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-header glass-panel mb-2">
          <h2><i class="fas fa-bolt text-teal"></i> ${quizState.subject.name} Challenge</h2>
          <div class="timer-wrapper">
             <svg class="circular-timer" width="60" height="60">
                <circle class="timer-bg" cx="30" cy="30" r="25"></circle>
                <circle class="timer-progress" id="timerCircle" cx="30" cy="30" r="25" style="stroke-dasharray: 157; stroke-dashoffset: 0;"></circle>
             </svg>
             <div class="timer-text" id="timerText">30</div>
          </div>
        </div>

        <div class="quiz-layout">
          <div class="question-area glass-card pd-3">
            <div class="q-progress mb-2">
              <span class="text-accent font-bold">Question ${quizState.currentIdx + 1}</span> of ${total}
            </div>
            <h3 class="mt-2 text-large">${q.text}</h3>
            <div class="options-container mt-3" id="optsBox">
              ${['A','B','C','D'].map(opt => `
                <div class="option-tile glass-panel-light ${quizState.answers[q.id]?.selected === opt ? 'selected' : ''}" data-opt="${opt}">
                  <div class="opt-letter">${opt}</div>
                  <div class="opt-text">${q.options[opt]}</div>
                </div>
              `).join('')}
            </div>
            <div class="quiz-actions mt-3">
              <button class="btn btn-secondary" id="saveBtn">Save Answer</button>
              <button class="btn btn-primary" id="nextBtn">${isLast ? 'Final Submission' : 'Save & Next'}</button>
            </div>
          </div>

          <div class="quiz-sidebar glass-panel-light pd-2">
            <h4>Live Status</h4>
            <div class="stat-box mt-1"><div class="stat-value text-teal">${answered}</div><div class="stat-label">Answered</div></div>
            <div class="stat-box mt-1 mb-2"><div class="stat-value text-orange">${total - answered}</div><div class="stat-label">Unanswered</div></div>
            <hr class="glass-divider my-2">
            <h4>Navigator</h4>
            <div class="navigator-grid mt-2">
              ${quizState.questions.map((_, i) => `
                <div class="nav-dot ${i === quizState.currentIdx ? 'active' : ''} ${quizState.answers[quizState.questions[i].id] ? 'answered' : ''}" data-idx="${i}">${i+1}</div>
              `).join('')}
            </div>
            <button class="btn btn-accent btn-block mt-3" id="submitEarlyBtn"><i class="fas fa-paper-plane"></i> Submit Early</button>
          </div>
        </div>
      </div>`;

    setupQuizEvents();
    startQuestionTimer();
  }

  function setupQuizEvents() {
    const q = quizState.questions[quizState.currentIdx];
    // Option selection
    root.querySelectorAll('.option-tile').forEach(tile => {
      tile.onclick = () => {
        root.querySelectorAll('.option-tile').forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        const sel = tile.dataset.opt;
        quizState.answers[q.id] = { selected: sel, correct: q.answer, is_correct: sel === q.answer };
      };
    });
    // Save
    document.getElementById('saveBtn').onclick = () => {
      if (!quizState.answers[q.id]) return toast('Please select an option first.', 'error');
      toast('Answer saved.');
      renderQuestion();
    };
    // Next / Final
    document.getElementById('nextBtn').onclick = () => {
      if (quizState.currentIdx < quizState.questions.length - 1) {
        clearInterval(quizState.interval);
        quizState.currentIdx++;
        renderQuestion();
      } else {
        finishQuiz();
      }
    };
    // Nav dots
    root.querySelectorAll('.nav-dot').forEach(dot => {
      dot.onclick = () => {
        clearInterval(quizState.interval);
        quizState.currentIdx = parseInt(dot.dataset.idx);
        renderQuestion();
      };
    });
    // Submit early
    document.getElementById('submitEarlyBtn').onclick = finishQuiz;
  }

  function startQuestionTimer() {
    clearInterval(quizState.interval);
    quizState.timer = 30;
    const txt = document.getElementById('timerText');
    const circle = document.getElementById('timerCircle');
    
    quizState.interval = setInterval(() => {
      quizState.timer--;
      if (txt) txt.textContent = quizState.timer;
      if (circle) circle.style.strokeDashoffset = 157 * (1 - quizState.timer/30);
      
      if (quizState.timer <= 0) {
        clearInterval(quizState.interval);
        toast('Time up! Moving to next...', 'warning');
        if (quizState.currentIdx < quizState.questions.length - 1) {
          quizState.currentIdx++; renderQuestion();
        } else {
          finishQuiz();
        }
      }
    }, 1000);
  }

  async function finishQuiz() {
    if (await showConfirm('Submit Quiz?', 'Are you sure you want to finish the challenge?')) {
      clearInterval(quizState.interval);
      let score = 0;
      Object.values(quizState.answers).forEach(a => { if (a.is_correct) score++; });
      const res = DB.saveResult(getSession().id, quizState.subject.id, score, quizState.questions.length, quizState.answers);
      quizState = null;
      Router.go('result', { id: res.id });
    }
  }

  renderQuestion();
};

// ── RESULT PAGE ───────────────────────────────
Pages.result = function({ id }) {
  const result = DB.getResultById(id);
  if (!result) return Router.go('studentDashboard');
  const sub = DB.getSubjects().find(s => s.id === result.subject_id);
  const root = document.getElementById('appRoot');
  const attempts = DB.get(NS.attempts).filter(a => a.user_id === result.user_id && a.is_correct !== undefined); // Simplified for review
  // Actually we need the specific questions for this result.
  // In a real app we'd link attempts to resultId. Here we'll just show the score and a generic review.
  
  root.innerHTML = `
    <div class="result-header text-center mb-3 mt-3">
      <h1 class="brand-title" style="font-size:3rem;">Challenge Complete</h1>
      <p class="text-muted text-large">${sub ? sub.name : 'Unknown'} Bank</p>
    </div>

    <div class="dashboard-grid">
      <div class="glass-card pd-3 text-center span-2" style="display:flex;justify-content:space-around;align-items:center;flex-wrap:wrap;gap:2rem;">
        <div class="metric-box">
          <div class="metric-value ${result.passed ? 'text-teal' : 'text-red'}" style="font-size:4rem;font-weight:900;">${result.score}/${result.total}</div>
          <div class="metric-label text-muted">Final Score</div>
        </div>
        <div class="metric-box">
          <div class="metric-value ${result.passed ? 'text-teal' : 'text-red'}" style="font-size:4rem;font-weight:900;">${result.pct}%</div>
          <div class="metric-label text-muted">Percentage</div>
        </div>
        <div class="metric-box">
          <div class="metric-value" style="font-size:3rem;font-weight:900;color:var(--accent-purple);">${result.passed ? 'PASSED' : 'FAILED'}</div>
          <div class="metric-label text-muted">Result Status</div>
        </div>
      </div>

      <div class="glass-card pd-3 span-2">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3><i class="fas fa-search text-teal"></i> Performance Summary</h3>
          <button class="btn btn-secondary btn-sm" id="exportPdfBtn"><i class="fas fa-file-pdf"></i> Export Results PDF</button>
        </div>
        <div class="mt-3 text-center">
          ${!result.passed ? '<p class="text-red mb-2">You did not meet the 40% passing threshold. Keep practicing!</p>' : '<p class="text-teal mb-2">Great job! You passed the subject challenge.</p>'}
          <div class="flex-row" style="justify-content:center;gap:1rem;">
            <button class="btn btn-primary" onclick="Router.go('studentDashboard')">Back to Dashboard</button>
            ${!result.passed ? `<button class="btn btn-secondary" onclick="Router.go('studentDashboard')">Try Again Tomorrow</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('exportPdfBtn').onclick = () => {
    toast('Generating PDF...');
    window.print(); // Simple PDF export via print to PDF
  };
};

// ── INITIALIZATION ────────────────────────────
function initApp() {
  DB.seedData();
  updateNav();
  setupAuthForms();
  setupRoleModal();
  
  // Decide starting page
  const s = getSession();
  if (s) {
    if (s.role === 'admin') Router.go('adminDashboard');
    else Router.go('studentDashboard');
  } else {
    Router.go('landing');
  }

  // Handle global key events or window focus for anti-cheat if needed here
}

DB.seedData = () => {
  if (DB.getSubjects().length > 0) return;
  const subs = [
    { id: 'sub1', name: 'Computer Science', desc: 'Core fundamentals of CS and Logic.' },
    { id: 'sub2', name: 'World History', desc: 'Major global events and eras.' }
  ];
  const qs = [
    { id: 'q1', subject_id: 'sub1', text: 'What does CPU stand for?', options: { A: 'Central Processing Unit', B: 'Computer Power Unit', C: 'Control Process Utility', D: 'Core Play Unit' }, answer: 'A' },
    { id: 'q2', subject_id: 'sub1', text: 'Which language is used for web logic?', options: { A: 'HTML', B: 'CSS', C: 'JavaScript', D: 'SQL' }, answer: 'C' },
    { id: 'q3', subject_id: 'sub2', text: 'In which year did WWII end?', options: { A: '1940', B: '1945', C: '1950', D: '1939' }, answer: 'B' }
  ];
  DB.set(NS.subjects, subs);
  DB.set(NS.questions, qs);
  console.log('Seeded demo data.');
};

document.addEventListener('DOMContentLoaded', initApp);
