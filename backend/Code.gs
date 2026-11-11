/**
 * OFFICE ATTENDANCE PORTAL - BACKEND (Google Apps Script, bound to a Google Sheet)
 *
 * Setup: paste this file into Extensions > Apps Script, set OFFICE_LAT / OFFICE_LNG,
 * run setup() once, then Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 */

// ===================== SETTINGS (edit these) =====================
const OFFICE_LAT = 12.9716;      // <-- your office latitude  (Google Maps: right-click the office > first number)
const OFFICE_LNG = 77.5946;      // <-- your office longitude (second number)
const RADIUS_M = 300;            // allowed distance from office in metres
const ANNUAL_LEAVE_DAYS = 24;    // leave days per employee per year
const TOKEN_HOURS = 12;          // how long a sign-in lasts
const TZ = 'Asia/Kolkata';
const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Other'];
// =================================================================

const SHEETS = {
  Employees: ['emp_id', 'name', 'department', 'password_hash', 'salt', 'created_at'],
  Admins: ['admin_id', 'name', 'password_hash', 'salt'],
  Attendance: ['date', 'emp_id', 'name', 'department', 'login_time', 'logout_time', 'login_distance_m', 'logout_distance_m'],
  Leaves: ['leave_id', 'emp_id', 'name', 'department', 'type', 'from_date', 'to_date', 'days', 'reason', 'status', 'applied_at', 'decided_by', 'decided_at']
};

const ROUTES = {
  login: login_,
  checkLocation: checkLocation_,
  markLogin: markLogin_,
  markLogout: markLogout_,
  myToday: myToday_,
  myHistory: myHistory_,
  applyLeave: applyLeave_,
  myLeaves: myLeaves_,
  cancelLeave: cancelLeave_,
  adminStats: adminStats_,
  attendanceByDate: attendanceByDate_,
  listEmployees: listEmployees_,
  addEmployee: addEmployee_,
  deleteEmployee: deleteEmployee_,
  resetPassword: resetPassword_,
  listLeaves: listLeaves_,
  decideLeave: decideLeave_
};

// ===================== ENTRY POINTS =====================
function doGet() {
  return json_({ ok: true, data: 'Attendance API is running' });
}

function doPost(e) {
  let out;
  const lock = LockService.getScriptLock();
  try {
    const req = JSON.parse(e.postData.contents);
    const handler = ROUTES[req.action];
    if (!handler) throw new Error('Unknown action');
    lock.waitLock(20000);
    out = { ok: true, data: handler(req) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ===================== ONE-TIME SETUP =====================
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    const headers = SHEETS[name];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const head = sh.getRange(1, 1, 1, headers.length);
    head.setNumberFormat('@');
    head.setValues([headers]).setFontWeight('bold').setBackground('#E6F4F2');
    sh.getRange(2, 1, sh.getMaxRows() - 1, headers.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) {
    props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  }

  // default admin: ADMIN01 / admin123  (change it with changeAdminPassword)
  if (rows_('Admins').length === 0) {
    const salt = Utilities.getUuid();
    append_('Admins', ['ADMIN01', 'Administrator', hash_('admin123', salt), salt]);
  }
  Logger.log('Setup done. Sign in with ADMIN01 / admin123, then change the password.');
}

/** Edit the two values below, then run this function once. */
function changeAdminPassword() {
  const adminId = 'ADMIN01';
  const newPassword = 'CHANGE-ME-123';
  if (newPassword === 'CHANGE-ME-123') throw new Error('Edit newPassword first');
  const a = rows_('Admins').filter(function (r) { return r.admin_id.toUpperCase() === adminId; })[0];
  if (!a) throw new Error('Admin not found');
  const salt = Utilities.getUuid();
  setCell_('Admins', a._row, 'password_hash', hash_(newPassword, salt));
  setCell_('Admins', a._row, 'salt', salt);
  Logger.log('Password changed for ' + adminId);
}

// ===================== HELPERS =====================
function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" missing. Run setup() first.');
  return sh;
}

function rows_(name) {
  const values = sheet_(name).getDataRange().getValues();
  const head = values.shift();
  const out = [];
  values.forEach(function (r, i) {
    if (String(r[0]) === '') return;
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j] === '' || r[j] === null ? '' : String(r[j]); });
    out.push(o);
  });
  return out;
}

function append_(name, row) {
  const sh = sheet_(name);
  const r = sh.getLastRow() + 1;
  const range = sh.getRange(r, 1, 1, row.length);
  range.setNumberFormat('@');
  range.setValues([row]);
}

function setCell_(name, row, header, value) {
  const col = SHEETS[name].indexOf(header) + 1;
  const range = sheet_(name).getRange(row, col);
  range.setNumberFormat('@');
  range.setValue(value);
}

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'HH:mm:ss'); }
function stamp_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

function hash_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function secret_() { return PropertiesService.getScriptProperties().getProperty('SECRET'); }

function sign_(payload) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret_()));
  return body + '.' + sig;
}

function auth_(req, role) {
  const token = String(req.token || '');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Not signed in');
  const expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], secret_()));
  if (expected !== parts[1]) throw new Error('Invalid session');
  const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (p.exp < Date.now()) throw new Error('Session expired');
  if (role && p.role !== role) throw new Error('Not allowed');
  return p;
}

function haversine_(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distance_(req) {
  const lat = Number(req.lat), lng = Number(req.lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error('Your location is not available. Turn on location and try again.');
  }
  return Math.round(haversine_(lat, lng, OFFICE_LAT, OFFICE_LNG));
}

function parseDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) throw new Error('Invalid date');
  const p = s.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  if (d.toISOString().slice(0, 10) !== s) throw new Error('Invalid date');
  return d;
}

function daysBetween_(from, to) {
  return Math.round((parseDate_(to) - parseDate_(from)) / 86400000) + 1;
}

function hhmm_(t) { return String(t).slice(0, 5); }

function onLeave_(empId, date) {
  return rows_('Leaves').some(function (l) {
    return l.emp_id === empId && l.status === 'Approved' && l.from_date <= date && date <= l.to_date;
  });
}

function balance_(empId) {
  const year = today_().slice(0, 4);
  let used = 0, pending = 0;
  rows_('Leaves').forEach(function (l) {
    if (l.emp_id !== empId || l.from_date.slice(0, 4) !== year) return;
    if (l.status === 'Approved') used += Number(l.days);
    if (l.status === 'Pending') pending += Number(l.days);
  });
  return { total: ANNUAL_LEAVE_DAYS, used: used, pending: pending, remaining: ANNUAL_LEAVE_DAYS - used - pending };
}

// ===================== AUTH =====================
function login_(req) {
  const role = req.role === 'admin' ? 'admin' : 'employee';
  const id = String(req.id || '').trim().toUpperCase();
  const password = String(req.password || '');
  if (!id || !password) throw new Error('Enter your ID and password');

  let user = null;
  if (role === 'admin') {
    const a = rows_('Admins').filter(function (r) { return r.admin_id.toUpperCase() === id; })[0];
    if (a && hash_(password, a.salt) === a.password_hash) {
      user = { id: a.admin_id, name: a.name, department: '', role: role };
    }
  } else {
    const e = rows_('Employees').filter(function (r) { return r.emp_id.toUpperCase() === id; })[0];
    if (e && hash_(password, e.salt) === e.password_hash) {
      user = { id: e.emp_id, name: e.name, department: e.department, role: role };
    }
  }
  if (!user) throw new Error('Wrong ID or password');

  const token = sign_({ id: user.id, name: user.name, dept: user.department, role: role, exp: Date.now() + TOKEN_HOURS * 3600 * 1000 });
  return { token: token, user: user };
}

// ===================== EMPLOYEE: ATTENDANCE =====================
function checkLocation_(req) {
  auth_(req, 'employee');
  const d = distance_(req);
  return { distance: d, within: d <= RADIUS_M, radius: RADIUS_M };
}

function markLogin_(req) {
  const u = auth_(req, 'employee');
  const d = distance_(req);
  if (d > RADIUS_M) throw new Error('You are ' + d + ' m from the office. Move within ' + RADIUS_M + ' m to log in.');
  const date = today_();
  if (onLeave_(u.id, date)) throw new Error('You are on approved leave today.');
  const existing = rows_('Attendance').filter(function (a) { return a.date === date && a.emp_id === u.id; })[0];
  if (existing) throw new Error('You have already logged in today.');
  const t = now_();
  append_('Attendance', [date, u.id, u.name, u.dept, t, '', String(d), '']);
  return { message: 'Logged in at ' + hhmm_(t) };
}

function markLogout_(req) {
  const u = auth_(req, 'employee');
  const d = distance_(req);
  if (d > RADIUS_M) throw new Error('You are ' + d + ' m from the office. Move within ' + RADIUS_M + ' m to log out.');
  const date = today_();
  const a = rows_('Attendance').filter(function (r) { return r.date === date && r.emp_id === u.id; })[0];
  if (!a) throw new Error('You have not logged in today.');
  if (a.logout_time) throw new Error('You have already logged out today.');
  const t = now_();
  setCell_('Attendance', a._row, 'logout_time', t);
  setCell_('Attendance', a._row, 'logout_distance_m', String(d));
  return { message: 'Logged out at ' + hhmm_(t) };
}

function myToday_(req) {
  const u = auth_(req, 'employee');
  const date = today_();
  const a = rows_('Attendance').filter(function (r) { return r.date === date && r.emp_id === u.id; })[0];
  return {
    date: date,
    attendance: a ? { login_time: a.login_time, logout_time: a.logout_time } : null,
    onLeave: onLeave_(u.id, date)
  };
}

function myHistory_(req) {
  const u = auth_(req, 'employee');
  return rows_('Attendance')
    .filter(function (r) { return r.emp_id === u.id; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
    .slice(0, 30)
    .map(function (r) { return { date: r.date, login_time: r.login_time, logout_time: r.logout_time }; });
}

// ===================== EMPLOYEE: LEAVES =====================
function applyLeave_(req) {
  const u = auth_(req, 'employee');
  const type = String(req.type || '');
  const from = String(req.from || '');
  const to = String(req.to || '');
  const reason = String(req.reason || '').trim();

  if (LEAVE_TYPES.indexOf(type) < 0) throw new Error('Choose a leave type');
  const days = daysBetween_(from, to);
  if (days < 1) throw new Error('The "To" date must be on or after the "From" date');
  if (from < today_()) throw new Error('Leave cannot start in the past');
  if (!reason) throw new Error('Enter a reason');
  if (reason.length > 300) throw new Error('Reason is too long (max 300 characters)');

  const clash = rows_('Leaves').some(function (l) {
    return l.emp_id === u.id && (l.status === 'Pending' || l.status === 'Approved') && from <= l.to_date && to >= l.from_date;
  });
  if (clash) throw new Error('You already have a leave request on these dates');

  const bal = balance_(u.id);
  if (days > bal.remaining) throw new Error('You have only ' + bal.remaining + ' leave day(s) left this year');

  const id = 'L' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
  append_('Leaves', [id, u.id, u.name, u.dept, type, from, to, String(days), reason, 'Pending', stamp_(), '', '']);
  return { message: 'Leave request sent for approval (' + days + ' day' + (days > 1 ? 's' : '') + ')' };
}

function myLeaves_(req) {
  const u = auth_(req, 'employee');
  const list = rows_('Leaves')
    .filter(function (l) { return l.emp_id === u.id; })
    .sort(function (a, b) { return a.applied_at < b.applied_at ? 1 : -1; })
    .map(leaveOut_);
  return { balance: balance_(u.id), leaves: list };
}

function cancelLeave_(req) {
  const u = auth_(req, 'employee');
  const l = rows_('Leaves').filter(function (r) { return r.leave_id === String(req.leave_id) && r.emp_id === u.id; })[0];
  if (!l) throw new Error('Leave request not found');
  if (l.status !== 'Pending') throw new Error('Only pending requests can be cancelled');
  setCell_('Leaves', l._row, 'status', 'Cancelled');
  return { message: 'Leave request cancelled' };
}

function leaveOut_(l) {
  return {
    leave_id: l.leave_id, emp_id: l.emp_id, name: l.name, department: l.department, type: l.type,
    from_date: l.from_date, to_date: l.to_date, days: Number(l.days), reason: l.reason,
    status: l.status, applied_at: l.applied_at, decided_by: l.decided_by
  };
}

// ===================== ADMIN =====================
function workingDays_(n) {
  const out = [];
  let d = new Date(), guard = 0;
  while (out.length < n && guard < 30) {
    const dow = Number(Utilities.formatDate(d, TZ, 'u'));
    if (dow < 6) out.unshift(Utilities.formatDate(d, TZ, 'yyyy-MM-dd'));
    d = new Date(d.getTime() - 86400000);
    guard++;
  }
  return out;
}

function adminStats_(req) {
  auth_(req, 'admin');
  const today = today_();
  const emps = rows_('Employees');
  const att = rows_('Attendance');
  const leaves = rows_('Leaves');

  const todays = att.filter(function (a) { return a.date === today; });
  const leaveIds = leaves.filter(function (l) {
    return l.status === 'Approved' && l.from_date <= today && today <= l.to_date;
  }).map(function (l) { return l.emp_id; });
  const present = function (id) { return todays.some(function (a) { return a.emp_id === id; }); };

  const onLeave = emps.filter(function (e) { return leaveIds.indexOf(e.emp_id) >= 0 && !present(e.emp_id); }).length;
  const loggedIn = todays.length;
  const loggedOut = todays.filter(function (a) { return a.logout_time; }).length;

  const depts = {};
  emps.forEach(function (e) {
    const k = e.department || 'Other';
    depts[k] = depts[k] || { department: k, total: 0, present: 0 };
    depts[k].total++;
    if (present(e.emp_id)) depts[k].present++;
  });

  return {
    date: today,
    total: emps.length,
    loggedIn: loggedIn,
    loggedOut: loggedOut,
    onLeave: onLeave,
    notYet: Math.max(emps.length - loggedIn - onLeave, 0),
    pendingLeaves: leaves.filter(function (l) { return l.status === 'Pending'; }).length,
    departments: Object.keys(depts).sort().map(function (k) { return depts[k]; }),
    lastDays: workingDays_(5).map(function (d) {
      return { date: d, count: att.filter(function (a) { return a.date === d; }).length };
    })
  };
}

function attendanceByDate_(req) {
  auth_(req, 'admin');
  const date = String(req.date || today_());
  parseDate_(date);
  const att = rows_('Attendance').filter(function (a) { return a.date === date; });
  const leaves = rows_('Leaves').filter(function (l) { return l.status === 'Approved' && l.from_date <= date && date <= l.to_date; });
  const future = date > today_();
  return rows_('Employees').map(function (e) {
    const a = att.filter(function (r) { return r.emp_id === e.emp_id; })[0];
    const lv = leaves.some(function (l) { return l.emp_id === e.emp_id; });
    let status = future ? '-' : 'Absent';
    if (a) status = 'Present';
    else if (lv) status = 'On leave';
    return {
      emp_id: e.emp_id, name: e.name, department: e.department, status: status,
      login_time: a ? a.login_time : '', logout_time: a ? a.logout_time : '',
      distance: a ? a.login_distance_m : ''
    };
  });
}

function listEmployees_(req) {
  auth_(req, 'admin');
  return rows_('Employees').map(function (e) {
    return { emp_id: e.emp_id, name: e.name, department: e.department, created_at: e.created_at };
  });
}

function addEmployee_(req) {
  auth_(req, 'admin');
  const id = String(req.id || '').trim().toUpperCase();
  const name = String(req.name || '').trim();
  const dept = String(req.department || '').trim();
  const pw = String(req.password || '');
  if (!/^[A-Z0-9_-]{2,20}$/.test(id)) throw new Error('Employee ID: 2-20 letters, numbers, - or _');
  if (!name) throw new Error('Enter the employee name');
  if (!dept) throw new Error('Choose a department');
  if (pw.length < 6) throw new Error('Password must be at least 6 characters');
  const dup = rows_('Employees').some(function (e) { return e.emp_id.toUpperCase() === id; });
  if (dup) throw new Error('Employee ID ' + id + ' already exists');
  const salt = Utilities.getUuid();
  append_('Employees', [id, name, dept, hash_(pw, salt), salt, stamp_()]);
  return { message: 'Employee ' + id + ' added' };
}

function deleteEmployee_(req) {
  auth_(req, 'admin');
  const id = String(req.id || '').toUpperCase();
  const e = rows_('Employees').filter(function (r) { return r.emp_id.toUpperCase() === id; })[0];
  if (!e) throw new Error('Employee not found');
  sheet_('Employees').deleteRow(e._row);
  return { message: 'Employee ' + id + ' removed (attendance history is kept)' };
}

function resetPassword_(req) {
  auth_(req, 'admin');
  const id = String(req.id || '').toUpperCase();
  const pw = String(req.password || '');
  if (pw.length < 6) throw new Error('Password must be at least 6 characters');
  const e = rows_('Employees').filter(function (r) { return r.emp_id.toUpperCase() === id; })[0];
  if (!e) throw new Error('Employee not found');
  const salt = Utilities.getUuid();
  setCell_('Employees', e._row, 'password_hash', hash_(pw, salt));
  setCell_('Employees', e._row, 'salt', salt);
  return { message: 'Password updated for ' + id };
}

function listLeaves_(req) {
  auth_(req, 'admin');
  const status = String(req.status || 'All');
  return rows_('Leaves')
    .filter(function (l) { return status === 'All' || l.status === status; })
    .sort(function (a, b) { return a.applied_at < b.applied_at ? 1 : -1; })
    .map(leaveOut_);
}

function decideLeave_(req) {
  const admin = auth_(req, 'admin');
  const decision = String(req.decision || '');
  if (decision !== 'Approved' && decision !== 'Rejected') throw new Error('Invalid decision');
  const l = rows_('Leaves').filter(function (r) { return r.leave_id === String(req.leave_id); })[0];
  if (!l) throw new Error('Leave request not found');
  if (l.status !== 'Pending') throw new Error('This request is already ' + l.status.toLowerCase());
  setCell_('Leaves', l._row, 'status', decision);
  setCell_('Leaves', l._row, 'decided_by', admin.id);
  setCell_('Leaves', l._row, 'decided_at', stamp_());
  return { message: 'Leave ' + decision.toLowerCase() + ' for ' + l.name };
}
