# AVM Leads

AVM staff log every WhatsApp lead from their phone, and the agency sees what the ad spend turned into: leads, sales, revenue, and where the funnel leaks.

- **Staff** (staff PIN): log a lead, paste a WhatsApp message to fill the form, update a lead's status.
- **Agency** (agency PIN): everything staff can do, plus the dashboard, weekly ad numbers, the Claude-written weekly summary and settings.

Stack: React + Vite + Tailwind, one Netlify Function (`/api/*`), Postgres on Neon, Claude Haiku 5.5 for the two AI features. Everything runs on free plans; the only cost is Claude API usage.

## Deploy (about 15 minutes)

### 1. Database: Neon

1. Sign up at [neon.tech](https://neon.tech) and create a project (pick the Singapore or Mumbai region if offered).
2. On the project dashboard, click **Connect**, turn on **Connection pooling**, and copy the connection string. It looks like `postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
3. Create the tables from your computer:

   ```bash
   npm install
   echo 'DATABASE_URL=<paste the connection string>' > .env
   npm run db:setup
   ```

   Or paste the contents of `db/schema.sql` into Neon's **SQL Editor** and run it.

### 2. Code: GitHub

Push this folder to a private GitHub repository.

### 3. Hosting: Netlify

1. Sign up at [netlify.com](https://netlify.com) and choose **Add new project → Import an existing project**, then pick the repository. The build settings come from `netlify.toml`.
2. Before the first deploy, open **Project configuration → Environment variables** and add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The Neon pooled connection string |
   | `STAFF_PIN` | Six digits for AVM staff |
   | `AGENCY_PIN` | Six different digits, for you only |
   | `SESSION_SECRET` | A random string of 32+ characters (run `openssl rand -hex 32`) |
   | `ANTHROPIC_API_KEY` | Your Claude API key (optional: without it, the AI buttons say "not set up yet" and everything else works) |

3. Deploy. Open the site, sign in with the agency PIN, and go to **Settings**.

### 4. First-time setup in the app

1. **Settings → Campaigns:** add each running ad with its pre-filled WhatsApp message (for example "Hi, I saw your ad for visiting cards"). Use the same message in the ad's WhatsApp button in Meta Ads Manager.
2. **Settings → Services:** replace the sample list with what AVM actually sells.
3. **Settings → Staff:** add the names of the people who answer WhatsApp.
4. Send AVM the site link and the staff PIN. On their phones: open the link, then **Add to Home Screen**.

### Every week

Open **Ad data**, pick last week, and copy four numbers per campaign from Meta Ads Manager: amount spent, impressions, link clicks, and WhatsApp conversations started. Then open the dashboard and press **Write summary** to get a note to send AVM.

## Run locally

Needs Node 20+ and a Postgres database (a free Neon branch works, or local Postgres).

```bash
npm install
cp .env.example .env    # fill in the values
npm run db:setup
npm run dev             # http://localhost:5173
```

`npm run dev` serves the API from the same code Netlify runs, so you don't need the Netlify CLI.

## How the numbers work

- **Dates** are Indian Standard Time. A lead counts in the period it was logged.
- **Ad numbers** are weekly (Monday to Sunday). A date range includes every week that starts inside it, plus the week the range starts in.
- **Sales and revenue** count leads logged in the period that are now Won, so a lead logged in October and won in November counts in October.
- **The funnel and the diagnosis** use ad leads only. "Include non-ad leads" changes the headline numbers and breakdowns.
- **Duplicates** (marked on a lead's page) are left out of every count.
- **The diagnosis** applies these checks in order and shows the first that fails: logging rate, junk leads, slow follow-up, pricing, rising cost per lead. Thresholds are in Settings.

## Project layout

```
db/schema.sql            Tables and default settings
netlify/functions/api.js Netlify entry point for /api/*
server/                  API: auth, leads, dashboard maths, ad data, Claude features
shared/constants.js      Statuses, lost reasons, default thresholds (used by both sides)
src/                     React app: pages/, components/, lib/
```

## Security notes

- PINs, the database URL and the Claude key live only in Netlify environment variables; the browser never sees them.
- A correct PIN sets a signed, HttpOnly cookie for 30 days. Five wrong PINs from one IP address lock sign-in for 15 minutes.
- Paste-to-log sends the pasted text to Claude, which can include a customer's name and number. The weekly summary sends totals only.
- To sign everyone out, change `SESSION_SECRET` and redeploy. To change a PIN, change its variable and redeploy.
