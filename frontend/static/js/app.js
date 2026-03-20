/* =============================================
   AOQRWE — Full Frontend SPA (LocalStorage)
   ============================================= */
'use strict';

// ─── NAMESPACE KEYS ──────────────────────────
const NS = {
  users:    'AOQRWE_users',
  subjects: 'AOQRWE_subjects',
  questions:'AOQRWE_questions',
  results:  'AOQRWE_results',
  attempts: 'AOQRWE_attempts',
  session:  'AOQRWE_session',
};

// ─── DATA LAYER ──────────────────────────────
const DB = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  getObj(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  // Users
  findUser(email, role) { return DB.get(NS.users).find(u => u.email.toLowerCase() === email.toLowerCase() && u.role === role); },
  registerUser(name, email, password, role) {
    const users = DB.get(NS.users);
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.role === role))
      return { ok: false, msg: 'Email already registered for this role.' };
    const user = { id: DB.uid(), name, email: email.toLowerCase(), password, role };
    users.push(user); DB.set(NS.users, users);
    return { ok: true, user };
  },
  updatePassword(userId, newPass) {
    const users = DB.get(NS.users);
    const idx = users.findIndex(u => u.id === userId);
    if (idx >= 0) { users[idx].password = newPass; DB.set(NS.users, users); }
  },

  // Session
  getSession() { return DB.getObj(NS.session); },
  setSession(user) { localStorage.setItem(NS.session, JSON.stringify(user)); },
  clearSession() { localStorage.removeItem(NS.session); },

  // Subjects
  getSubjects() { return DB.get(NS.subjects); },
  addSubject(name, desc) {
    const subs = DB.get(NS.subjects);
    const s = { id: DB.uid(), name, desc: desc || '' };
    subs.push(s); DB.set(NS.subjects, subs); return s;
  },
  updateSubject(id, name, desc) {
    DB.set(NS.subjects, DB.get(NS.subjects).map(s => s.id === id ? { ...s, name, desc } : s));
  },
  deleteSubject(id) {
    DB.set(NS.subjects, DB.get(NS.subjects).filter(s => s.id !== id));
    DB.set(NS.questions, DB.get(NS.questions).filter(q => q.subject_id !== id));
  },

  // Questions
  getQuestions(sid) { return DB.get(NS.questions).filter(q => q.subject_id === sid); },
  getAllQuestions() { return DB.get(NS.questions); },
  addQuestion(sid, text, options, answer, explanation) {
    const qs = DB.get(NS.questions);
    const q = { id: DB.uid(), subject_id: sid, text, options, answer, explanation: explanation || '' };
    qs.push(q); DB.set(NS.questions, qs); return q;
  },
  updateQuestion(id, text, options, answer, explanation) {
    DB.set(NS.questions, DB.get(NS.questions).map(q => q.id === id ? { ...q, text, options, answer, explanation: explanation||'' } : q));
  },
  deleteQuestion(id) { DB.set(NS.questions, DB.get(NS.questions).filter(q => q.id !== id)); },

  // Results
  saveResult(userId, subjectId, score, total, answers) {
    const pct = Math.round((score / total) * 100);
    const r = { id: DB.uid(), user_id: userId, subject_id: subjectId, score, total, pct, passed: pct >= 40, timestamp: new Date().toISOString(), answers };
    const res = DB.get(NS.results); res.push(r); DB.set(NS.results, res);
    return r;
  },
  getResultsByUser(uid) { return DB.get(NS.results).filter(r => r.user_id === uid); },
  getResultById(id) { return DB.get(NS.results).find(r => r.id === id); },

  // Stats
  getStats() {
    const users = DB.get(NS.users).filter(u => u.role === 'student');
    const results = DB.get(NS.results);
    return { students: users.length, subjects: DB.get(NS.subjects).length, questions: DB.get(NS.questions).length, totalAttempts: results.length };
  }
};

// ─── SEED DEMO DATA ──────────────────────────
function seedData() {
  if (DB.getSubjects().length > 0) return;
  const subs = [
    { id: 'sub1', name: 'Computer Science', desc: 'Core fundamentals of CS and Logic.' },
    { id: 'sub2', name: 'World History', desc: 'Major global events and eras.' }
  ];
  const qs = [
    { id:'q1', subject_id:'sub1', text:'What does CPU stand for?', options:{A:'Central Processing Unit',B:'Computer Power Unit',C:'Control Process Utility',D:'Core Play Unit'}, answer:'A', explanation:'CPU stands for Central Processing Unit — the brain of the computer.' },
    { id:'q2', subject_id:'sub1', text:'Which language is used for web logic?', options:{A:'HTML',B:'CSS',C:'JavaScript',D:'SQL'}, answer:'C', explanation:'JavaScript runs in the browser and controls web page behavior.' },
    { id:'q3', subject_id:'sub2', text:'In which year did WWII end?', options:{A:'1940',B:'1945',C:'1950',D:'1939'}, answer:'B', explanation:'World War II ended in 1945 with the surrender of Germany and Japan.' }
  ];
  DB.set(NS.subjects, subs);
  DB.set(NS.questions, qs);
}

// ─── AUTH / SESSION HELPERS ──────────────────
let quizState = null;
function getSession() { return DB.getSession(); }
function isLoggedIn() { return !!getSession(); }
function requireAuth(role) {
  const s = getSession();
  if (!s || s.role !== role) { Router.go('landing'); return false; }
  return true;
}

// ─── TOAST ───────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}

// ─── CONFIRM DIALOG ──────────────────────────
function showConfirm(title, msg) {
  return new Promise(resolve => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    const modal = document.getElementById('confirmModal');
    modal.classList.add('active');
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    function cleanup() { modal.classList.remove('active'); ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); }
    function onOk() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

// ─── SUBMIT CONFIRM (checkbox) ───────────────
function showSubmitConfirm() {
  return new Promise(resolve => {
    const modal = document.getElementById('submitConfirmModal');
    const chk = document.getElementById('submitConfirmCheck');
    const okBtn = document.getElementById('submitConfirmOk');
    const cancelBtn = document.getElementById('submitConfirmCancel');
    chk.checked = false;
    okBtn.disabled = true;
    modal.classList.add('active');
    const onChk = () => { okBtn.disabled = !chk.checked; };
    const onOk = () => { modal.classList.remove('active'); chk.removeEventListener('change', onChk); okBtn.removeEventListener('click', onOk); cancelBtn.removeEventListener('click', onCancel); resolve(true); };
    const onCancel = () => { modal.classList.remove('active'); chk.removeEventListener('change', onChk); okBtn.removeEventListener('click', onOk); cancelBtn.removeEventListener('click', onCancel); resolve(false); };
    chk.addEventListener('change', onChk);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ─── ROUTER ──────────────────────────────────
const Router = {
  go(page, params = {}) {
    const root = document.getElementById('appRoot');
    root.innerHTML = '';
    Pages[page] ? Pages[page](params) : Pages.landing();
    updateNav();
    window.scrollTo(0, 0);
  }
};

// ─── NAV UPDATE ──────────────────────────────
function updateNav() {
  const navCenter = document.getElementById('navCenter');
  const navActions = document.getElementById('navActions');
  const s = getSession();
  if (s) {
    navCenter.innerHTML = '';
    navActions.innerHTML = `
      <span class="nav-user"><i class="fas fa-circle-user"></i> ${s.name}</span>
      <button class="btn btn-secondary btn-sm" id="navLogout">Logout</button>`;
    document.getElementById('navLogout').addEventListener('click', () => {
      DB.clearSession(); quizState = null; Router.go('landing'); toast('Logged out.');
    });
  } else {
    navCenter.innerHTML = `<button class="btn-start-nav" id="navStartBtn"><i class="fas fa-rocket"></i> Start 🚀</button>`;
    navActions.innerHTML = `<button class="btn btn-secondary btn-sm" id="navAuthBtn"><i class="fas fa-right-to-bracket"></i> Login / Signup</button>`;
    document.getElementById('navStartBtn').addEventListener('click', () => {
      document.getElementById('dashboardModal').classList.add('active');
    });
    document.getElementById('navAuthBtn').addEventListener('click', () => openAuthModal('student'));
  }
}

// ─── AUTH MODAL ──────────────────────────────
function openAuthModal(tab = 'student') {
  document.getElementById('authModal').classList.add('active');
  switchAuthTab(tab);
}
function closeAuthModal() { document.getElementById('authModal').classList.remove('active'); }
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('studentSection').classList.toggle('active', tab === 'student');
  document.getElementById('adminSection').classList.toggle('active', tab === 'admin');
}

function setupAuthForms() {
  // Tab switch
  document.querySelectorAll('.auth-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab));
  });
  // Form toggles (login/register)
  document.querySelectorAll('.auth-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const section = toggle.closest('.auth-section');
      section.querySelectorAll('.auth-toggle').forEach(t => t.classList.toggle('active', t === toggle));
      section.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      const target = document.getElementById(toggle.dataset.form + 'Form');
      if (target) target.classList.add('active');
    });
  });
  document.getElementById('closeAuthModal').addEventListener('click', closeAuthModal);
  document.getElementById('authModal').addEventListener('click', e => { if (e.target === document.getElementById('authModal')) closeAuthModal(); });

  // Student Login
  document.getElementById('studentLoginForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('sLoginEmail').value.trim();
    const pass = document.getElementById('sLoginPass').value;
    const user = DB.findUser(email, 'student');
    if (!user || user.password !== pass) { document.getElementById('sLoginErr').textContent = 'Invalid email or password.'; return; }
    document.getElementById('sLoginErr').textContent = '';
    DB.setSession(user); closeAuthModal(); toast(`Welcome back, ${user.name}!`);
    Router.go('studentDashboard');
  });

  // Student Register
  document.getElementById('studentRegisterForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('sRegName').value.trim();
    const email = document.getElementById('sRegEmail').value.trim();
    const pass = document.getElementById('sRegPass').value;
    if (!name || !email || !pass) { document.getElementById('sRegErr').textContent = 'All fields required.'; return; }
    if (pass.length < 6) { document.getElementById('sRegErr').textContent = 'Password min 6 chars.'; return; }
    const res = DB.registerUser(name, email, pass, 'student');
    if (!res.ok) { document.getElementById('sRegErr').textContent = res.msg; return; }
    document.getElementById('sRegErr').textContent = '';
    DB.setSession(res.user); closeAuthModal(); toast(`Welcome, ${name}!`);
    Router.go('studentDashboard');
  });

  // Admin Login
  document.getElementById('adminLoginForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('aLoginEmail').value.trim();
    const pass = document.getElementById('aLoginPass').value;
    const user = DB.findUser(email, 'admin');
    if (!user || user.password !== pass) { document.getElementById('aLoginErr').textContent = 'Invalid admin credentials.'; return; }
    document.getElementById('aLoginErr').textContent = '';
    DB.setSession(user); closeAuthModal(); toast(`Welcome, Admin ${user.name}!`);
    Router.go('adminDashboard');
  });

  // Admin Register
  document.getElementById('adminRegisterForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('aRegName').value.trim();
    const email = document.getElementById('aRegEmail').value.trim();
    const pass = document.getElementById('aRegPass').value;
    if (!name || !email || !pass) { document.getElementById('aRegErr').textContent = 'All fields required.'; return; }
    if (pass.length < 6) { document.getElementById('aRegErr').textContent = 'Password min 6 chars.'; return; }
    const res = DB.registerUser(name, email, pass, 'admin');
    if (!res.ok) { document.getElementById('aRegErr').textContent = res.msg; return; }
    document.getElementById('aRegErr').textContent = '';
    DB.setSession(res.user); closeAuthModal(); toast(`Admin registered. Welcome, ${name}!`);
    Router.go('adminDashboard');
  });
}

// ─── DASHBOARD MODAL SETUP ───────────────────
function setupDashboardModal() {
  document.getElementById('closeDashboardModal').addEventListener('click', () => {
    document.getElementById('dashboardModal').classList.remove('active');
  });
  document.getElementById('dashboardModal').addEventListener('click', e => {
    if (e.target === document.getElementById('dashboardModal'))
      document.getElementById('dashboardModal').classList.remove('active');
  });
  document.getElementById('goUserDashboard').addEventListener('click', () => {
    document.getElementById('dashboardModal').classList.remove('active');
    const s = getSession();
    if (s && s.role === 'student') { Router.go('studentDashboard'); return; }
    openAuthModal('student');
  });
  document.getElementById('goAdminDashboard').addEventListener('click', () => {
    document.getElementById('dashboardModal').classList.remove('active');
    const s = getSession();
    if (s && s.role === 'admin') { Router.go('adminDashboard'); return; }
    openAuthModal('admin');
  });
}

// -----------------------------------------------
// PAGES
// -----------------------------------------------
const Pages = {};

// -- LANDING PAGE -----------------------------
Pages.landing = function() {
  const s = getSession();
  if (s && s.role === 'admin') { Router.go('adminDashboard'); return; }
  if (s && s.role === 'student') { Router.go('studentDashboard'); return; }
  const root = document.getElementById('appRoot');
  const subs = DB.getSubjects();
  const results = DB.get(NS.results);
  const students = DB.get(NS.users).filter(u => u.role === 'student');
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
            <span class="hero-badge"><i class="fas fa-robot"></i> AI questions</span>
          </div>
        </div>
        <div class="hero-graphics">
          <div class="glass-card decorative-card">
            <i class="fas fa-brain fa-3x neon-text"></i>
            <h3 style="margin-top:1rem;">30-Second Challenge</h3>
            <p style="color:var(--text-muted);margin-top:.5rem;">Test your knowledge under pressure.</p>
            <div class="deco-stats">
              <div><strong class="text-teal" style="font-size:1.5rem;">${students.length}</strong><br><small>Students</small></div>
              <div><strong class="text-purple" style="font-size:1.5rem;">${subs.length}</strong><br><small>Subjects</small></div>
              <div><strong class="text-orange" style="font-size:1.5rem;">${results.length}</strong><br><small>Attempts</small></div>
            </div>
          </div>
        </div>
      </header>
    </div>`;
};

// -- STUDENT DASHBOARD -------------------------
Pages.studentDashboard = function() {
  if (!requireAuth('student')) return;
  const s = getSession();
  const root = document.getElementById('appRoot');
  const results = DB.getResultsByUser(s.id);
  const subjects = DB.getSubjects();
  root.innerHTML = `
    <div class="dashboard-header glass-panel mb-3">
      <div>
        <h2><i class="fas fa-user-graduate text-accent"></i> User Dashboard</h2>
        <p class="text-muted">Welcome, <strong>${s.name}</strong> &nbsp;|&nbsp;
          <span class="link-text" id="changePassBtn"><i class="fas fa-key"></i> Modify Password</span>
        </p>
      </div>
    </div>
    <div class="dashboard-grid">
      <div class="glass-card pd-2 span-2">
        <h3><i class="fas fa-layer-group text-teal"></i> Subjects</h3>
        <p class="text-muted small mb-2">Select a subject to Start Exam.</p>
        <div class="subject-grid mt-2" id="subjectGrid">
          ${subjects.length ? subjects.map(sub => {
            const count = DB.getQuestions(sub.id).length;
            return `
              <div class="subject-card glass-panel-light">
                <div class="subject-icon"><i class="fas fa-bolt text-purple fa-2x"></i></div>
                <h4>${sub.name}</h4>
                <p class="text-muted small">${sub.desc || 'No description'}</p>
                <div class="subject-stats mt-1">
                  <span class="badge"><i class="fas fa-question-circle"></i> ${count} Qs</span>
                </div>
                ${count > 0
                  ? `<button class="btn btn-primary mt-2 start-exam-btn" data-id="${sub.id}" style="width:100%;">
                      <i class="fas fa-play"></i> Start Exam
                     </button>`
                  : `<button class="btn btn-secondary mt-2" style="width:100%;" disabled>No Questions</button>`}
              </div>`;
          }).join('') : '<p class="text-muted pd-2">No subjects yet.</p>'}
        </div>
      </div>
      <div class="glass-card pd-2 span-2">
        <h3 class="mb-2"><i class="fas fa-history text-teal"></i> Quiz History</h3>
        <div class="activity-list">
          ${results.length ? results.sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp)).map(r => {
            const sub = subjects.find(sb => sb.id === r.subject_id);
            return `
              <div class="activity-item glass-panel-light mb-1">
                <div class="activity-header">
                  <strong>${sub ? sub.name : 'Deleted Subject'}</strong>
                  <span class="score-badge ${r.passed ? 'success' : 'danger'}">${r.score}/${r.total} (${r.pct}%)</span>
                </div>
                <div class="activity-meta text-muted small mt-1">
                  <span><i class="fas fa-calendar"></i> ${new Date(r.timestamp).toLocaleDateString()}</span>
                  <span class="link-text float-right view-result-btn" data-id="${r.id}">View Results</span>
                </div>
              </div>`;
          }).join('') : '<p class="text-muted small text-center pd-2">No attempts yet. Start an exam above!</p>'}
        </div>
      </div>
    </div>`;

  document.getElementById('changePassBtn').addEventListener('click', () => Router.go('modifyPassword'));
  root.querySelectorAll('.start-exam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = subjects.find(x => x.id === btn.dataset.id);
      startQuizFlow(sub);
    });
  });
  root.querySelectorAll('.view-result-btn').forEach(btn => {
    btn.addEventListener('click', () => Router.go('result', { id: btn.dataset.id }));
  });
};

// -- MODIFY PASSWORD ---------------------------
Pages.modifyPassword = function() {
  if (!isLoggedIn()) { Router.go('landing'); return; }
  const s = getSession();
  const root = document.getElementById('appRoot');
  const backPage = s.role === 'admin' ? 'adminDashboard' : 'studentDashboard';
  root.innerHTML = `
    <div class="glass-card pd-3" style="max-width:500px;margin:2rem auto;">
      <h2 class="mb-2"><i class="fas fa-key text-teal"></i> Modify Password</h2>
      <p class="text-muted mb-3">${s.email}</p>
      <form id="modPassForm">
        <div class="form-group">
          <i class="fas fa-lock text-icon"></i>
          <input type="password" id="curPass" placeholder="Current Password" required />
        </div>
        <div class="form-group">
          <i class="fas fa-shield-alt text-icon"></i>
          <input type="password" id="newPass" placeholder="New Password (min 6)" required />
        </div>
        <div id="modPassErr" class="form-error"></div>
        <div class="flex-row">
          <button type="button" class="btn btn-secondary" id="backBtn">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Password</button>
        </div>
      </form>
    </div>`;
  document.getElementById('backBtn').addEventListener('click', () => Router.go(backPage));
  document.getElementById('modPassForm').addEventListener('submit', e => {
    e.preventDefault();
    const cur = document.getElementById('curPass').value;
    const nxt = document.getElementById('newPass').value;
    const errEl = document.getElementById('modPassErr');
    if (cur !== s.password) { errEl.textContent = 'Incorrect current password.'; return; }
    if (nxt.length < 6) { errEl.textContent = 'New password too short.'; return; }
    DB.updatePassword(s.id, nxt);
    s.password = nxt; DB.setSession(s);
    toast('Password updated!'); Router.go(backPage);
  });
};

// -- ADMIN DASHBOARD ---------------------------
Pages.adminDashboard = function() {
  if (!requireAuth('admin')) return;
  const s = getSession();
  const root = document.getElementById('appRoot');
  const stats = DB.getStats();
  root.innerHTML = `
    <div class="dashboard-header glass-panel mb-3">
      <div>
        <h2><i class="fas fa-shield-alt text-accent"></i> Admin Dashboard</h2>
        <p class="text-muted">Welcome, <strong>${s.name}</strong> &nbsp;|&nbsp;
          <span class="link-text" id="aChangePassBtn"><i class="fas fa-key"></i> Modify Password</span>
        </p>
      </div>
      <div style="display:flex;gap:2rem;text-align:center;">
        <div><div class="text-teal font-bold" style="font-size:1.5rem;">${stats.students}</div><div class="text-muted small">Students</div></div>
        <div><div class="text-purple font-bold" style="font-size:1.5rem;">${stats.subjects}</div><div class="text-muted small">Subjects</div></div>
        <div><div class="text-orange font-bold" style="font-size:1.5rem;">${stats.totalAttempts}</div><div class="text-muted small">Attempts</div></div>
      </div>
    </div>
    <div class="glass-card pd-2">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h3><i class="fas fa-database text-purple"></i> Manage Subjects</h3>
        <button class="btn btn-primary btn-sm" id="createSubjectBtn"><i class="fas fa-plus"></i> New Subject</button>
      </div>
      <div id="adminSubjectList">
        ${DB.getSubjects().map(sub => `
          <div class="bank-item">
            <div style="flex:1;">
              <h4>${sub.name}</h4>
              <p class="text-muted small">${sub.desc || 'No description'}</p>
              <span class="badge small"><i class="fas fa-question-circle"></i> ${DB.getQuestions(sub.id).length} Qs</span>
            </div>
            <div class="bank-actions">
              <button class="btn btn-accent btn-sm manage-qs-btn" data-id="${sub.id}"><i class="fas fa-list-check"></i> Questions</button>
              <button class="btn btn-secondary btn-sm edit-sub-btn" data-id="${sub.id}"><i class="fas fa-edit"></i></button>
              <button class="btn btn-danger btn-sm delete-sub-btn" data-id="${sub.id}"><i class="fas fa-trash"></i></button>
            </div>
          </div>`).join('') || '<p class="text-muted text-center pd-3">No subjects yet. Click "New Subject".</p>'}
      </div>
    </div>`;

  document.getElementById('aChangePassBtn').addEventListener('click', () => Router.go('modifyPassword'));
  document.getElementById('createSubjectBtn').addEventListener('click', () => promptSubject());
  root.querySelectorAll('.manage-qs-btn').forEach(btn => btn.addEventListener('click', () => Router.go('manageQuestions', { id: btn.dataset.id })));
  root.querySelectorAll('.edit-sub-btn').forEach(btn => btn.addEventListener('click', () => promptSubject(btn.dataset.id)));
  root.querySelectorAll('.delete-sub-btn').forEach(btn => btn.addEventListener('click', async () => {
    if (await showConfirm('Delete Subject?', 'This removes the subject and all its questions.')) {
      DB.deleteSubject(btn.dataset.id); toast('Subject deleted.'); Router.go('adminDashboard');
    }
  }));
};

// -- SUBJECT PROMPT ----------------------------
async function promptSubject(id = null) {
  const sub = id ? DB.getSubjects().find(s => s.id === id) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-content glass-panel">
      <h3>${id ? 'Edit' : 'Create'} Subject</h3>
      <div class="form-group mt-2">
        <input type="text" id="pSubName" value="${sub ? sub.name : ''}" placeholder="Subject Name" class="form-control-cool" />
      </div>
      <div class="form-group">
        <textarea id="pSubDesc" placeholder="Brief description..." class="form-control-cool" rows="2">${sub ? sub.desc : ''}</textarea>
      </div>
      <div class="flex-row">
        <button class="btn btn-secondary" id="pSubCancel">Cancel</button>
        <button class="btn btn-primary" id="pSubSave">Save</button>
      </div>
    </div>`;
  document.getElementById('appRoot').appendChild(overlay);
  document.getElementById('pSubCancel').onclick = () => overlay.remove();
  document.getElementById('pSubSave').onclick = () => {
    const name = document.getElementById('pSubName').value.trim();
    const desc = document.getElementById('pSubDesc').value.trim();
    if (!name) return toast('Name required', 'error');
    if (id) DB.updateSubject(id, name, desc); else DB.addSubject(name, desc);
    overlay.remove(); toast('Subject saved.'); Router.go('adminDashboard');
  };
}

// -- MANAGE QUESTIONS --------------------------
Pages.manageQuestions = function({ id }) {
  if (!requireAuth('admin')) return;
  const sub = DB.getSubjects().find(s => s.id === id);
  if (!sub) return Router.go('adminDashboard');
  const root = document.getElementById('appRoot');

  function render() {
    const qs = DB.getQuestions(id);
    root.innerHTML = `
      <div class="dashboard-header glass-panel mb-3">
        <div>
          <h2><i class="fas fa-list-check text-accent"></i> Questions: ${sub.name}</h2>
          <button class="btn btn-secondary btn-sm mt-1" id="backToAdmin"><i class="fas fa-arrow-left"></i> Back</button>
        </div>
        <div style="display:flex;gap:.8rem;">
          <button class="btn btn-accent btn-sm" id="uploadPdfBtn"><i class="fas fa-file-pdf"></i> Upload PDF</button>
          <button class="btn btn-primary btn-sm" id="addQBtn"><i class="fas fa-plus"></i> Add Question</button>
        </div>
      </div>
      <div id="pdfUploadSection" style="display:none;" class="glass-card pd-2 mb-3">
        <h3 class="mb-2"><i class="fas fa-robot text-teal"></i> AI Question Generator from PDF</h3>
        <div class="pdf-upload-panel" id="pdfDropZone">
          <label class="pdf-upload-label" for="pdfFileInput">
            <i class="fas fa-cloud-upload-alt"></i>
            <span id="pdfFileName">Click or drag a PDF here</span>
            <small class="text-muted">Supported: .pdf files only</small>
          </label>
          <input type="file" id="pdfFileInput" accept=".pdf" />
        </div>
        <div class="pdf-count-row">
          <label>Questions to generate:</label>
          <input type="number" id="pdfCount" value="5" min="1" max="30" />
          <button class="btn btn-primary" id="generateQsBtn"><i class="fas fa-magic"></i> Generate</button>
        </div>
        <div id="generatedPreview" class="generated-preview"></div>
        <div id="importBtnRow" style="display:none;margin-top:1rem;">
          <button class="btn btn-primary" id="importSelectedBtn"><i class="fas fa-download"></i> Import Selected</button>
        </div>
      </div>
      <div class="glass-card pd-2">
        <div id="qsList">
          ${qs.length ? qs.map((q, i) => `
            <div class="question-item">
              <div style="flex:1;">
                <strong>Q${i+1}: ${q.text}</strong>
                <div class="q-opts-grid mt-1">
                  ${Object.entries(q.options).map(([k,v]) => `
                    <div class="small ${q.answer===k ? 'text-teal font-bold' : 'text-muted'}">${k}: ${v} ${q.answer===k ? '?' : ''}</div>`).join('')}
                </div>
                ${q.explanation ? `<div class="explanation-box mt-1"><i class="fas fa-lightbulb text-accent"></i> ${q.explanation}</div>` : ''}
              </div>
              <div class="bank-actions">
                <button class="btn btn-secondary btn-sm edit-q-btn" data-id="${q.id}"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm delete-q-btn" data-id="${q.id}"><i class="fas fa-trash"></i></button>
              </div>
            </div>`).join('') : '<p class="text-muted text-center pd-3">No questions yet. Add one or upload a PDF.</p>'}
        </div>
      </div>`;

    document.getElementById('backToAdmin').onclick = () => Router.go('adminDashboard');
    document.getElementById('addQBtn').onclick = () => promptQuestion(id, null, render);
    document.getElementById('uploadPdfBtn').onclick = () => {
      const sec = document.getElementById('pdfUploadSection');
      sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    };
    setupPdfUpload(id, render);
    root.querySelectorAll('.edit-q-btn').forEach(btn => btn.onclick = () => promptQuestion(id, btn.dataset.id, render));
    root.querySelectorAll('.delete-q-btn').forEach(btn => btn.onclick = async () => {
      if (await showConfirm('Delete Question?', 'Remove this question permanently?')) {
        DB.deleteQuestion(btn.dataset.id); toast('Deleted.'); render();
      }
    });
  }
  render();
};

// -- PDF UPLOAD & AI GENERATION ----------------
function setupPdfUpload(subjectId, onDone) {
  let selectedFile = null;
  let generatedQuestions = [];

  const fileInput = document.getElementById('pdfFileInput');
  const dropZone = document.getElementById('pdfDropZone');
  const fileName = document.getElementById('pdfFileName');

  if (!fileInput) return;

  fileInput.addEventListener('change', e => {
    selectedFile = e.target.files[0];
    if (selectedFile) fileName.textContent = selectedFile.name;
  });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    selectedFile = e.dataTransfer.files[0];
    if (selectedFile) fileName.textContent = selectedFile.name;
  });

  document.getElementById('generateQsBtn').addEventListener('click', async () => {
    if (!selectedFile) { toast('Please select a PDF file first.', 'error'); return; }
    const count = parseInt(document.getElementById('pdfCount').value) || 5;
    const preview = document.getElementById('generatedPreview');
    preview.innerHTML = '<div class="loading-state"><div class="spinner"></div> Analyzing PDF and generating questions...</div>';
    document.getElementById('importBtnRow').style.display = 'none';

    try {
      const formData = new FormData();
      formData.append('pdf', selectedFile);
      formData.append('count', count);
      const response = await fetch('http://localhost:5000/analyze-pdf', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Service error');
      generatedQuestions = await response.json();
    } catch {
      // Fallback mock if Python service not running
      generatedQuestions = generateMockQuestions(count);
      toast('AI service offline � showing sample questions. Run pdf_service.py for real generation.', 'warning');
    }
    renderGeneratedQuestions(generatedQuestions, preview);
  });

  document.getElementById('importSelectedBtn').addEventListener('click', () => {
    const checked = document.querySelectorAll('.gen-q-check:checked');
    if (!checked.length) { toast('Select at least one question.', 'error'); return; }
    checked.forEach(chk => {
      const idx = parseInt(chk.dataset.idx);
      const q = generatedQuestions[idx];
      DB.addQuestion(subjectId, q.text, q.options, q.answer, q.explanation);
    });
    toast(`${checked.length} question(s) imported!`);
    document.getElementById('pdfUploadSection').style.display = 'none';
    onDone();
  });
}

function renderGeneratedQuestions(qs, container) {
  if (!qs.length) { container.innerHTML = '<p class="text-muted text-center">No questions generated.</p>'; return; }
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <h4 class="text-teal"><i class="fas fa-check-double"></i> ${qs.length} Questions Generated</h4>
      <label style="cursor:pointer;font-size:.9rem;color:var(--text-muted);">
        <input type="checkbox" id="selectAllGen" /> Select All
      </label>
    </div>
    ${qs.map((q, i) => `
      <div class="gen-q-card" id="genCard${i}">
        <div class="gen-q-header">
          <input type="checkbox" class="gen-q-check" data-idx="${i}" style="margin-top:4px;accent-color:var(--accent-teal);" />
          <strong>${i+1}. ${q.text}</strong>
        </div>
        <div class="gen-q-opts">
          ${Object.entries(q.options).map(([k,v]) => `
            <div class="gen-q-opt ${q.answer===k ? 'correct' : ''}">${k}: ${v} ${q.answer===k ? '?' : ''}</div>`).join('')}
        </div>
        ${q.explanation ? `<div class="gen-q-explanation"><i class="fas fa-lightbulb"></i> ${q.explanation}</div>` : ''}
      </div>`).join('')}`;
  document.getElementById('importBtnRow').style.display = 'block';
  document.getElementById('selectAllGen').addEventListener('change', e => {
    document.querySelectorAll('.gen-q-check').forEach(c => c.checked = e.target.checked);
  });
  document.querySelectorAll('.gen-q-check').forEach(c => {
    c.addEventListener('change', () => {
      const card = document.getElementById(`genCard${c.dataset.idx}`);
      card.classList.toggle('selected', c.checked);
    });
  });
}

function generateMockQuestions(count) {
  const pool = [
    { text: 'What is Artificial Intelligence?', options:{A:'Computer vision only',B:'Simulation of human intelligence in machines',C:'Internet protocol',D:'Data storage technique'}, answer:'B', explanation:'AI refers to simulation of human-like intelligence in machines.' },
    { text: 'What does RAM stand for?', options:{A:'Random Access Memory',B:'Read And Modify',C:'Rapid Application Mode',D:'Remote Access Machine'}, answer:'A', explanation:'RAM is the short-term memory of a computer used for running programs.' },
    { text: 'Which is a programming language?', options:{A:'HTTP',B:'HTML',C:'Python',D:'JSON'}, answer:'C', explanation:'Python is a versatile programming language widely used in AI and web development.' },
    { text: 'What is machine learning?', options:{A:'Teaching machines to speak',B:'Manually coding instructions',C:'Systems that learn from data',D:'Hardware engineering'}, answer:'C', explanation:'Machine learning enables systems to learn and improve from experience.' },
    { text: 'What is a neural network?', options:{A:'Computer network',B:'Biological concept only',C:'Interconnected nodes inspired by the brain',D:'A type of database'}, answer:'C', explanation:'Neural networks are computing systems inspired by biological neural networks.' },
  ];
  const result = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) result.push(pool[i]);
  for (let i = pool.length; i < count; i++) {
    const base = pool[i % pool.length];
    result.push({ ...base, text: `(Sample ${i+1}) ${base.text}` });
  }
  return result;
}

// -- QUESTION PROMPT ---------------------------
async function promptQuestion(subId, qId = null, onDone) {
  const q = qId ? DB.getAllQuestions().find(x => x.id === qId) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal-content glass-panel" style="max-width:600px;max-height:90vh;overflow-y:auto;">
      <h3>${qId ? 'Edit' : 'Add'} Question</h3>
      <div class="form-group mt-2">
        <textarea id="pQText" placeholder="Question Text..." class="form-control-cool" rows="3">${q ? q.text : ''}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
        <input type="text" id="pOptA" value="${q ? q.options.A : ''}" placeholder="Option A" class="form-control-cool" />
        <input type="text" id="pOptB" value="${q ? q.options.B : ''}" placeholder="Option B" class="form-control-cool" />
        <input type="text" id="pOptC" value="${q ? q.options.C : ''}" placeholder="Option C" class="form-control-cool" />
        <input type="text" id="pOptD" value="${q ? q.options.D : ''}" placeholder="Option D" class="form-control-cool" />
      </div>
      <div class="form-group">
        <label class="small text-muted">Correct Answer:</label>
        <select id="pQAns" class="form-control-cool">
          ${['A','B','C','D'].map(x => `<option value="${x}" ${q?.answer===x?'selected':''}>${x}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <textarea id="pQExp" placeholder="Explanation (optional)..." class="form-control-cool" rows="2">${q ? q.explanation||'' : ''}</textarea>
      </div>
      <div class="flex-row">
        <button class="btn btn-secondary" id="pQCancel">Cancel</button>
        <button class="btn btn-primary" id="pQSave">Save Question</button>
      </div>
    </div>`;
  document.getElementById('appRoot').appendChild(overlay);
  document.getElementById('pQCancel').onclick = () => overlay.remove();
  document.getElementById('pQSave').onclick = () => {
    const text = document.getElementById('pQText').value.trim();
    const opts = { A: document.getElementById('pOptA').value.trim(), B: document.getElementById('pOptB').value.trim(), C: document.getElementById('pOptC').value.trim(), D: document.getElementById('pOptD').value.trim() };
    const ans = document.getElementById('pQAns').value;
    const exp = document.getElementById('pQExp').value.trim();
    if (!text || !opts.A || !opts.B || !opts.C || !opts.D) return toast('Fill all fields.', 'error');
    if (qId) DB.updateQuestion(qId, text, opts, ans, exp);
    else DB.addQuestion(subId, text, opts, ans, exp);
    overlay.remove(); toast('Question saved.'); if (onDone) onDone();
  };
}

// -----------------------------------------------
// QUIZ ENGINE
// -----------------------------------------------

function startQuizFlow(subject) {
  const qs = DB.getQuestions(subject.id);
  if (!qs.length) return toast('This subject has no questions yet.', 'error');
  quizState = {
    subject,
    questions: qs.sort(() => Math.random() - 0.5),
    currentIdx: 0,
    answers: {},
    timer: 30,
    interval: null
  };
  Router.go('quiz');
}

Pages.quiz = function() {
  if (!quizState) return Router.go('studentDashboard');
  const root = document.getElementById('appRoot');

  function renderQuestion() {
    const q = quizState.questions[quizState.currentIdx];
    const total = quizState.questions.length;
    const idx = quizState.currentIdx;
    const isLast = idx === total - 1;
    const answered = Object.keys(quizState.answers).length;
    const unanswered = total - answered;
    const pct = Math.round((idx / total) * 100);

    root.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-header glass-panel mb-2">
          <div>
            <h2><i class="fas fa-bolt text-teal"></i> ${quizState.subject.name}</h2>
            <div style="margin-top:.4rem;">
              <div style="background:rgba(255,255,255,0.08);border-radius:20px;height:6px;width:200px;">
                <div style="background:var(--accent-teal);width:${pct}%;height:6px;border-radius:20px;transition:width .4s;"></div>
              </div>
              <small class="text-muted">Question ${idx+1} of ${total}</small>
            </div>
          </div>
          <div class="timer-wrapper">
            <svg class="circular-timer" width="64" height="64">
              <circle class="timer-bg" cx="32" cy="32" r="27"></circle>
              <circle class="timer-progress" id="timerCircle" cx="32" cy="32" r="27"
                style="stroke-dasharray:169.6;stroke-dashoffset:0;"></circle>
            </svg>
            <div class="timer-text" id="timerText">30</div>
          </div>
        </div>

        <div class="quiz-layout">
          <div class="question-area glass-card pd-3">
            <h3 class="text-large mb-3">${q.text}</h3>
            <div id="optsBox">
              ${['A','B','C','D'].map(opt => `
                <div class="option-tile ${quizState.answers[q.id]?.selected===opt?'selected':''}" data-opt="${opt}">
                  <div class="opt-letter">${opt}</div>
                  <div class="opt-text">${q.options[opt]}</div>
                </div>`).join('')}
            </div>
            <div class="quiz-actions mt-3">
              <button class="btn btn-secondary" id="prevBtn" ${idx===0?'disabled':''}>
                <i class="fas fa-arrow-left"></i> Previous
              </button>
              <button class="btn btn-primary" id="nextBtn">
                ${isLast ? '<i class="fas fa-paper-plane"></i> Submit' : '<i class="fas fa-arrow-right"></i> Save & Next'}
              </button>
            </div>
          </div>

          <div class="quiz-sidebar glass-panel-light pd-2">
            <h4 class="mb-2">Live Status</h4>
            <div class="stat-box mb-1" style="border-left:3px solid var(--accent-green);">
              <div class="stat-value text-green">${answered}</div>
              <div class="stat-label">Answered</div>
            </div>
            <div class="stat-box mb-2" style="border-left:3px solid var(--accent-orange);">
              <div class="stat-value text-orange">${unanswered}</div>
              <div class="stat-label">Unanswered</div>
            </div>
            <hr class="glass-divider my-2" />
            <h4 class="mb-1">Navigator</h4>
            <div class="navigator-grid mt-1">
              ${quizState.questions.map((_, i) => {
                let cls = '';
                if (i === idx) cls = 'current';
                else if (quizState.answers[quizState.questions[i].id]) cls = 'answered';
                else cls = 'unanswered';
                return `<div class="nav-dot ${cls}" data-idx="${i}" title="Q${i+1}">${i+1}</div>`;
              }).join('')}
            </div>
            <button class="btn btn-danger mt-3" id="submitEarlyBtn" style="width:100%;font-size:.85rem;">
              <i class="fas fa-flag-checkered"></i> Submit Early
            </button>
          </div>
        </div>
      </div>`;

    setupQuizEvents(q, isLast);
    startTimer(q, isLast);
  }

  function setupQuizEvents(q, isLast) {
    // Option selection
    root.querySelectorAll('.option-tile').forEach(tile => {
      tile.onclick = () => {
        root.querySelectorAll('.option-tile').forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        quizState.answers[q.id] = { selected: tile.dataset.opt, correct: q.answer, is_correct: tile.dataset.opt === q.answer };
      };
    });
    // Previous
    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) prevBtn.onclick = () => {
      if (quizState.currentIdx > 0) { clearTimer(); quizState.currentIdx--; renderQuestion(); }
    };
    // Next / Submit
    document.getElementById('nextBtn').onclick = () => {
      if (!isLast) { clearTimer(); quizState.currentIdx++; renderQuestion(); }
      else finishQuiz();
    };
    // Navigator dots
    root.querySelectorAll('.nav-dot').forEach(dot => {
      dot.onclick = () => { clearTimer(); quizState.currentIdx = parseInt(dot.dataset.idx); renderQuestion(); };
    });
    // Early submit
    document.getElementById('submitEarlyBtn').onclick = finishQuiz;
  }

  function startTimer(q, isLast) {
    clearTimer();
    quizState.timer = 30;
    let timerFired = false;
    const txt = document.getElementById('timerText');
    const circle = document.getElementById('timerCircle');
    const circumference = 169.6;

    quizState.interval = setInterval(() => {
      if (timerFired) return;
      quizState.timer--;
      if (!txt || !circle) { clearTimer(); return; }
      txt.textContent = Math.max(0, quizState.timer);
      const offset = circumference * (1 - Math.max(0, quizState.timer) / 30);
      circle.style.strokeDashoffset = offset;
      if (quizState.timer <= 10) { circle.className = 'timer-progress danger'; txt.style.color = 'var(--accent-red)'; }
      else if (quizState.timer <= 20) { circle.className = 'timer-progress warning'; txt.style.color = 'var(--accent-orange)'; }
      if (quizState.timer <= 0) {
        timerFired = true;
        clearTimer();
        toast('Time up! Moving on...', 'warning');
        if (!isLast) { quizState.currentIdx++; renderQuestion(); }
        else finishQuiz();
      }
    }, 1000);
  }

  function clearTimer() { clearInterval(quizState.interval); quizState.interval = null; }

  async function finishQuiz() {
    clearTimer();
    const confirmed = await showSubmitConfirm();
    if (!confirmed) { renderQuestion(); return; }
    let score = 0;
    Object.values(quizState.answers).forEach(a => { if (a.is_correct) score++; });
    const res = DB.saveResult(getSession().id, quizState.subject.id, score, quizState.questions.length, quizState.answers);
    // Preserve questions for review
    const reviewData = { questions: quizState.questions, answers: quizState.answers };
    quizState = null;
    Router.go('result', { id: res.id, reviewData });
  }

  renderQuestion();
};

// -----------------------------------------------
// RESULT PAGE
// -----------------------------------------------
Pages.result = function({ id, reviewData }) {
  const result = DB.getResultById(id);
  if (!result) return Router.go('studentDashboard');
  const sub = DB.getSubjects().find(s => s.id === result.subject_id);
  const root = document.getElementById('appRoot');

  root.innerHTML = `
    <div class="result-header">
      <h1 class="brand-title" style="font-size:2.8rem;">Exam Complete!</h1>
      <p class="text-muted" style="font-size:1.2rem;">${sub ? sub.name : 'Subject'}</p>
    </div>
    <div class="dashboard-grid">
      <div class="glass-card pd-3 text-center span-2" style="display:flex;justify-content:space-around;align-items:center;flex-wrap:wrap;gap:2rem;">
        <div class="metric-box">
          <div class="metric-value ${result.passed?'text-green':'text-red'}">${result.score}/${result.total}</div>
          <div class="metric-label">Score</div>
        </div>
        <div class="metric-box">
          <div class="metric-value ${result.passed?'text-green':'text-red'}">${result.pct}%</div>
          <div class="metric-label">Percentage</div>
        </div>
        <div class="metric-box">
          <div class="metric-value" style="color:${result.passed?'var(--accent-green)':'var(--accent-red)'};">${result.passed?'PASSED':'FAILED'}</div>
          <div class="metric-label">Status</div>
        </div>
      </div>
      <div class="glass-card pd-3 span-2 text-center">
        <p class="${result.passed?'text-green':'text-red'} mb-3">${result.passed?'Excellent work! You cleared the passing threshold.':'You did not meet the 40% threshold. Keep practicing!'}</p>
        <div class="flex-row" style="justify-content:center;flex-wrap:wrap;gap:1rem;">
          <button class="btn btn-secondary" id="backDashBtn"><i class="fas fa-home"></i> Dashboard</button>
          ${reviewData ? `<button class="btn btn-accent" id="reviewBtn"><i class="fas fa-eye"></i> Review Questions</button>` : ''}
          <button class="btn btn-primary" id="exportPdfBtn"><i class="fas fa-file-pdf"></i> Export PDF</button>
        </div>
      </div>
    </div>`;

  document.getElementById('backDashBtn').onclick = () => Router.go('studentDashboard');
  if (reviewData) {
    document.getElementById('reviewBtn').onclick = () => Router.go('reviewQuestions', { result, sub, reviewData });
  }
  document.getElementById('exportPdfBtn').onclick = () => exportResultPDF(result, sub);
};

// -----------------------------------------------
// REVIEW QUESTIONS PAGE
// -----------------------------------------------
Pages.reviewQuestions = function({ result, sub, reviewData }) {
  const root = document.getElementById('appRoot');
  const { questions, answers } = reviewData;

  root.innerHTML = `
    <div class="dashboard-header glass-panel mb-3" style="flex-wrap:wrap;gap:1rem;">
      <div>
        <h2><i class="fas fa-eye text-teal"></i> Review: ${sub ? sub.name : 'Exam'}</h2>
        <p class="text-muted">Score: <strong>${result.score}/${result.total}</strong> (${result.pct}%)</p>
      </div>
      <div class="flex-row" style="gap:.8rem;flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" id="backResultBtn"><i class="fas fa-arrow-left"></i> Results</button>
        <button class="btn btn-primary btn-sm" id="exportReviewPdfBtn"><i class="fas fa-file-pdf"></i> Export PDF</button>
      </div>
    </div>
    <div class="review-container">
      ${questions.map((q, i) => {
        const ans = answers[q.id];
        const sel = ans?.selected;
        const correct = q.answer;
        let status = 'skipped', badge = 'skipped', badgeLabel = 'Skipped';
        if (sel) { status = sel === correct ? 'correct' : 'wrong'; badge = status; badgeLabel = status === 'correct' ? 'Correct' : 'Wrong'; }
        return `
          <div class="review-q-card">
            <div class="review-q-header">
              <h4>Q${i+1}: ${q.text}</h4>
              <span class="review-badge ${badge}">${badgeLabel}</span>
            </div>
            <div>
              ${['A','B','C','D'].map(opt => {
                let cls = '';
                if (opt === correct) cls = 'correct-ans';
                else if (opt === sel && sel !== correct) cls = 'wrong-ans';
                return `
                  <div class="option-tile ${cls}" style="cursor:default;">
                    <div class="opt-letter">${opt}</div>
                    <div class="opt-text">
                      ${q.options[opt]}
                      ${opt===correct?' <i class="fas fa-check" style="color:var(--accent-green);margin-left:.5rem;"></i>':''}
                      ${opt===sel&&sel!==correct?' <i class="fas fa-times" style="color:var(--accent-red);margin-left:.5rem;"></i>':''}
                    </div>
                  </div>`;
              }).join('')}
            </div>
            ${q.explanation ? `<div class="explanation-box"><i class="fas fa-lightbulb text-accent"></i> <strong>Explanation:</strong> ${q.explanation}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;

  document.getElementById('backResultBtn').onclick = () => Router.go('result', { id: result.id, reviewData });
  document.getElementById('exportReviewPdfBtn').onclick = () => exportReviewPDF(result, sub, questions, answers);
};

// -----------------------------------------------
// PDF EXPORT
// -----------------------------------------------
function exportResultPDF(result, sub) {
  toast('Generating PDF...', 'success');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 20;
    doc.setFont('helvetica','bold');
    doc.setFontSize(22);
    doc.text('AOQRWE � Exam Result', 105, y, { align:'center' }); y += 12;
    doc.setFontSize(14);
    doc.setFont('helvetica','normal');
    doc.text(`Subject: ${sub ? sub.name : 'Unknown'}`, 105, y, { align:'center' }); y += 10;
    doc.text(`Date: ${new Date(result.timestamp).toLocaleString()}`, 105, y, { align:'center' }); y += 16;
    doc.setFontSize(12);
    doc.text(`Score: ${result.score} / ${result.total}`, 20, y); y += 8;
    doc.text(`Percentage: ${result.pct}%`, 20, y); y += 8;
    doc.text(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`, 20, y); y += 8;
    doc.text(`Passing mark: 40%`, 20, y); y += 16;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Generated by AOQRWE � Advanced Online Quiz System', 105, 285, { align:'center' });
    doc.save(`AOQRWE_Result_${result.id}.pdf`);
  } catch(e) { window.print(); }
}

function exportReviewPDF(result, sub, questions, answers) {
  toast('Generating review PDF...', 'success');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 20;
    doc.setFont('helvetica','bold'); doc.setFontSize(18);
    doc.text('AOQRWE � Question Review', 105, y, { align:'center' }); y += 10;
    doc.setFont('helvetica','normal'); doc.setFontSize(11);
    doc.text(`Subject: ${sub?sub.name:'?'} | Score: ${result.score}/${result.total} (${result.pct}%)`, 105, y, { align:'center' }); y += 14;

    questions.forEach((q, i) => {
      if (y > 260) { doc.addPage(); y = 20; }
      const ans = answers[q.id];
      const isCorrect = ans?.is_correct;
      const isSkipped = !ans;
      doc.setFont('helvetica','bold'); doc.setFontSize(10);
      const status = isSkipped ? '[Skipped]' : isCorrect ? '[Correct]' : '[Wrong]';
      const lines = doc.splitTextToSize(`Q${i+1}: ${q.text}`, 160);
      doc.text(`${status}`, 20, y); y += 6;
      lines.forEach(l => { doc.text(l, 20, y); y += 5; });
      doc.setFont('helvetica','normal'); doc.setFontSize(9);
      ['A','B','C','D'].forEach(k => {
        const marker = k === q.answer ? '? ' : (ans?.selected===k&&k!==q.answer ? '? ' : '  ');
        doc.text(`${marker}${k}: ${q.options[k]}`, 25, y); y += 5;
      });
      if (q.explanation) { const el = doc.splitTextToSize(`Explanation: ${q.explanation}`, 155); el.forEach(l => { doc.text(l, 25, y); y += 4; }); }
      y += 4;
    });
    doc.setFontSize(8); doc.setTextColor(100);
    doc.text('Generated by AOQRWE', 105, 290, { align:'center' });
    doc.save(`AOQRWE_Review_${result.id}.pdf`);
  } catch(e) { window.print(); }
}

// -----------------------------------------------
// INIT
// -----------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  seedData();
  setupAuthForms();
  setupDashboardModal();
  const s = getSession();
  if (s && s.role === 'admin') Router.go('adminDashboard');
  else if (s && s.role === 'student') Router.go('studentDashboard');
  else Router.go('landing');
});
