(function () {
  const user = Auth.require('employee');
  if (!user) return;

  const $ = function (id) { return document.getElementById(id); };
  let loc = null;     // { distance, within, radius } from the server
  let today = null;   // { date, attendance, onLeave }

  // ---------- header / profile ----------
  $('hello').textContent = 'Hello, ' + user.name.split(' ')[0];
  $('todayDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('pEmpId').textContent = user.id;
  $('pName').textContent = user.name;
  $('pDept').textContent = user.department || '—';
  $('signOut').addEventListener('click', function (e) { e.preventDefault(); Auth.logout(); });

  // ---------- tabs ----------
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      $('tab-att').hidden = b.dataset.tab !== 'att';
      $('tab-leave').hidden = b.dataset.tab !== 'leave';
    });
  });

  // ---------- location ----------
  function getPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('This browser does not support location.')); return; }
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        function (e) {
          reject(new Error(e.code === 1
            ? 'Location permission is blocked. Allow location for this site and try again.'
            : 'Could not get your location. Move to an open area and try again.'));
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }

  function showLoc(state, text) {
    const pill = $('locPill');
    pill.className = 'pill ' + (state === 'in' ? 'ok' : state === 'out' || state === 'error' ? 'bad' : 'neutral');
    pill.textContent = state === 'in' ? 'Within range' : state === 'out' ? 'Outside range' : state === 'error' ? 'No location' : 'Checking…';
    $('locText').textContent = text;
  }

  async function refreshLocation() {
    showLoc('checking', 'Getting your location…');
    try {
      const pos = await getPosition();
      loc = await api('checkLocation', { lat: pos.lat, lng: pos.lng });
      if (loc.within) {
        showLoc('in', 'You are ' + loc.distance + ' m from the office (limit ' + loc.radius + ' m).');
      } else {
        const far = loc.distance >= 1000 ? (loc.distance / 1000).toFixed(1) + ' km' : loc.distance + ' m';
        showLoc('out', 'You are ' + far + ' from the office. Move within ' + loc.radius + ' m to mark attendance.');
      }
    } catch (e) {
      loc = null;
      showLoc('error', e.message);
    }
    updateButtons();
  }

  // ---------- today ----------
  function updateButtons() {
    const inRange = !!(loc && loc.within);
    const a = today && today.attendance;
    const onLeave = !!(today && today.onLeave);

    $('btnLogin').disabled = !(inRange && today && !a && !onLeave);
    $('btnLogout').disabled = !(inRange && a && !a.logout_time);

    $('tLogin').textContent = a ? fmtTime(a.login_time) : '—';
    $('tLogout').textContent = a && a.logout_time ? fmtTime(a.logout_time) : '—';

    let hint = '';
    if (today) {
      if (a && a.logout_time) hint = 'Attendance complete for today.';
      else if (onLeave && !a) hint = 'You are on approved leave today.';
      else if (!loc) hint = 'Turn on location to continue.';
      else if (!loc.within) hint = 'Move within ' + loc.radius + ' m of the office to log in or out.';
    }
    $('hintText').textContent = hint;
  }

  async function loadToday() {
    try { today = await api('myToday'); } catch (e) { toast(e.message, 'error'); }
    updateButtons();
  }

  async function loadHistory() {
    try {
      const rows = await api('myHistory');
      $('historyBody').innerHTML = rows.length
        ? rows.map(function (r) {
            return '<tr><td class="nowrap">' + esc(fmtDate(r.date)) + '</td><td class="nowrap">' + esc(fmtTime(r.login_time)) + '</td><td class="nowrap">' + esc(fmtTime(r.logout_time)) + '</td></tr>';
          }).join('')
        : '<tr><td colspan="3" class="empty">No attendance yet.</td></tr>';
    } catch (e) {
      $('historyBody').innerHTML = '<tr><td colspan="3" class="empty">' + esc(e.message) + '</td></tr>';
    }
  }

  async function mark(action, btn) {
    btn.disabled = true;
    try {
      const pos = await getPosition();
      const r = await api(action, { lat: pos.lat, lng: pos.lng });
      toast(r.message);
      await loadToday();
      await loadHistory();
    } catch (e) {
      toast(e.message, 'error');
    }
    await refreshLocation();
  }

  $('btnLogin').addEventListener('click', function () { mark('markLogin', $('btnLogin')); });
  $('btnLogout').addEventListener('click', function () { mark('markLogout', $('btnLogout')); });
  $('btnRecheck').addEventListener('click', refreshLocation);

  // ---------- leaves ----------
  const t = localToday();
  $('lFrom').min = t;
  $('lTo').min = t;
  $('lFrom').addEventListener('change', function () {
    $('lTo').min = $('lFrom').value || t;
    if ($('lTo').value && $('lTo').value < $('lFrom').value) $('lTo').value = $('lFrom').value;
  });

  async function loadLeaves() {
    try {
      const r = await api('myLeaves');
      $('bTotal').textContent = r.balance.total;
      $('bUsed').textContent = r.balance.used;
      $('bPending').textContent = r.balance.pending;
      $('bLeft').textContent = r.balance.remaining;

      $('leaveList').innerHTML = r.leaves.length
        ? r.leaves.map(function (l) {
            return '<div class="leave-item">' +
              '<div class="top"><strong>' + esc(l.type) + ' · ' + l.days + ' day' + (l.days > 1 ? 's' : '') + '</strong>' + statusPill(l.status) + '</div>' +
              '<div class="muted" style="font-size:14px">' + esc(fmtDate(l.from_date)) + (l.to_date !== l.from_date ? ' – ' + esc(fmtDate(l.to_date)) : '') + '</div>' +
              '<div style="font-size:14px;margin-top:4px">' + esc(l.reason) + '</div>' +
              (l.status === 'Pending' ? '<button type="button" class="btn danger small" data-cancel="' + esc(l.leave_id) + '" style="margin-top:8px">Cancel request</button>' : '') +
              '</div>';
          }).join('')
        : '<p class="empty">No leave requests yet.</p>';
    } catch (e) {
      $('leaveList').innerHTML = '<p class="empty">' + esc(e.message) + '</p>';
    }
  }

  $('leaveList').addEventListener('click', async function (ev) {
    const id = ev.target && ev.target.dataset && ev.target.dataset.cancel;
    if (!id) return;
    if (!confirm('Cancel this leave request?')) return;
    try {
      const r = await api('cancelLeave', { leave_id: id });
      toast(r.message);
      loadLeaves();
    } catch (e) { toast(e.message, 'error'); }
  });

  $('leaveForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    withBusy($('btnApply'), async function () {
      try {
        const r = await api('applyLeave', {
          type: $('lType').value, from: $('lFrom').value, to: $('lTo').value, reason: $('lReason').value
        });
        toast(r.message);
        $('leaveForm').reset();
        await loadLeaves();
        await loadToday();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  // ---------- start ----------
  loadToday().then(refreshLocation);
  loadHistory();
  loadLeaves();
})();
