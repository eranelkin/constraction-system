# How to Run Constractor

This guide walks you through everything you need to install, run, and manually test the Constractor app — from a completely fresh computer to a working multi-user demo. No prior developer experience is assumed.

---

## Table of Contents

1. [What You Need to Install First](#1-what-you-need-to-install-first)
2. [Download the Project](#2-download-the-project)
3. [Start the Database](#3-start-the-database)
4. [Configure and Set Up the API](#4-configure-and-set-up-the-api)
5. [Start All Services](#5-start-all-services)
6. [How to Test the App — Web Browser](#6-how-to-test-the-app--web-browser)
7. [How to Test the App — Mobile](#7-how-to-test-the-app--mobile)
8. [Full End-to-End Test Scenario](#8-full-end-to-end-test-scenario)
9. [Running the Automated Tests](#9-running-the-automated-tests)
10. [Stopping Everything](#10-stopping-everything)
11. [Troubleshooting](#11-troubleshooting)

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

You should see output mentioning the migration files (`001_initial.sql`, `002_messages.sql`, `003_jobs.sql`). If there are no errors, the database is ready.

---

## 5. Start All Services

Start the API, web app, and mobile dev server all at once:

```bash
pnpm dev
```

After about 10–20 seconds, three services are running:

| Service | Address | What it does |
|---|---|---|
| API | http://localhost:4000 | The backend — handles all data |
| Web App | http://localhost:3000 | The browser interface |
| Mobile | http://localhost:8081 | The Expo dev server for the mobile app |

**Verify the API is alive:**
Open a new terminal tab and run:
```bash
curl http://localhost:4000/health
```
You should see: `{"status":"ok","version":"0.0.1","timestamp":"..."}`

> The `pnpm dev` command runs in the foreground and shows logs from all three services. Keep this terminal window open while you're using the app. To stop everything, press `Ctrl + C`.

---

## 6. How to Test the App — Web Browser

Open **http://localhost:3000** in your browser.

### Step 1 — Register a Client account

A **client** is someone who posts jobs (e.g., a homeowner who needs work done).

1. Click **Register**
2. Fill in:
   - **Display Name:** `Alice Client`
   - **Email:** `alice@example.com`
   - **Password:** `password123`
   - **Role:** select **Client**
3. Click **Register**
4. You are now logged in as Alice. You'll see the dashboard.

### Step 2 — Register a Contractor account (second browser or incognito window)

A **contractor** is someone who applies for jobs and does the work.

Open a **new incognito/private window** (so you can be logged in as two users at once):
- **Chrome/Edge:** `Ctrl + Shift + N` (Windows) / `Cmd + Shift + N` (Mac)
- **Firefox:** `Ctrl + Shift + P` / `Cmd + Shift + P`
- **Safari:** `Cmd + Shift + N`

Navigate to **http://localhost:3000** in the new window and click **Register**:
- **Display Name:** `Bob Contractor`
- **Email:** `bob@example.com`
- **Password:** `password123`
- **Role:** select **Contractor**

Click **Register**. Bob is now logged in.

### Step 3 — Alice posts a job

In Alice's browser window:
1. Click **Job Board** in the header
2. Click **Post a Job** (blue button, top right — only visible to clients)
3. Fill in the form:
   - **Title:** `Fix kitchen tap`
   - **Description:** `My kitchen tap has been dripping for a week. Need a plumber to fix it.`
   - **Budget:** `250`
   - **Location:** `Tel Aviv`
4. Click **Post Job**

You'll be taken to the job detail page. The status badge shows **open**.

### Step 4 — Bob applies for the job

In Bob's browser window:
1. Click **Job Board** in the header
2. You should see Alice's job "Fix kitchen tap" listed
3. Click on it
4. In the **Apply** section at the bottom, type a cover note:
   `I'm a licensed plumber with 8 years of experience. I can come tomorrow.`
5. Click **Apply**

The form is replaced by a **Pending** status badge — Bob's application is submitted.

### Step 5 — Alice hires Bob

Switch back to Alice's browser window:
1. Navigate to the job (it should still be open, or click **Job Board → Fix kitchen tap**)
2. Scroll down to **Applications** — you'll see Bob's application
3. Click **Hire** next to Bob's name

The job status changes to **assigned** and Bob's application shows **accepted**. At the same time, a conversation between Alice and Bob is automatically created.

### Step 6 — Alice and Bob message each other

In Alice's browser:
1. Click **Messages** in the header
2. You'll see a conversation with Bob already listed
3. Click on it, then type a message: `Hi Bob! Can you come on Thursday at 10am?`
4. Press **Send**

In Bob's browser:
1. Click **Messages** in the header  
2. The conversation with Alice appears — the message arrives automatically within 3 seconds
3. Bob replies: `Sure, Thursday at 10am works great!`

### Step 7 — Alice marks the job complete

After the work is done, Alice can close out the job:
1. Click **My Jobs** in the header (Alice)
2. Click on "Fix kitchen tap"
3. The job detail shows status **assigned** — there is currently no "Complete" button in the UI (this transition can be done via the API directly — see below)

To complete a job via the API, open a new terminal and run:
```bash
# Get Alice's token first by logging in via the API, or use the browser's
# developer tools → Application → Session Storage → access_token
curl -X PATCH http://localhost:4000/jobs/<job-id> \
  -H "Authorization: Bearer <alice-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```

### Step 8 — Check "My Jobs" / "My Applications"

- **Alice** clicks **My Jobs** → sees "Fix kitchen tap" with its current status badge
- **Bob** clicks **My Jobs** → sees his application for "Fix kitchen tap" with status **accepted** and job status shown alongside it

---

## 7. How to Test the App — Mobile

You have three options. **Option A (iOS Simulator)** is the easiest on a Mac.

### Option A — iOS Simulator (Mac only, requires Xcode)

1. Install **Xcode** from the Mac App Store (it's free, but large — ~15 GB)
2. After installation, open Xcode once to accept the license agreement
3. In your terminal (while `pnpm dev` is running), press **`i`** in the Expo output to open the iOS Simulator

The Constractor app will install and open in the simulator automatically.

### Option B — Android Emulator

1. Install **Android Studio** from https://developer.android.com/studio
2. Open Android Studio → **Device Manager** → create a virtual device (Pixel 7, API 34 recommended) → click the play button to start it
3. In your terminal (while `pnpm dev` is running), press **`a`** in the Expo output

### Option C — Your Physical Phone (easiest, no extra installs)

1. Install **Expo Go** on your phone:
   - iPhone: search "Expo Go" in the App Store
   - Android: search "Expo Go" in the Play Store

2. Your phone and computer must be on **the same Wi-Fi network**

3. Find your computer's local IP address:
   ```bash
   # Mac
   ipconfig getifaddr en0
   
   # Windows (PowerShell)
   (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias Wi-Fi).IPAddress
   ```
   It will look like `192.168.1.42`.

4. Update the mobile environment file:
   ```bash
   cp apps/mobile/.env.example apps/mobile/.env
   ```
   Open `apps/mobile/.env` in any text editor and change the last line to use your IP:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.42:4000
   ```

5. Stop and restart the dev server:
   ```bash
   # Press Ctrl+C to stop pnpm dev, then:
   pnpm dev
   ```

6. Scan the QR code that appears in the terminal:
   - **iPhone:** open the built-in Camera app and point it at the QR code
   - **Android:** open Expo Go and tap **Scan QR code**

### What you can do in the mobile app

| Screen | How to get there |
|---|---|
| Register / Login | App launch → tap Register or Login |
| Job Board | Navigate to `/(jobs)` — swipe down to refresh |
| Job Detail | Tap any job card |
| Apply to a job | Tap a job → type cover note → tap Apply (contractor) |
| Hire a contractor | Tap a job → tap Hire next to an applicant (client) |
| Conversations | Navigate to `/(messages)` |
| Chat | Tap a conversation |

---

## 8. Full End-to-End Test Scenario

This is the recommended test that exercises every major feature:

| Step | Who | Action | Expected result |
|---|---|---|---|
| 1 | — | `docker compose up -d` + `pnpm dev` | All services running |
| 2 | Client (Alice) | Register at `/register` with role **Client** | Redirected to dashboard |
| 3 | Contractor (Bob) | Register in incognito with role **Contractor** | Redirected to dashboard |
| 4 | Alice | Job Board → Post a Job | New job created, status **open** |
| 5 | Bob | Job Board → click the job → Apply | Application submitted, status **pending** |
| 6 | Alice | Job detail → Applications → click **Hire** | Job status → **assigned**; Bob's app → **accepted** |
| 7 | Both | Messages → open conversation | Conversation was auto-created by the hire action |
| 8 | Alice | Send a message | Appears immediately in Alice's view |
| 9 | Bob | Check Messages | Alice's message appears within ~3 seconds |
| 10 | Alice | My Jobs | Shows the job with status **assigned** |
| 11 | Bob | My Jobs | Shows application status **accepted** |
| 12 | Alice | `PATCH /jobs/:id` with `{"status":"completed"}` | Job status → **completed** |

---

## 9. Running the Automated Tests

The project has an integration test suite that runs against a real database. Make sure Docker is running and the database is up before running tests.

```bash
# Run all API tests
pnpm --filter @constractor/api test
```

A successful run looks like:
```
 Test Files  3 passed (3)
      Tests  61 passed (61)
   Duration  ~35s
```

To run a single test file:
```bash
cd apps/api
pnpm test src/test/jobs.test.ts
```

To run only tests matching a name pattern:
```bash
cd apps/api
pnpm test --reporter=verbose -t "hire"
```

**Type-check all packages** (catches TypeScript errors without running):
```bash
pnpm type-check
```

---

## 10. Stopping Everything

To stop the development servers (API + web + mobile):

```bash
# In the terminal running pnpm dev, press:
Ctrl + C
```

To stop the database containers:
```bash
docker compose down
```

> Your database data is preserved in a Docker volume. The next time you run `docker compose up -d`, all your registered users, jobs, and messages will still be there.

To wipe the database completely and start fresh:
```bash
docker compose down -v
docker compose up -d
pnpm --filter @constractor/api run db:migrate
```

---

## 11. Troubleshooting

### "Cannot connect to the Docker daemon"
Docker Desktop is not running. Open the Docker Desktop application from your Applications folder (Mac) or Start Menu (Windows) and wait until it says "Running".

### "Connection refused" on port 4000
The API is not running. Make sure `pnpm dev` is running in a terminal, or start just the API with `pnpm --filter @constractor/api dev`.

### "relation does not exist" error in the API
You haven't run migrations yet. Run:
```bash
pnpm --filter @constractor/api run db:migrate
```

### Web app shows a blank page or React error
Open the browser developer console (`F12` → Console tab) to see the error. If it mentions a hydration error, try a hard refresh (`Ctrl + Shift + R` / `Cmd + Shift + R`).

### "Network request failed" on mobile (physical device)
Your phone is using `localhost` which doesn't point to your computer. Follow [Option C](#option-c--your-physical-phone-easiest-no-extra-installs) and set `EXPO_PUBLIC_API_URL` to your computer's local IP address.

### Port already in use (EADDRINUSE)
Another process is using port 4000, 3000, or 8081. Find and stop it:
```bash
# Find what is using port 4000
lsof -i :4000

# Kill it (replace <PID> with the number shown)
kill -9 <PID>
```

### Tests fail with "deadlock detected"
Vitest is configured to prevent this (`fileParallelism: false`), but if you see it, make sure you haven't changed `vitest.config.ts`. Also ensure no other test process is running against the same database.

### pnpm install fails
Make sure Node.js version is 20 or higher (`node --version`). If you have an older version installed, use [nvm](https://github.com/nvm-sh/nvm):
```bash
nvm install 22
nvm use 22
```
Then retry `pnpm install`.

### Something else is wrong
1. Check the terminal running `pnpm dev` for error messages
2. Check the browser console (`F12`) for client-side errors
3. Try stopping everything (`Ctrl + C`, `docker compose down`), then starting fresh from Step 3
