# Office Attendance Portal

Employee portal (login / logout inside 300 m, leave requests) + Admin portal (dashboard, attendance records, leave approvals, add employees). Data is stored in a Google Sheet through a Google Apps Script API.

## Folder structure

```
attendance-portal/
├── index.html          Login page (Employee / Admin toggle)
├── employee.html       Employee portal: attendance + leaves
├── admin.html          Admin portal: dashboard, records, leaves, employees
├── css/
│   └── style.css       All styling
├── js/
│   ├── config.js       <-- paste your Web app URL here
│   ├── common.js       API calls, session, formatting, toast
│   ├── login.js        Login page logic
│   ├── employee.js     Employee portal logic (GPS, login/logout, leaves)
│   └── admin.js        Admin portal logic
└── backend/
    └── Code.gs         Google Apps Script (paste into the Sheet's script editor)
```

## Google Sheet (created automatically by setup())

| Tab        | Columns |
|------------|---------|
| Employees  | emp_id, name, department, password_hash, salt, created_at |
| Admins     | admin_id, name, password_hash, salt |
| Attendance | date, emp_id, name, department, login_time, logout_time, login_distance_m, logout_distance_m |
| Leaves     | leave_id, emp_id, name, department, type, from_date, to_date, days, reason, status, applied_at, decided_by, decided_at |

## Step by step (about 20 minutes)

### Part A: Backend (Google Sheet + Apps Script)

1. Go to https://sheets.google.com and create a blank spreadsheet. Name it **Attendance DB**.
2. In the sheet: **Extensions > Apps Script**.
3. Delete the sample code, open `backend/Code.gs` in VS Code, copy everything and paste it into the Apps Script editor. Save (Ctrl+S).
4. Set your office location at the top of the script:
   - Open Google Maps, right-click your office, click the first line (the numbers). The first number is latitude, the second is longitude.
   - Put them in `OFFICE_LAT` and `OFFICE_LNG`. Keep `RADIUS_M = 300`.
5. In the function dropdown choose **setup** and click **Run**. Approve the permissions (Advanced > Go to project > Allow). The sheet now has 4 tabs and a default admin: **ADMIN01 / admin123**.
6. Click **Deploy > New deployment**. Gear icon > **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (ends with `/exec`).

### Part B: Frontend (VS Code)

7. Install VS Code from https://code.visualstudio.com if you do not have it.
8. Unzip the project. In VS Code: **File > Open Folder** and choose `attendance-portal`.
9. Open the Extensions panel (Ctrl+Shift+X), install **Live Server** (by Ritwick Dey).
10. Open `js/config.js` and replace `PASTE_YOUR_WEB_APP_URL_HERE` with the URL from step 6. Save.
11. Right-click `index.html` > **Open with Live Server**. The site opens at http://127.0.0.1:5500.

### Part C: Test it

12. Choose **Admin**, sign in with `ADMIN01` / `admin123`.
13. Go to **Employees** and add a test employee (for example EMP001, your name, any department, password `test1234`).
14. Sign out, choose **Employee**, sign in as EMP001. Allow location when asked.
15. You are probably not at the office right now. To test today, temporarily set `RADIUS_M = 100000` in Code.gs, then Deploy > Manage deployments > pencil icon > Version: **New version** > Deploy. Log in and log out. Set it back to 300 and redeploy before real use.
16. Open the **Leaves** tab, apply for leave starting tomorrow. Sign in as admin, open **Leave requests**, approve it. The dashboard and attendance records update.

### Part D: Put it online (so phones can use it)

Phones need **https** to share location, so deploy the folder:

- Easiest: go to https://app.netlify.com/drop and drag the whole `attendance-portal` folder onto the page. You get a public https link in seconds. Share that link with employees.
- Or use GitHub Pages / Vercel.

### Part E: Before real use

17. Change the admin password: in Code.gs edit `changeAdminPassword()` (set `newPassword`), choose it in the dropdown, and Run.
18. Set `RADIUS_M` back to 300 and redeploy (Manage deployments > New version).

## Important: every time you edit Code.gs

Save, then **Deploy > Manage deployments > pencil > Version: New version > Deploy**. The URL stays the same.

## How the rules are enforced

- Distance is checked on the server (Apps Script) from the phone's GPS reading, not just in the browser.
- One login row per employee per day; logout fills the same row.
- Approved leave blocks login for those dates and shows on the dashboard as "On leave today".
- Leave balance: 24 days per year (`ANNUAL_LEAVE_DAYS`), pending requests are counted so employees cannot over-apply.
- Passwords are stored as salted SHA-256 hashes. Sign-in tokens are signed and expire after 12 hours.

## Known limits (good to know)

- GPS can be faked by a determined user with a spoofing app. This is a normal office-attendance check, not a security system.
- Leave days are counted as calendar days (weekends and holidays included).
- Apps Script handles one request at a time per script, which is fine for an office of a few hundred.
