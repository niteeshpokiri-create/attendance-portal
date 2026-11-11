(function () {
  const user = Auth.require('admin');
  if (!user) return;

  const $ = function (id) { return document.getElementById(id); };
  let attRows = [];

  $('adminName').textContent = user.name + ' (' + user.id + ')';
  $('signOut').addEventListener('click', function (e) { e.preventDefault(); Auth.logout(); });

  // ---------- navigation ----------
  const loaders = { dash: loadDashboard, att: loadAttendance, leave: loadLeaves, emp: loadEmployees };

  function show(sec) {
    document.querySelectorAll('.nav button').forEach(function (b) { b.classList.toggle('active', b.dataset.sec === sec); });
    ['dash', 'att', 'leave', 'emp'].forEach(function (s) { $('sec-' + s).hidden = s !== sec; });
    loaders[sec]();
  }
  document.querySelectorAll('.nav button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.sec); });
  });
  $('goLeave').addEventListener('click', function (e) { e.preventDefault(); show('leave'); });
  $('btnRefresh').addEventListener('click', loadDashboard);

  // ---------- dashboard ----------
  async function loadDashboard() {
    try {
      const s = await api('adminStats');
      $('dashDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      $('sTotal').textContent = s.total;
      $('sIn').textContent = s.loggedIn;
      $('sInPct').textContent = s.total ? Math.round(s.loggedIn * 100 / s.total) + '% of employees' : ' ';
      $('sLeave').textContent = s.onLeave;
      $('sNot').textContent = s.notYet;
      $('sOut').textContent = s.loggedOut;
      $('sPending').textContent = s.pendingLeaves;
      setBadge(s.pendingLeaves);

      const max = Math.max(s.total, 1);
      const todayStr = s.date;
      $('chart').innerHTML = s.lastDays.map(function (d) {
        const h = Math.round(d.count / max * 150);
        return '<div class="bar' + (d.date === todayStr ? ' today' : '') + '" role="img" aria-label="' + esc(fmtDate(d.date)) + ': ' + d.count + '"><span>' + d.count + '</span><i style="height:' + h + 'px"></i></div>';
      }).join('');
      $('chartLabels').innerHTML = s.lastDays.map(function (d) {
        return '<span>' + (d.date === todayStr ? '<b>Today</b>' : esc(fmtDate(d.date).slice(0, -5))) + '</span>';
      }).join('');

      $('deptList').innerHTML = s.departments.length
        ? s.departments.map(function (d) {
            const pct = d.total ? Math.round(d.present * 100 / d.total) : 0;
            return '<div class="meter"><div class="top"><span>' + esc(d.department) + '</span><span class="muted">' + d.present + ' / ' + d.total + '</span></div><div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div>';
          }).join('')
        : '<p class="empty">Add employees to see departments.</p>';
    } catch (e) { toast(e.message, 'error'); }
  }

  function setBadge(n) {
    $('leaveBadge').textContent = n;
    $('leaveBadge').hidden = !n;
  }

  // ---------- attendance ----------
  $('attDate').value = localToday();
  $('attDate').addEventListener('change', loadAttendance);

  async function loadAttendance() {
    $('attBody').innerHTML = '<tr><td colspan="7" class="empty">Loading…</td></tr>';
    try {
      attRows = await api('attendanceByDate', { date: $('attDate').value || localToday() });
      $('attBody').innerHTML = attRows.length
        ? attRows.map(function (r) {
            return '<tr><td class="nowrap">' + esc(r.emp_id) + '</td><td><strong>' + esc(r.name) + '</strong></td><td>' + esc(r.department) + '</td><td>' + statusPill(r.status) + '</td><td class="nowrap">' + esc(fmtTime(r.login_time)) + '</td><td class="nowrap">' + esc(fmtTime(r.logout_time)) + '</td><td class="nowrap">' + (r.distance ? esc(r.distance) + ' m' : '—') + '</td></tr>';
          }).join('')
        : '<tr><td colspan="7" class="empty">No employees yet.</td></tr>';
    } catch (e) {
      $('attBody').innerHTML = '<tr><td colspan="7" class="empty">' + esc(e.message) + '</td></tr>';
    }
  }

  $('btnCsv').addEventListener('click', function () {
    if (!attRows.length) { toast('Nothing to export', 'error'); return; }
    const head = ['Emp ID', 'Name', 'Department', 'Status', 'Login', 'Logout', 'Distance (m)'];
    const lines = [head].concat(attRows.map(function (r) {
      return [r.emp_id, r.name, r.department, r.status, r.login_time, r.logout_time, r.distance];
    })).map(function (row) {
      return row.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'attendance-' + ($('attDate').value || localToday()) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  // ---------- leaves ----------
  $('leaveFilter').addEventListener('change', loadLeaves);

  async function loadLeaves() {
    $('leaveBody').innerHTML = '<tr><td colspan="7" class="empty">Loading…</td></tr>';
    try {
      const rows = await api('listLeaves', { status: $('leaveFilter').value });
      $('leaveBody').innerHTML = rows.length
        ? rows.map(function (l) {
            const dates = esc(fmtDate(l.from_date)) + (l.to_date !== l.from_date ? ' – ' + esc(fmtDate(l.to_date)) : '');
            const actions = l.status === 'Pending'
              ? '<div class="actions"><button type="button" class="btn small" data-decide="Approved" data-id="' + esc(l.leave_id) + '">Approve</button><button type="button" class="btn danger small" data-decide="Rejected" data-id="' + esc(l.leave_id) + '">Reject</button></div>'
              : '<span class="muted">' + (l.decided_by ? 'by ' + esc(l.decided_by) : '—') + '</span>';
            return '<tr><td><strong>' + esc(l.name) + '</strong><div class="muted" style="font-size:12px">' + esc(l.emp_id) + ' · ' + esc(l.department) + '</div></td><td>' + esc(l.type) + '</td><td class="nowrap">' + dates + '</td><td>' + l.days + '</td><td style="min-width:160px">' + esc(l.reason) + '</td><td>' + statusPill(l.status) + '</td><td>' + actions + '</td></tr>';
          }).join('')
        : '<tr><td colspan="7" class="empty">No ' + esc($('leaveFilter').value.toLowerCase()) + ' requests.</td></tr>';
      refreshBadge();
    } catch (e) {
      $('leaveBody').innerHTML = '<tr><td colspan="7" class="empty">' + esc(e.message) + '</td></tr>';
    }
  }

  async function refreshBadge() {
    try {
      const p = await api('listLeaves', { status: 'Pending' });
      setBadge(p.length);
    } catch (e) { /* ignore */ }
  }

  $('leaveBody').addEventListener('click', async function (ev) {
    const btn = ev.target;
    if (!btn.dataset || !btn.dataset.decide) return;
    btn.disabled = true;
    try {
      const r = await api('decideLeave', { leave_id: btn.dataset.id, decision: btn.dataset.decide });
      toast(r.message);
      loadLeaves();
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false;
    }
  });

  // ---------- employees ----------
  async function loadEmployees() {
    $('empBody').innerHTML = '<tr><td colspan="4" class="empty">Loading…</td></tr>';
    try {
      const rows = await api('listEmployees');
      $('empCount').textContent = 'Employees (' + rows.length + ')';
      $('empBody').innerHTML = rows.length
        ? rows.map(function (e) {
            return '<tr><td class="nowrap">' + esc(e.emp_id) + '</td><td><strong>' + esc(e.name) + '</strong></td><td>' + esc(e.department) + '</td><td><div class="actions"><button type="button" class="btn ghost small" data-reset="' + esc(e.emp_id) + '">Reset password</button><button type="button" class="btn danger small" data-del="' + esc(e.emp_id) + '">Remove</button></div></td></tr>';
          }).join('')
        : '<tr><td colspan="4" class="empty">No employees yet. Add the first one.</td></tr>';
    } catch (e) {
      $('empBody').innerHTML = '<tr><td colspan="4" class="empty">' + esc(e.message) + '</td></tr>';
    }
  }

  $('empForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    withBusy($('btnAddEmp'), async function () {
      try {
        const r = await api('addEmployee', {
          id: $('eId').value, name: $('eName').value, department: $('eDept').value, password: $('ePw').value
        });
        toast(r.message);
        $('empForm').reset();
        loadEmployees();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  $('empBody').addEventListener('click', async function (ev) {
    const btn = ev.target;
    if (!btn.dataset) return;
    try {
      if (btn.dataset.reset) {
        const pw = prompt('New password for ' + btn.dataset.reset + ' (min 6 characters):');
        if (!pw) return;
        const r = await api('resetPassword', { id: btn.dataset.reset, password: pw });
        toast(r.message);
      } else if (btn.dataset.del) {
        if (!confirm('Remove ' + btn.dataset.del + '? Their attendance history stays in the sheet.')) return;
        const r = await api('deleteEmployee', { id: btn.dataset.del });
        toast(r.message);
        loadEmployees();
      }
    } catch (e) { toast(e.message, 'error'); }
  });

  // ---------- start ----------
  show('dash');
})();
