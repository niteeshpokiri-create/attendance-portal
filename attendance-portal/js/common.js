// Shared helpers: session, API calls, formatting, toast.

const Auth = {
  save(token, user) {
    localStorage.setItem('ap_token', token);
    localStorage.setItem('ap_user', JSON.stringify(user));
  },
  token() { return localStorage.getItem('ap_token') || ''; },
  user() {
    try { return JSON.parse(localStorage.getItem('ap_user') || 'null'); } catch (e) { return null; }
  },
  clear() {
    localStorage.removeItem('ap_token');
    localStorage.removeItem('ap_user');
  },
  require(role) {
    const u = Auth.user();
    if (!u || !Auth.token() || u.role !== role) {
      Auth.clear();
      location.replace('index.html');
      return null;
    }
    return u;
  },
  logout() {
    Auth.clear();
    location.href = 'index.html';
  }
};

async function api(action, payload) {
  if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('http') !== 0) {
    throw new Error('Set API_URL in js/config.js first');
  }
  const body = JSON.stringify(Object.assign({ action: action, token: Auth.token() }, payload || {}));
  let res;
  try {
    // No custom headers on purpose: keeps this a "simple" request so Apps Script needs no CORS preflight.
    res = await fetch(CONFIG.API_URL, { method: 'POST', body: body });
  } catch (e) {
    throw new Error('Cannot reach the server. Check your internet and the API_URL.');
  }
  let json;
  try { json = await res.json(); } catch (e) { throw new Error('Unexpected reply from server'); }
  if (!json.ok) {
    if (/Not signed in|Session expired|Invalid session/.test(json.error) && action !== 'login') {
      Auth.clear();
      location.replace('index.html');
    }
    throw new Error(json.error);
  }
  return json.data;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(s) {
  if (!s) return '—';
  const p = String(s).split('-');
  return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0];
}

function fmtTime(t) {
  if (!t) return '—';
  const p = String(t).split(':').map(Number);
  return ((p[0] % 12) || 12) + ':' + String(p[1]).padStart(2, '0') + ' ' + (p[0] >= 12 ? 'PM' : 'AM');
}

function localToday() {
  return new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd
}

function statusPill(status) {
  const map = { Approved: 'ok', Present: 'ok', Pending: 'warn', Rejected: 'bad', Absent: 'bad', Cancelled: 'neutral', 'On leave': 'warn' };
  return '<span class="pill ' + (map[status] || 'neutral') + '">' + esc(status) + '</span>';
}

let toastTimer;
function toast(msg, type) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'show' + (type === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.className = type === 'error' ? 'error' : ''; }, 3500);
}

async function withBusy(btn, fn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Please wait…';
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = label; }
}
