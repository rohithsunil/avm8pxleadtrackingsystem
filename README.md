# AVM Leads

AVM staff log every WhatsApp lead from their phone, and the agency sees what the ad spend turned into: leads, sales, revenue, and where the funnel leaks.

- **Staff** (staff PIN): log a lead, paste a WhatsApp message to fill the form, update a lead's status.
- **Agency** (agency PIN): everything staff can do, plus the dashboard, weekly ad numbers, the Claude-written weekly summary and settings.

Stack: React + Vite + Tailwind v4, UI from [ReUI](https://reui.io) and shadcn/ui (Base UI, base-nova style), one Netlify Function (`/api/*`), Postgres on Neon, Claude Haiku 5.5 for the two AI features. Money is in AED and dates are Dubai time. Everything runs on free plans; the only cost is Claude API usage.

## Deploy (about 15 minutes)

### 1. Database: Neon

The repo is already linked to the Neon project `orange-tree-95839736` (branch `production`) through `neon.ts` and a local `.neon` file. The tables already exist there.

To get the connection strings on a new machine:

```bash
npm i -g neon@latest
neon login                 # browser sign-in
neon link --project-id orange-tree-95839736 --branch production
neon env pull              # writes DATABASE_URL, DATABASE_URL_UNPOOLED and the rest to .env.local
npm run db:setup           # creates any missing tables; safe to rerun
```

`.env.local` is git-ignored. The app reads the pooled `DATABASE_URL`; `db:setup` uses the direct `DATABASE_URL_UNPOOLED`, as Neon recommends for schema changes. Both go through Neon's serverless driver over HTTPS, so no open Postgres port is needed.

### 2. Code: GitHub

Push this folder to a private GitHub repository.

### 3. Hosting: Netlify

1. Sign up at [netlify.com](https://netlify.com) and choose **Add new project → Import an existing project**, then pick the repository. The build settings come from `netlify.toml`.
2. Before the first deploy, open **Project configuration → Environment variables** and add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The pooled connection string: `DATABASE_URL` from `.env.local` |
   | `STAFF_PIN` | Six digits for AVM staff |
   | `AGENCY_PIN` | Six different digits, for you only |
   | `SESSION_SECRET` | A random string of 32+ characters (run `openssl rand -hex 32`) |
   | `ANTHROPIC_API_KEY` | Optional. Easier: paste the key in the app under **Settings → Claude API key** |

3. Deploy. Open the site, sign in with the agency PIN, and go to **Settings**.

### 4. First-time setup in the app

1. **Settings → Campaigns:** add each running ad with its pre-filled WhatsApp message (for example "Hi, I saw your ad for visiting cards"). Use the same message in the ad's WhatsApp button in Meta Ads Manager.
2. **Settings → Services:** replace the sample list with what AVM actually sells.
3. **Settings → Staff:** add the names of the people who answer enquiries.
4. **Settings → Claude API key:** paste your key. It's checked with Claude, stored encrypted, and can't be viewed or copied afterwards, only replaced or removed.
5. Send AVM the site link and the staff PIN. On their phones: open the link, then **Add to Home Screen**.

### Adding leads quickly

On a laptop, **Leads** opens as a table. Type in the tinted top row (Tab moves across, Enter saves), click any cell of an existing lead to edit it, or copy rows from Excel or Google Sheets and paste them into the top row, then **Save all**. Columns in order: customer, business, number, channel, from ad, service, status, value (AED), lost because, handled by, note. On phones, use **Log lead**.

### Every week

Open **Ad data**, pick last week, and copy four numbers per campaign from Meta Ads Manager: amount spent (AED), impressions, link clicks, and messaging conversations started. Then open the dashboard and press **Write summary** to get a note to send AVM.

## Run locally

Needs Node 22+ and the Neon setup above.

```bash
npm install
neon env pull           # database values into .env.local
cp .env.example .env    # PINs, session secret, Claude key
npm run dev             # http://localhost:5173
```

To try changes without touching production data, work on a Neon branch: `neon checkout dev --create` (it expires after 7 days, as set in `neon.ts`).

`npm run dev` serves the API from the same code Netlify runs, so you don't need the Netlify CLI.

## How the numbers work

- **Dates** are UAE time (Asia/Dubai). A lead counts in the period it was logged.
- **Money** is in UAE dirhams (AED).
- **Channels:** every lead came in on WhatsApp, Instagram, Facebook or a phone call. Separately, it's from a specific ad campaign, from an ad but not sure which, or not from an ad.
- **Phone numbers** are stored with their country code (971501234567). Staff can type local UAE numbers (050 123 4567); other countries need their + code.
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
src/components/ui/       shadcn/ui components (copied in, owned by this repo)
src/components/reui/     ReUI components (copied in, owned by this repo)
public/brand/            AVM and 8px Studio logos
```

## Design

- **Type:** Urbanist for the interface, Instrument Serif for headlines and big numbers. Both are self-hosted through Fontsource.
- **Colour:** paper-white canvas, ink-black actions, and AVM's CMYK colours only where they carry meaning (brand marks, the revenue line, focus rings). Tokens are in `src/index.css`.
- **Components:** add more with `npx shadcn@latest add @reui/<name>` (ReUI) or `npx shadcn@latest add <name>` (shadcn). ReUI's page blocks need a paid licence; its components and examples are free.
- `src/components/reui/date-selector.tsx` has one local change, marked "AVM change", to hide the operator row when it is fixed.

## Security notes

- PINs, the database URL and the Claude key live only in Netlify environment variables; the browser never sees them.
- A correct PIN sets a signed, HttpOnly cookie for 30 days. Five wrong PINs from one IP address lock sign-in for 15 minutes.
- Paste-to-log sends the pasted text to Claude, which can include a customer's name and number. The weekly summary sends totals only.
- To sign everyone out, change `SESSION_SECRET` and redeploy. To change a PIN, change its variable and redeploy.
