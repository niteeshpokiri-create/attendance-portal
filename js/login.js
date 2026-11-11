(function () {
  // Already signed in? Go straight to the right portal.
  const existing = Auth.user();
  if (existing && Auth.token()) {
    location.replace(existing.role === 'admin' ? 'admin.html' : 'employee.html');
    return;
  }

  let role = 'employee';
  const $ = function (id) { return document.getElementById(id); };

  function setRole(r) {
    role = r;
    $('roleEmployee').classList.toggle('active', r === 'employee');
    $('roleAdmin').classList.toggle('active', r === 'admin');
    $('roleEmployee').setAttribute('aria-pressed', String(r === 'employee'));
    $('roleAdmin').setAttribute('aria-pressed', String(r === 'admin'));
    $('uidLabel').textContent = r === 'admin' ? 'Admin ID' : 'Employee ID';
    $('uid').placeholder = r === 'admin' ? 'e.g. ADMIN01' : 'e.g. EMP001';
    $('noteText').textContent = r === 'admin'
      ? 'Admins add employees, review attendance and approve leave.'
      : 'Attendance can be marked only from within 300 m of the office.';
  }

  $('roleEmployee').addEventListener('click', function () { setRole('employee'); });
  $('roleAdmin').addEventListener('click', function () { setRole('admin'); });

  $('loginForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    withBusy($('submitBtn'), async function () {
      try {
        const r = await api('login', { role: role, id: $('uid').value, password: $('pw').value });
        Auth.save(r.token, r.user);
        location.href = r.user.role === 'admin' ? 'admin.html' : 'employee.html';
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });
})();
