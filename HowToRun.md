# How to Run Constractor

This guide walks you through everything you need to install, run, and manually test the Constractor app — from a completely fresh computer to a working multi-user demo. No prior developer experience is assumed.

---

## Table of Contents

1. [What You Need to Install First](#1-what-you-need-to-install-first)
2. [Download the Project](#2-download-the-project)
3. [Start the Database](#3-start-the-database)
4. [Configure and Set Up the API](#4-configure-and-set-up-the-api)
5. [Start All Services](#5-start-all-services)
6. [Dev Test Accounts](#6-dev-test-accounts)
7. [How to Use the Web Management Portal](#7-how-to-use-the-web-management-portal)
8. [How to Test the App — Mobile](#8-how-to-test-the-app--mobile)
9. [Full End-to-End Test Scenario](#9-full-end-to-end-test-scenario)
10. [Running the Automated Tests](#10-running-the-automated-tests)
11. [Stopping Everything](#11-stopping-everything)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What You Need to Install First

You need three tools. Install them in order.

### Node.js (version 20 or later)

Node.js is the JavaScript runtime that powers the API and build tools.

1. Go to **https://nodejs.org**
2. Click the **LTS** button (the left one — it says "Recommended for most users")
3. Run the installer and follow the prompts
4. When it finishes, open a terminal and confirm it worked:
   ```
   node --version
   ```
   You should see something like `v22.x.x`.

> **How to open a terminal:**
> - **Mac:** Press `Cmd + Space`, type `Terminal`, press Enter
> - **Windows:** Press `Win + R`, type `cmd`, press Enter (or search for "PowerShell")

### pnpm (the package manager)

pnpm is used to install all project dependencies.

After installing Node.js, run this in your terminal:
```bash
npm install -g pnpm
```

Confirm it worked:
```bash
pnpm --version
```
You should see `9.x.x` or higher.

### Docker Desktop

Docker runs the PostgreSQL database (and Redis) in an isolated container — no manual database installation needed.

1. Go to **https://www.docker.com/products/docker-desktop/**
2. Download the version for your operating system (Mac / Windows / Linux)
3. Run the installer
4. Open Docker Desktop from your Applications (Mac) or Start Menu (Windows)
5. Wait until the Docker icon in your menu bar / taskbar shows **"Docker Desktop is running"**

> Docker Desktop must be **open and running** every time you work with the project. If the database won't connect, the first thing to check is whether Docker is running.

---

## 2. Download the Project

If you have Git installed:
```bash
git clone <repo-url> constractor-system
cd constractor-system
```

If you don't have Git, download the ZIP from GitHub (click **Code → Download ZIP**), unzip it, and open your terminal in that folder.

Then install all dependencies:
```bash
pnpm install
```

This downloads packages for all three apps (API, web, mobile) at once. It takes about a minute the first time.

---

## 3. Start the Database

Make sure Docker Desktop is running (you should see the whale icon in your menu bar/taskbar), then run:

```bash
docker compose up -d
```

This starts two containers in the background:
- **PostgreSQL** on port 5432 (the main database)
- **Redis** on port 6379 (used as a queue/cache)

Check that they started successfully:
```bash
docker compose ps
```

You should see two rows, both with status `running (healthy)`. If they show `starting`, wait 10 seconds and run the command again.

---

## 4. Configure and Set Up the API

### 4a. Create the environment file

The API needs a configuration file. Copy the example:

```bash
cp .env.example apps/api/.env
```

The default values in `.env.example` work perfectly for local development — you don't need to change anything.

### 4b. Build the shared packages

Two internal packages need to be compiled before the apps can use them:

```bash
pnpm --filter @constractor/types build
pnpm --filter @constractor/config build
```

### 4c. Create the database tables

Run the database migrations (this creates all the tables):

```bash
pnpm --filter @constractor/api run db:migrate
```

You should see output like this — no errors means the database is ready:
```
Running database migrations…
  → 001_initial.sql
  → 002_messages.sql
  → 003_jobs.sql
  → 004_rename_roles_and_seed.sql
✅ Migrations complete.
```

### 4d. Seed the dev test accounts

Create the built-in admin and manager accounts for development and testing:

```bash
pnpm --filter @constractor/api run db:seed
```

Output confirms both accounts were created:
```
✓ admin: admin@constractor.dev
✓ manager: manager@constractor.dev

Dev users seeded. Credentials:
  admin    admin@constractor.dev  /  Admin1234!
  manager  manager@constractor.dev  /  Manager1234!
```

> The seed is safe to run multiple times — it uses `ON CONFLICT DO NOTHING` so it won't create duplicates.

---

## 5. Start All Services

You can start everything at once:

```bash
pnpm dev
```

Or start each service in a separate terminal for cleaner logs:

```bash
# Terminal 1
pnpm --filter @constractor/api dev        # API on :4000

# Terminal 2
pnpm --filter @constractor/web dev        # Web portal on :3000

# Terminal 3
pnpm --filter @constractor/mobile start   # Mobile Expo server
```

After about 10–20 seconds:

| Service | Address | Who uses it |
|---|---|---|
| API | http://localhost:4000 | Everything talks to this |
| Web Portal | http://localhost:3000 | Admins and Managers only |
| Mobile | Scan QR in terminal | Members (workers) on their phones |

**Verify the API is alive:**
```bash
curl http://localhost:4000/health
```
Expected: `{"status":"ok","version":"0.0.1","timestamp":"..."}`

---

## 6. Dev Test Accounts

These accounts are created by `db:seed` and are ready to use immediately.

### Web Portal Accounts (http://localhost:3000)

| Role    | Email                    | Password     | Access |
|---------|--------------------------|--------------|--------|
| Admin   | admin@constractor.dev    | Admin1234!   | Full access — can manage all users including other admins |
| Manager | manager@constractor.dev  | Manager1234! | Can manage members and other managers, cannot touch admin accounts |

> **Members cannot log in to the web portal.** If a member account tries to log in at `/login`, they see the message: *"This portal is for managers only. Please use the mobile app."*

### Mobile App Accounts

Members are created via the web portal's Users tab (or via `POST /auth/register`). Once created, they log in using Expo Go on their phone with whatever email/password you set.

For quick testing, you can also register directly from the mobile app's register screen.

### Role Summary

| Role    | Web Portal | Mobile App | Can do |
|---------|-----------|------------|--------|
| Admin   | ✅ Yes    | ✅ Yes     | Manage all users, all system access |
| Manager | ✅ Yes    | ✅ Yes     | Manage members and managers, post jobs |
| Member  | ❌ No     | ✅ Yes     | Apply to jobs, receive tasks, message managers |

---

## 7. How to Use the Web Management Portal

Open **http://localhost:3000** in your browser. You'll be redirected to the login page.

### Logging in

Use one of the dev accounts from Section 6. After login you land on the **Management Dashboard** at `/manage/users`.

### Users Tab — Managing Team Members

The Users tab shows a table of all users with columns: **Name**, **Email**, **Role**, **Joined**, **Actions**.

**Adding a new user:**
1. Click the **+ Add User** button (top right)
2. A form panel opens above the table
3. Fill in: Display Name, Email, Password (min 8 chars), Role
4. Click **✓ Create User**

The new user appears in the table immediately and can now log in to the mobile app with their credentials.

**Editing a user:**
1. Click **✏️ Edit** next to any user row
2. Update name, email, or role — leave password blank to keep it unchanged
3. Click **✓ Save Changes**

**Deleting a user:**
1. Click **🗑️ Delete** next to a user
2. A confirmation modal appears: *"Delete [Name]? This cannot be undone."*
3. Click **Yes, Delete** to confirm

**Security rules enforced in the UI and API:**
- You cannot delete your own account
- Managers cannot create, edit, or delete Admin accounts
- Managers cannot assign the Admin role to anyone
- The last Admin account cannot be deleted (prevents lockout)

### Tasks Tab

Coming soon — currently shows a placeholder page.

### Logging out

Click the **Logout** button in the top-right corner of the navigation bar.

---

## 8. How to Test the App — Mobile

### Prerequisites

1. Install **Expo Go** on your phone:
   - iPhone: App Store → search "Expo Go"
   - Android: Play Store → search "Expo Go"

2. Your phone and Mac must be on the **same Wi-Fi network**

3. Find your Mac's local IP address:
   ```bash
   ipconfig getifaddr en0
   ```
   It will look like `192.168.1.42`.

4. Create and configure the mobile environment file:
   ```bash
   cp apps/mobile/.env.example apps/mobile/.env
   ```
   Open `apps/mobile/.env` and set your IP:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.42:4000
   ```
   > Update this IP any time you change networks.

5. Start the mobile dev server:
   ```bash
   pnpm --filter @constractor/mobile start --clear
   ```

6. Scan the QR code:
   - **iPhone:** open the built-in Camera app and point it at the QR code → tap the Expo Go banner
   - **Android:** open Expo Go → tap **Scan QR code**

### Mobile Navigation

> **Note:** The mobile app currently uses `<Slot />` navigation instead of `<Stack />` due to a known incompatibility between Expo Go SDK 54 + Android's New Architecture and `react-native-screens`. This means no back button or header bar — navigation works but without native transition animations. This will be fixed in a future Development Build.

| Screen | How to get there |
|---|---|
| Home | App launch — tap Login or Register |
| Login | Tap Login from Home |
| Register | Tap Register from Home |
| Job Board | After login → navigates to `/(jobs)` |
| Job Detail | Tap any job card |
| Messages | Navigate to `/(messages)` |
| Chat | Tap a conversation |

### Creating a member account for mobile testing

Option 1 — **Via web portal** (recommended):
1. Log in to http://localhost:3000 as admin or manager
2. Go to Users tab → + Add User
3. Set role to **Member**, set a name/email/password
4. That user can now log in on Expo Go

Option 2 — **Via mobile register screen:**
1. Tap **Register** on the mobile home screen
2. Fill in name, email, password, select **Worker** role
3. You're logged in immediately

---

## 9. Full End-to-End Test Scenario

This scenario exercises the complete flow from user creation to messaging.

| Step | Who | Action | Expected result |
|---|---|---|---|
| 1 | — | `docker compose up -d` + start API + web | All services running |
| 2 | Admin | Log in at http://localhost:3000 with `admin@constractor.dev` / `Admin1234!` | Lands on `/manage/users` |
| 3 | Admin | Users tab → + Add User → create a Manager account | Manager appears in table |
| 4 | Admin | Users tab → + Add User → create a Member account (e.g. `worker@test.com` / `Worker1234!`) | Member appears in table |
| 5 | Member | Open Expo Go → Login with `worker@test.com` / `Worker1234!` | Lands on Job Board |
| 6 | Manager | Log in at http://localhost:3000 | Lands on `/manage/users` |
| 7 | Manager | Navigate to Job Board → Post a Job | New job created, status **open** |
| 8 | Member | Mobile → Job Board (pull to refresh) → tap job → Apply | Application submitted |
| 9 | Manager | Web → Job Board → job detail → Applications → Hire | Job → **assigned**, conversation auto-created |
| 10 | Both | Web Messages / Mobile Messages → open conversation | Auto-created conversation visible |
| 11 | Manager | Send a message | Appears in the conversation |
| 12 | Member | Mobile → Messages → conversation | Message appears within ~3 seconds |

---

## 10. Running the Automated Tests

The project has an integration test suite that runs against a real database. Make sure Docker is running and the database is up before running tests.

```bash
pnpm --filter @constractor/api test
```

A successful run looks like:
```
 Test Files  3 passed (3)
      Tests  61 passed (61)
   Duration  ~35s
```

**Type-check all packages** (catches TypeScript errors without running the app):
```bash
pnpm type-check
```

---

## 11. Stopping Everything

To stop the development servers:
```bash
# Press Ctrl+C in any terminal running pnpm dev / pnpm --filter ... dev
```

To stop the database containers:
```bash
docker compose down
```

> Your database data is preserved in a Docker volume. The next time you run `docker compose up -d`, all users, jobs, and messages will still be there.

To wipe the database completely and start fresh:
```bash
docker compose down -v
docker compose up -d
pnpm --filter @constractor/api run db:migrate
pnpm --filter @constractor/api run db:seed
```

---

## 12. Troubleshooting

### "Cannot connect to the Docker daemon"
Docker Desktop is not running. Open Docker Desktop from your Applications folder (Mac) or Start Menu (Windows) and wait until it says "Running".

### "Connection refused" on port 4000
The API is not running. Start it with:
```bash
pnpm --filter @constractor/api dev
```

### "relation does not exist" error in the API
You haven't run migrations yet:
```bash
pnpm --filter @constractor/api run db:migrate
```

### Dev accounts don't exist / login fails
Run the seed script:
```bash
pnpm --filter @constractor/api run db:seed
```

### "This portal is for managers only" on web login
You are trying to log in with a **member** account. The web portal only accepts admin and manager accounts. Use `admin@constractor.dev` or `manager@constractor.dev`, or create a manager account via the Admin account first.

### Web app shows a blank page or React error
Open the browser developer console (`F12` → Console tab). If it mentions a hydration error, try a hard refresh (`Ctrl + Shift + R` / `Cmd + Shift + R`).

### "Network request failed" on mobile (physical device)
Your phone is using `localhost` which doesn't point to your computer. Follow Section 8 and set `EXPO_PUBLIC_API_URL` to your Mac's local IP address (`ipconfig getifaddr en0`).

### Mobile app crashes with "java.lang.String cannot be cast to java.lang.Boolean"
This is a known incompatibility between Expo Go SDK 54's forced New Architecture on Android and `react-native-screens`. The app is currently using `<Slot />` navigation to work around this. If you still see the error:
1. Make sure Expo Go is updated to the latest version on your phone
2. Restart the Metro server with `--clear`: `pnpm --filter @constractor/mobile start --clear`
3. Scan the QR code again

### Metro shows "Unable to resolve" import errors
The mobile app uses Metro bundler which does **not** need `.js` file extensions in imports (unlike the API). If you add new files to the mobile app, import them without extensions:
```typescript
import { foo } from '@/lib/foo';       // ✅ correct
import { foo } from '@/lib/foo.js';    // ❌ wrong in mobile
```

### Port already in use (EADDRINUSE)
Another process is using port 4000, 3000, or 8081:
```bash
# Find what is using port 4000
lsof -i :4000
# Kill it (replace <PID> with the number shown)
kill -9 <PID>
```

### pnpm install fails
Make sure Node.js version is 20 or higher (`node --version`). If you have an older version:
```bash
nvm install 22
nvm use 22
pnpm install
```

### Something else is wrong
1. Check the terminal running the API for error messages
2. Check the browser console (`F12`) for client-side errors
3. Try stopping everything, wiping the database (Section 11), and starting fresh from Step 3
