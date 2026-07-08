const API = 'http://localhost:3000/api';

let savedUser = null;
try { 
  const p = JSON.parse(localStorage.getItem('es_user')); 
  if(p && typeof p === 'object' && p.role) savedUser = p;
  else { localStorage.removeItem('es_user'); localStorage.removeItem('es_token'); }
} catch(e) { localStorage.removeItem('es_user'); localStorage.removeItem('es_token'); }

const S = {
  token: localStorage.getItem('es_token') || null,
  user: savedUser,
  view: 'landing',
  complaints: [],
  notifs: [],
  photos: { before: null, after: null },
  loc: { lat: null, lng: null },
  maps: {},
  charts: {}
};

// ─── AUTH HEADERS ───
const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...(S.token ? { 'Authorization': `Bearer ${S.token}` } : {})
});

// ─── API FETCH WRAPPER ───
async function api(method, path, body = null) {
  try {
    const res = await fetch(API + path, {
      method,
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API Error');
    return data;
  } catch (err) {
    throw err;
  }
}

// ─── TOASTS ───
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'err' ? '❌' : type === 'warn' ? '⚠️' : type === 'info' ? 'ℹ️' : '✅'}</span><span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 3500);
}

// ─── ROUTING ───
const VIEWS = ['landing','citizen-auth','worker-auth','admin-auth','citizen-dash','report','tracking','worker-dash','admin-dash'];

function go(v, params = {}) {
  VIEWS.forEach(id => { const el = document.getElementById('v-' + id); if(el) el.classList.remove('active'); });
  const el = document.getElementById('v-' + v);
  if(el) { el.classList.add('active'); window.scrollTo(0,0); }
  S.view = v;
  updateNav();
  
  if(v === 'citizen-dash') loadCitizen();
  if(v === 'worker-dash') loadWorker();
  if(v === 'admin-dash') loadAdmin();
  if(v === 'report') initReport();
  if(v === 'tracking' && params.id) loadTracking(params.id);
}
function goHome() { go(S.user ? (S.user.role+'-dash') : 'landing'); }

function updateNav() {
  const nb = document.getElementById('navbar');
  nb.classList.remove('hidden');
  
  const links = document.getElementById('nb-links');
  const uinfo = document.getElementById('nb-user-info');
  const guestLinks = document.getElementById('nb-guest-links');
  
  if(!S.user) {
    links.innerHTML = ''; uinfo.innerHTML = '';
    document.getElementById('nb-bell').classList.add('hidden');
    document.querySelector('.nb-logout-btn').classList.add('hidden');
    if(guestLinks) guestLinks.classList.remove('hidden');
    return;
  }
  
  if(guestLinks) guestLinks.classList.add('hidden');
  document.getElementById('nb-bell').classList.remove('hidden');
  document.querySelector('.nb-logout-btn').classList.remove('hidden');
  
  document.getElementById('nb-bell').classList.remove('hidden');
  document.querySelector('.nb-logout-btn').classList.remove('hidden');
  
  const navs = {
    citizen: [{l:'🏠 Dash',v:'citizen-dash'}, {l:'📸 Report',v:'report'}],
    worker: [{l:'🏠 Dash',v:'worker-dash'}],
    admin: [{l:'🛡️ Dash',v:'admin-dash'}]
  };
  links.innerHTML = (navs[S.user.role]||[]).map(x => `<button class="nb-link ${S.view===x.v?'active':''}" onclick="go('${x.v}')">${x.l}</button>`).join('');
  
  uinfo.innerHTML = `<div class="nb-av">${S.user.name.slice(0,2).toUpperCase()}</div><div><div class="nb-nm">${S.user.name}</div><div class="nb-rl">${S.user.role}</div></div>`;
  loadNotifs();
}

// ─── AUTHENTICATION ───
function cTab(t) {
  document.getElementById('cf-login').classList.toggle('hidden', t!=='login');
  document.getElementById('cf-register').classList.toggle('hidden', t!=='register');
  document.getElementById('ca-l').classList.toggle('active', t==='login');
  document.getElementById('ca-r').classList.toggle('active', t==='register');
}
function wAuthTab(t) {
  document.getElementById('wf-login').classList.toggle('hidden', t!=='login');
  document.getElementById('wf-register').classList.toggle('hidden', t!=='register');
  document.getElementById('wa-l').classList.toggle('active', t==='login');
  document.getElementById('wa-r').classList.toggle('active', t==='register');
}
function fill(eid, pid, e, p) { document.getElementById(eid).value=e; document.getElementById(pid).value=p; }

async function doLogin(e, role) {
  e.preventDefault();
  let email, pass;
  if(role === 'citizen') { email = document.getElementById('cl-email').value; pass = document.getElementById('cl-pw').value; }
  if(role === 'worker') { email = document.getElementById('wl-email').value; pass = document.getElementById('wl-pw').value; }
  if(role === 'admin') { email = document.getElementById('al-email').value; pass = document.getElementById('al-pw').value; }
  
  try {
    const res = await api('POST', '/auth/login', { email, password: pass });
    if(res.user.role !== role) throw new Error('Incorrect portal for this account type.');
    loginOk(res);
  } catch(err) { toast(err.message, 'err'); }
}

async function doRegister(e, role) {
  e.preventDefault();
  const pfx = role === 'citizen' ? 'cr' : 'wr';
  try {
    const res = await api('POST', '/auth/register', {
      name: document.getElementById(pfx+'-name').value,
      email: document.getElementById(pfx+'-email').value,
      password: document.getElementById(pfx+'-pw').value,
      phone: document.getElementById(pfx+'-phone').value,
      role: role
    });
    toast('Registered successfully!');
    loginOk(res);
  } catch(err) { toast(err.message, 'err'); }
}

function loginOk(data) {
  S.token = data.token; S.user = data.user;
  localStorage.setItem('es_token', data.token);
  localStorage.setItem('es_user', JSON.stringify(data.user));
  toast(`Welcome, ${S.user.name}! 🌿`);
  go(`${S.user.role}-dash`);
}

function logout() {
  S.token = null; S.user = null;
  localStorage.removeItem('es_token'); localStorage.removeItem('es_user');
  toast('Logged out.', 'info');
  go('landing');
}

// ─── NOTIFICATIONS ───
async function loadNotifs() {
  if(!S.user) return;
  try {
    S.notifs = await api('GET', '/notifications');
    renderNotifs();
  } catch(e){}
}
function renderNotifs() {
  const unread = S.notifs.filter(n=>!n.read).length;
  const b = document.getElementById('nb-badge');
  if(unread) { b.textContent = unread; b.classList.remove('hidden'); } else b.classList.add('hidden');
  
  const list = document.getElementById('nd-list');
  list.innerHTML = S.notifs.length ? S.notifs.map(n => `<div class="nd-item ${n.read?'':'unread'}"><div class="nd-msg">${n.message}</div><div class="nd-time">${new Date(n.createdAt).toLocaleString()}</div></div>`).join('') : '<div class="nd-empty">No notifications</div>';
}
function openNotif() { document.getElementById('nd-overlay').classList.add('show'); document.getElementById('nd-drawer').classList.add('open'); loadNotifs(); }
function closeNotif() { document.getElementById('nd-overlay').classList.remove('show'); document.getElementById('nd-drawer').classList.remove('open'); }
async function markAllRead() {
  try { await api('PATCH', '/notifications/read'); loadNotifs(); } catch(e){}
}

// ─── CITIZEN DASHBOARD ───
async function loadCitizen() {
  document.getElementById('cg-title').textContent = `Hello, ${S.user.name.split(' ')[0]} 👋`;
  try {
    const data = await api('GET', '/complaints');
    S.complaints = data;
    document.getElementById('ck-t').textContent = data.length;
    document.getElementById('ck-p').textContent = data.filter(c=>c.status==='pending').length;
    document.getElementById('ck-a').textContent = data.filter(c=>c.status==='accepted').length;
    document.getElementById('ck-c').textContent = data.filter(c=>c.status==='completed').length;
    renderCards('c-grid', data, 'citizen');
  } catch(err) { toast(err.message, 'err'); }
}
function filterC(st, btn) {
  document.querySelectorAll('#cf-pills .fp').forEach(b => b.classList.remove('active')); btn.classList.add('active');
  renderCards('c-grid', st==='all' ? S.complaints : S.complaints.filter(c=>c.status===st), 'citizen');
}

// ─── WORKER DASHBOARD ───
let wTabState = 'pending';
async function loadWorkerDash() {
  try {
    const all = await api('GET', '/complaints');
    S.complaints = all;
    const pend = all.filter(c=>c.status==='pending');
    const my = all.filter(c=>c.workerId===S.user.id && c.status==='accepted');
    const dn = all.filter(c=>c.workerId===S.user.id && c.status==='completed');
    document.getElementById('wk-av').textContent = pend.length;
    document.getElementById('wk-my').textContent = my.length;
    document.getElementById('wk-dn').textContent = dn.length;
    document.getElementById('wt-count').textContent = pend.length;
    initMap('w-map', all);
    wTab(wTabState);
  } catch(e) { toast(e.message, 'err'); }
}
function wTab(t) {
  wTabState = t;
  document.querySelectorAll('.wt').forEach(b => b.classList.remove('active'));
  document.getElementById(t==='pending'?'wt-pend':t==='mine'?'wt-mine':'wt-hist').classList.add('active');
  const arr = t==='pending' ? S.complaints.filter(c=>c.status==='pending') :
              t==='mine' ? S.complaints.filter(c=>c.workerId===S.user.id && c.status==='accepted') :
              S.complaints.filter(c=>c.workerId===S.user.id && c.status==='completed');
  renderCards('w-grid', arr, 'worker-'+t);
}

// ─── ADMIN DASHBOARD ───
async function loadAdmin() {
  try {
    const stats = await api('GET', '/admin/stats');
    document.getElementById('ak-t').textContent = stats.complaints;
    document.getElementById('ak-p').textContent = stats.pending;
    document.getElementById('ak-a').textContent = stats.accepted;
    document.getElementById('ak-c').textContent = stats.completed;
    document.getElementById('ak-ci').textContent = stats.users - stats.workers;
    document.getElementById('ak-w').textContent = stats.workers;
    
    // Charts dummy init
    const ctxS = document.getElementById('stat-chart');
    if(S.charts.s) S.charts.s.destroy();
    S.charts.s = new Chart(ctxS, { type:'doughnut', data: { labels:['Pending','Accepted','Completed'], datasets:[{data:[stats.pending,stats.accepted,stats.completed], backgroundColor:['#f59e0b','#3b82f6','#10b981']}]}});
    
    const all = await api('GET', '/complaints');
    initMap('a-map', all);
    adminTab('complaints');
  } catch(e) {}
}
async function adminTab(t) {
  document.querySelectorAll('.at').forEach(b=>b.classList.remove('active'));
  document.getElementById(t==='complaints'?'at-c':'at-u').classList.add('active');
  const body = document.getElementById('admin-body');
  if(t==='complaints') {
    body.innerHTML = '<div class="cgrid" id="a-grid"></div>';
    renderCards('a-grid', await api('GET', '/complaints'), 'admin');
  } else {
    const users = await api('GET', '/admin/users');
    body.innerHTML = `<table class="dtbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>${users.map(u=>`<tr><td>${u.name}</td><td>${u.email}</td><td><span class="rb ${u.role==='admin'?'ra':u.role==='worker'?'rw':'rc'}">${u.role}</span></td></tr>`).join('')}</tbody></table>`;
  }
}

// ─── REPORTING ───
function initReport() {
  S.photos.before = null; S.loc = {lat:null, lng:null}; S.isGarbageValid = false;
  document.getElementById('pz-preview').classList.add('hidden');
  document.getElementById('pz-retake').classList.add('hidden');
  document.getElementById('pz-ph').classList.remove('hidden');
  document.getElementById('pzone').classList.remove('filled');
  const aiPred = document.getElementById('ai-prediction');
  if(aiPred) aiPred.classList.add('hidden');
  document.getElementById('rf').reset();
  if(S.maps.rbig) { S.maps.rbig.remove(); S.maps.rbig=null; }
  S.maps.rbig = L.map('r-map-big').setView([17.385, 78.487], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(S.maps.rbig);
}
function trigPhoto() { document.getElementById('photo-file').click(); }
function onPhoto(e) {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader(); r.onload = ev => {
    S.photos.before = ev.target.result;
    document.getElementById('pz-preview').src = S.photos.before;
    document.getElementById('pz-preview').classList.remove('hidden');
    document.getElementById('pz-ph').classList.add('hidden');
    document.getElementById('pzone').classList.add('filled');
    document.getElementById('pz-retake').classList.remove('hidden');
    predictWaste();
  }; r.readAsDataURL(f);
}
function clearPhoto() { initReport(); }

function safeBtoa(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

const SAMPS = [
  'data:image/svg+xml;base64,'+safeBtoa('<svg width="400" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fef2f2"/><text x="50%" y="50%" font-size="60" text-anchor="middle" dominant-baseline="middle">🗑️</text></svg>'),
  'data:image/svg+xml;base64,'+safeBtoa('<svg width="400" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fffbeb"/><text x="50%" y="50%" font-size="60" text-anchor="middle" dominant-baseline="middle">🏗️</text></svg>'),
  'data:image/svg+xml;base64,'+safeBtoa('<svg width="400" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#faf5ff"/><text x="50%" y="50%" font-size="60" text-anchor="middle" dominant-baseline="middle">📦</text></svg>'),
  'data:image/svg+xml;base64,'+safeBtoa('<svg width="400" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#eff6ff"/><text x="50%" y="50%" font-size="60" text-anchor="middle" dominant-baseline="middle">🪣</text></svg>'),
  'data:image/svg+xml;base64,'+safeBtoa('<svg width="400" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f0fdf4"/><text x="50%" y="50%" font-size="60" text-anchor="middle" dominant-baseline="middle">✨</text></svg>')
];
function pickSample(i) { S.photos.before = SAMPS[i]; document.getElementById('pz-preview').src = SAMPS[i]; document.getElementById('pz-preview').classList.remove('hidden'); document.getElementById('pz-ph').classList.add('hidden'); document.getElementById('pzone').classList.add('filled'); document.getElementById('pz-retake').classList.remove('hidden'); predictWaste(); }
function pickAfter(i) { S.photos.after = SAMPS[4]; document.getElementById('cm-preview').src = SAMPS[4]; document.getElementById('cm-preview').classList.remove('hidden'); document.getElementById('cm-ph').classList.add('hidden'); }

async function predictWaste() {
  const pBox = document.getElementById('ai-prediction');
  const submitBtn = document.getElementById('r-sub');
  S.isGarbageValid = false;
  if(!pBox) return;
  pBox.classList.remove('hidden');
  pBox.innerHTML = '<div class="mini-spin" style="border-top-color:var(--s8);"></div> <span style="color:var(--s7)">Analyzing waste type...</span>';
  pBox.style.backgroundColor = 'var(--s5)'; pBox.style.borderColor = 'var(--s2)';
  if (submitBtn) submitBtn.disabled = true;
  
  try {
    const res = await api('POST', '/analyze-image', { imageBase64: S.photos.before });
    if (!res.isGarbage) {
      S.isGarbageValid = false;
      pBox.innerHTML = '❌ <strong>Error:</strong> ' + (res.reason || 'Invalid image. Please upload a real garbage/waste photo only.');
      pBox.style.backgroundColor = '#fef2f2'; pBox.style.borderColor = '#ef4444';
      if (submitBtn) submitBtn.disabled = true;
    } else {
      S.isGarbageValid = true;
      const cat = res.category === 'Recyclable' ? 'Recyclable Waste' : 'Non-Recyclable / Mixed Waste';
      const icon = res.category === 'Recyclable' ? '♻️' : '🗑️';
      pBox.innerHTML = `${icon} <strong>AI Prediction:</strong> ${cat} (${res.confidenceScore || 100}% sure)<br/><small>${res.reason || ''}</small>`;
      pBox.style.backgroundColor = res.category === 'Recyclable' ? 'var(--g5)' : '#fffbeb'; 
      pBox.style.borderColor = res.category === 'Recyclable' ? 'var(--g4)' : '#fcd34d';
      
      document.getElementById('r-cat').value = res.category === 'Recyclable' ? 'household_waste' : 'solid_waste';
      if (submitBtn) submitBtn.disabled = false;
    }
  } catch (err) {
    S.isGarbageValid = false;
    pBox.innerHTML = '⚠️ <strong>Analysis Failed:</strong> ' + (err.message || 'Unknown error');
    pBox.style.backgroundColor = '#fef2f2'; pBox.style.borderColor = '#ef4444';
    if (submitBtn) submitBtn.disabled = true;
  }
}

function showLocSuccess() {
  document.getElementById('loc-spin').classList.add('hidden'); document.getElementById('loc-ok').classList.remove('hidden');
  document.getElementById('loc-coords').textContent = `${S.loc.lat.toFixed(4)}, ${S.loc.lng.toFixed(4)}`;
  S.maps.rbig.setView([S.loc.lat, S.loc.lng], 15);
  L.marker([S.loc.lat, S.loc.lng]).addTo(S.maps.rbig);
}

function getLocation() {
  document.getElementById('loc-spin').classList.remove('hidden'); document.getElementById('loc-btn').classList.add('hidden');
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        S.loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        showLocSuccess();
      },
      (err) => {
        toast('Location access failed. Using default.', 'warn');
        S.loc = {lat: 17.385 + Math.random()*0.05, lng: 78.487 + Math.random()*0.05};
        showLocSuccess();
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    toast('Geolocation not supported.', 'err');
  }
}

async function submitReport(e) {
  e.preventDefault();
  if (!S.isGarbageValid) {
    toast('Cannot submit. Please upload a valid garbage photo and wait for AI validation.', 'err');
    return;
  }
  try {
    await api('POST', '/complaints', {
      description: document.getElementById('r-desc').value,
      category: document.getElementById('r-cat').value,
      address: document.getElementById('r-addr').value,
      latitude: S.loc.lat, longitude: S.loc.lng,
      photoBefore: S.photos.before
    });
    toast('Report submitted!'); go('citizen-dash');
  } catch(err) { toast(err.message, 'err'); }
}

// ─── CARDS RENDERER ───
const CATS = { solid_waste:'🗑️', overflowing_bin:'🪣', construction_debris:'🏗️', household_waste:'📦', other:'📋' };
const STS = { pending:'⏳ Pending', accepted:'⚡ In Progress', completed:'✅ Completed' };
const SCL = { pending:'bp', accepted:'ba', completed:'bc' };

function renderCards(id, arr, mode) {
  const el = document.getElementById(id);
  if(!arr.length) { el.innerHTML = `<div class="empty-g"><div class="ei">📋</div><h3>No complaints found</h3><p>Nothing to show here right now.</p></div>`; return; }
  el.innerHTML = arr.map(c => {
    let acts = `<button class="btn-view" onclick="go('tracking', {id:'${c.id}'})">👁 View</button>`;
    if(mode === 'worker-pending') acts = `<button class="btn-accept" onclick="acceptTask('${c.id}')">✓ Accept</button>` + acts;
    if(mode === 'worker-mine') acts += `<button class="btn-complete" onclick="openComplete('${c.id}')">✅ Complete</button>`;
    
    return `
    <div class="cc ${c.status === 'pending' ? 'sp' : c.status === 'accepted' ? 'sa' : 'sc'}">
      ${c.photoBefore ? `<img src="${c.photoBefore}" class="cc-photo" alt="img" onclick="openPV('${c.photoBefore}')"/>` : ''}
      <div class="cc-top"><div class="cc-cat">${CATS[c.category]||'📋'} ${c.category.replace('_',' ')}</div><div class="cc-badge ${SCL[c.status]}">${STS[c.status]}</div></div>
      <div class="cc-desc">${c.description}</div>
      <div class="cc-meta"><div class="cm">📍 ${c.address||'Unknown'}</div><div class="cm">👤 ${c.citizenName}</div></div>
      <div class="cc-acts">${acts}</div>
    </div>`;
  }).join('');
}

async function acceptTask(id) {
  try { await api('PATCH', `/complaints/${id}/accept`); toast('Task accepted!'); loadWorkerDash(); } catch(e) { toast(e.message, 'err'); }
}

function openComplete(id) {
  S.photos.after = null; S.cId = id;
  document.getElementById('cm-preview').classList.add('hidden'); document.getElementById('cm-ph').classList.remove('hidden');
  document.getElementById('complete-modal').classList.remove('hidden');
}
function closeCM(e) { if(!e || e.target.id === 'complete-modal') document.getElementById('complete-modal').classList.add('hidden'); }
async function confirmComplete() {
  try {
    await api('PATCH', `/complaints/${S.cId}/complete`, { photoAfter: S.photos.after });
    toast('Task completed successfully! 🏆'); closeCM(); loadWorkerDash();
  } catch(e) { toast(e.message, 'err'); }
}

function openPV(src) { document.getElementById('pv-img').src=src; document.getElementById('photo-viewer').classList.remove('hidden'); }
function closePV(e) { if(!e || e.target.id==='photo-viewer') document.getElementById('photo-viewer').classList.add('hidden'); }

// ─── TRACKING ───
async function loadTracking(id) {
  const el = document.getElementById('track-body');
  try {
    const c = await api('GET', `/complaints/${id}`);
    const st = [{l:'Reported', i:'📝', d:true, a:c.status==='pending'}, {l:'Accepted', i:'🦺', d:c.status!=='pending', a:c.status==='accepted'}, {l:'Cleaned', i:'✨', d:c.status==='completed', a:c.status==='completed'}];
    el.innerHTML = `
      <div class="track-card">
        <div class="track-id">ID: ${c.id}</div>
        <div class="track-desc">${c.description}</div>
        <div class="timeline">
          ${st.map(s => `<div class="tl ${s.d?'done':''} ${s.a?'active':''}"><div class="tl-dot">${s.d?'✓':s.i}</div><div class="tl-body"><div class="tl-title">${s.l}</div></div></div>`).join('')}
        </div>
        ${c.photoBefore || c.photoAfter ? `<div class="ba-photos">${c.photoBefore?`<div class="ba-col"><h4>Before</h4><img src="${c.photoBefore}" onclick="openPV('${c.photoBefore}')"/></div>`:''}${c.photoAfter?`<div class="ba-col"><h4>After</h4><img src="${c.photoAfter}" onclick="openPV('${c.photoAfter}')"/></div>`:''}</div>` : ''}
      </div>`;
  } catch(e) { el.innerHTML = 'Error loading tracking.'; }
}

function initMap(id, arr) {
  if(S.maps[id]) { S.maps[id].remove(); }
  S.maps[id] = L.map(id).setView([17.385, 78.487], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(S.maps[id]);
  const cols = { pending: '#f59e0b', accepted: '#3b82f6', completed: '#10b981' };
  arr.forEach(c => {
    if(c.latitude) L.circleMarker([c.latitude, c.longitude], { color:'white', weight:2, fillColor:cols[c.status], fillOpacity:1, radius:10 }).addTo(S.maps[id]);
  });
}

function initApp() {
  setTimeout(() => {
    const spl = document.getElementById('splash');
    if(spl) {
      spl.classList.add('done');
      setTimeout(() => { spl.remove(); goHome(); }, 600);
    } else { goHome(); }
  }, 1500);
}

if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
