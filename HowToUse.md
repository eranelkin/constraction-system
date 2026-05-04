# How To Use — Constractor Web Service

Walkthrough of the construction management features in the `/manage` section, with real examples and scenarios from the app.

---

## Dashboard — Command Centre

The dashboard is designed so a manager opening the browser sees problems **before** they click anything.

### The Alert Strip (top of page)
The first thing you see is a red bar:
> 🚨 **Attention required:** 🔴 2 Critical RFIs · 🟡 3 Delayed Tasks · 🔴 1 Safety Report

Each badge is a link. A site manager arriving Monday morning clicks "2 Critical RFIs" and lands directly on the RFI list — no hunting through menus.

### Quick Actions Bar
Four buttons: `+ Field Report`, `+ New RFI`, `+ Log Delay`, `View Schedule`. A foreman who just noticed a problem on-site doesn't navigate — they land on the dashboard and hit the button they need.

### Activity Feed (left column)
Shows the last 8 events across the whole site, newest first:
```
09:41 🔴 RFI #14 marked Critical — Structural specs Level 4
09:28 📋 Field report submitted by Yossi K. — Tower A, Level 3
08:55 🟡 Steel delivery delayed +3 days — Project Riverside
```
A manager who was in a meeting for 2 hours opens the dashboard and immediately knows what happened while they were gone.

### Critical RFIs Panel (right column)
Shows the 4 most urgent open RFIs with priority badge, who they're assigned to, and when they're due. If RFI #14 is due *Today* and assigned to Mike, the manager can see Mike needs to be chased — without opening the RFI tab.

---

## Field Reports — Logging Site Events

Designed for a worker who has 10 seconds between tasks.

### Scenario: Yossi spots a safety problem at 09:07
1. He opens `/manage/reports`
2. Clicks **Safety** (one click — turns red, pre-sets priority to Critical)
3. Selects `Tower A – Tel Aviv` from the project dropdown
4. Selects `Level 2` from the location dropdown (options change based on project)
5. Types: *"North scaffolding missing safety net on east side"*
6. Hits **✓ Submit Report** → appears at the top of the table instantly

The table now shows that report with:
- **Type**: 🔴 Safety (red badge)
- **Date**: May 4, 2026 / 09:07
- **Status**: Open

### Scenario: Manager Sara reviews it
Sara clicks the row → a detail panel slides in on the right showing the full description, project, location, who reported it and when. She clicks **👁 Acknowledge** (status flips to Acknowledged) or **✓ Mark Resolved** once it's fixed.

### Filter Bar
Sara only wants to see open safety issues → she clicks the **Safety** filter → the table immediately shows only Safety-type reports. The "3 open · 6 today" counter updates to match.

---

## Schedule & Delays

Answers the question: *"What's behind schedule and by how much?"*

### Scenario: The foundation pour is 5 days late

The table shows:

| Task | Project | Planned | Delay | Status |
|---|---|---|---|---|
| Foundation pour — Tower A | Tower A | Apr 28 | **+5d** (red) | 🔴 Critical |
| Steel frame delivery | Riverside | May 1 | +3d | 🟡 Delayed |
| Electrical rough-in Level 3 | Tower A | May 5 | — | 🟢 On Track |

Mike clicks the foundation row → a detail drawer opens on the right (table stays visible, nothing navigates away):

> **Delay Reason** (yellow box)
> *Heavy rain — concrete supplier delayed delivery by 5 days.*
>
> **Schedule Impact** (red box)
> *Pushes steel frame start by 1 week.*

Four action buttons appear:
- **👁 Acknowledge** — downgrades "Critical" to "Delayed", signals the team it's known
- **📄 Create RFI** — navigates to the RFI tab to formally escalate if the delay needs design input
- **📣 Notify Team** — flashes "✅ Team Notified!" confirmation

### Filter Buttons
Mike filters to **Critical** → only the foundation pour and the permit delay remain. He filters to **On Track** → sees everything running fine. The count in the subtitle (`3 critical · 3 delayed · 5 on track`) always reflects the full dataset.

### Log Delay
A new delay just came in — window delivery is now +4 days. Mike hits `+ Log Delay`, fills in Task name, Project, planned date, and number of days, optionally adds a reason. On submit it appears at the top of the table as "Delayed" (or "Critical" if ≥5 days).

---

## RFIs — Requests for Information

An RFI is a formal question from the site to the design team. *"The drawing says X but we see Y on site — which is correct?"*

### Scenario: Creating RFI #14

Lior is pouring concrete on Level 4 and the structural drawing conflicts with the spec. He hits `+ New RFI`:
- **Title**: *Structural specs for Level 4 beams*
- **Description**: *Engineer needs clarification on beam connection detail at grid C4-D4. Load table in drawing rev 3 conflicts with spec section 5.2.*
- **Priority**: CRITICAL (one click, turns red)
- **Assign to**: Mike D.
- **Due**: Today

Hits **✓ Submit RFI** → appears at the top of the list as #15, status "Open", red CRITICAL badge.

### Scenario: Mike resolves it

Mike clicks RFI #14 in the list → detail panel opens on the right:

> **Question**
> *Engineer needs clarification on beam connection detail at grid C4-D4…*

Mike clicks **👁 Mark In Review** (status → In Review, signals he's working on it). After consulting the engineer, he types in the Response field:

> *Use drawing rev 4 — updated beam schedule attached. Spec section 5.2 supersedes rev 3 table. Confirm with structural engineer before pour.*

Clicks **✓ Mark as Answered** → status flips to green "Answered", response is saved, timestamp "Resolved: Today, 14:22" is stamped.

### Scenario: Escalating priority

RFI #12 was logged as HIGH but the site is blocked until it's answered. Sara clicks it and hits **⬆ Escalate Priority** → priority jumps from HIGH → CRITICAL. The red badge appears, it shows up in the dashboard's Critical RFIs panel, and the assignee knows it's urgent.

### Filter Bar
At end of week Sara filters to **Open** to see what's still unresolved. She filters to **Answered** to confirm all this week's RFIs were closed. Each filter shows the count so she can report "7 RFIs this week, 2 still open" without counting rows.

---

## How the Pages Connect

The flows link to each other intentionally:

- **Dashboard alert strip** → each badge links directly to the relevant tab
- **Schedule delay drawer** → "Create RFI" button navigates to `/manage/rfis` so a delay can be formally escalated
- **Dashboard quick actions** → `+ Field Report` goes to Reports, `+ New RFI` goes to RFIs, `+ Log Delay` goes to Schedule
- **All four pages** share the same mock team (Yossi, Sara, Mike, Ahmed, Lior, John) and the same five projects so data feels consistent across tabs

---

## Navigation Overview

| Tab | Path | Purpose |
|---|---|---|
| 📊 Dashboard | `/manage/dashboard` | Command centre — alerts, activity feed, critical RFIs |
| 📋 Reports | `/manage/reports` | Submit and manage field reports |
| 📅 Schedule | `/manage/schedule` | Track task delays and critical path issues |
| 📄 RFIs | `/manage/rfis` | Create, assign, and resolve requests for information |
| 👥 Users | `/manage/users` | Add, edit, and deactivate team members |
| 🏘️ Groups | `/manage/groups` | Organise users into site crews |
| ✅ Tasks | `/manage/tasks` | Coming soon |
