# Canopy

Canopy is a collaborative opportunity solution tree for product trios. It gives product managers, designers, and engineers one shared place to connect a business goal to product outcomes, customer opportunities, possible solutions, and experiments.

**[Try the hosted app](https://opportunity-solution-tree-app.jonthebeef.workers.dev)**

Canopy is deliberately opinionated. The defaults reflect how I think a trio should work:

- Start with one clear business goal.
- Define measurable product outcomes the team can influence.
- Capture opportunities as customer needs, pains, or desires.
- Use optional “How might we” cards when another thinking layer helps.
- Explore multiple solutions before committing.
- Test assumptions with experiments.
- Use RICE as a common prioritisation language.
- Archive decisions instead of quietly deleting the history.

Those opinions are the starting point, not a cage. Fork the project and change the hierarchy, scoring model, labels, or workflow to suit your team.

## What it does

- Visual tree with persistent drag-to-reorder and drag-to-reparent
- Search that finds a card, expands its ancestors, and centres it in the tree
- Goal, outcome, How might we, opportunity, solution, and experiment cards
- Table view with filters, sorting, inline editing, and RICE ranking
- Evidence attached to cards
- Full activity history for changes, moves, archives, and restores
- Shared workspaces with admin and contributor roles
- Live polling so a trio sees each other's changes
- CSV export
- Email and password authentication

## The model

```text
Goal
└── Product outcome
    ├── How might we?      (optional and repeatable)
    └── Opportunity
        ├── Opportunity    (for useful sub-problems)
        ├── How might we?  (optional and repeatable)
        └── Solution
            ├── How might we?  (optional)
            └── Experiment
```

How might we cards are intentionally flexible. They can be nested and used between the main tiers without turning every card into an unstructured canvas.

RICE is calculated as:

```text
(Reach × Impact × Confidence) ÷ Effort
```

Reach, impact, and effort use a 0–10 scale. Confidence uses 10% steps. A card remains unranked until all four values are present.

## Stack

- [Next.js](https://nextjs.org/) and React
- [React Flow](https://reactflow.dev/) for the tree canvas
- [Better Auth](https://better-auth.com/) for accounts and sessions
- [Drizzle ORM](https://orm.drizzle.team/) with Cloudflare D1
- [OpenNext for Cloudflare](https://opennext.js.org/cloudflare) on Cloudflare Workers
- Tailwind CSS and Base UI

## Run it locally

You need Node.js 22+, pnpm, and a Cloudflare account.

1. Clone your fork and install dependencies.

   ```bash
   git clone https://github.com/YOUR-NAME/opportunity-solution-tree-app.git
   cd opportunity-solution-tree-app
   pnpm install
   ```

2. Create a local secrets file.

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Generate a secret with `openssl rand -base64 32` and place it in `.dev.vars`.

3. Start the development server.

   ```bash
   pnpm dev
   ```

   The command applies the D1 migrations to a local database before starting Next.js at [http://localhost:3000](http://localhost:3000).

## Deploy your fork to Cloudflare

The repository includes the OpenNext, Wrangler, and D1 configuration. You still need your own Worker name, D1 database, and authentication secrets.

### 1. Sign in to Cloudflare

```bash
pnpm exec wrangler login
```

### 2. Create production and preview D1 databases

```bash
pnpm exec wrangler d1 create opportunity-tree
pnpm exec wrangler d1 create opportunity-tree-preview
```

Copy the production database details into `d1_databases` in [`wrangler.jsonc`](./wrangler.jsonc). Copy the preview database ID into `preview_database_id` and `previews.d1_databases`. Keeping these databases separate means a pull request cannot change production data.

Also choose a unique Worker name. Set both of these fields to the same value:

```jsonc
{
  "name": "your-canopy-worker",
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      "service": "your-canopy-worker"
    }
  ]
}
```

### 3. Apply the database migrations

```bash
pnpm db:migrate:remote
pnpm exec wrangler d1 migrations apply DB --remote --preview
```

Do this before opening the deployed app. Run it again whenever a pull includes a new file in `drizzle/`.

### 4. Deploy the Worker

```bash
pnpm cf:deploy
```

Wrangler prints the `workers.dev` URL when deployment finishes.

### 5. Configure Better Auth

Generate and upload a high-entropy secret:

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

Then upload the exact public origin printed by Wrangler:

```bash
pnpm exec wrangler secret put BETTER_AUTH_URL
```

Enter a value such as:

```text
https://your-canopy-worker.your-subdomain.workers.dev
```

Use the origin only, with no path or trailing slash. If you later attach a custom domain, update `BETTER_AUTH_URL` to that domain.

Check that both secrets are attached to the expected Worker:

```bash
pnpm exec wrangler secret list
```

Give new Worker Previews their own authentication secret:

```bash
openssl rand -base64 32 | pnpm exec wrangler preview base-config secret put BETTER_AUTH_SECRET
```

Preview deployments derive their Better Auth URL from the branch Preview hostname. Production still requires the explicit `BETTER_AUTH_URL` above.

The app is ready when the homepage, sign-in page, and this endpoint all return HTTP 200:

```bash
curl -i https://YOUR-URL/api/auth/get-session
```

See the official guides for [OpenNext deployment](https://opennext.js.org/cloudflare/get-started), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), and [Better Auth configuration](https://better-auth.com/docs/installation).

## Cloudflare dashboard builds

You can connect the fork in **Workers & Pages → Create → Import a repository**.

Use:

- Build command: `pnpm exec opennextjs-cloudflare build`
- Deploy command: `pnpm exec opennextjs-cloudflare deploy`
- Preview command: `pnpm exec wrangler preview`
- Root directory: `/`

Create both D1 databases, update `wrangler.jsonc`, apply migrations, and add the production and Preview authentication secrets before treating the deployment as live.

## Useful commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Apply local migrations and run Next.js |
| `pnpm test` | Run the unit tests |
| `pnpm build` | Build the Next.js application |
| `pnpm cf:preview` | Build and preview in the local Workers runtime |
| `pnpm cf:deploy` | Build and deploy to Cloudflare |
| `pnpm db:generate` | Generate a Drizzle migration after a schema change |
| `pnpm db:migrate:local` | Apply migrations to local D1 |
| `pnpm db:migrate:remote` | Apply migrations to production D1 |
| `pnpm cf:typegen` | Regenerate Cloudflare binding types |

## Make it yours

The main opinionated seams are small and explicit:

- Card types, labels, and allowed parent/child relationships: [`lib/ost.ts`](./lib/ost.ts)
- Card colours and visual tags: [`components/ost/primitives.tsx`](./components/ost/primitives.tsx)
- RICE fields and formula: [`lib/ost.ts`](./lib/ost.ts)
- Tree layout and snapping: [`lib/tree-layout.ts`](./lib/tree-layout.ts)
- Database schema: [`lib/db/schema.ts`](./lib/db/schema.ts)
- Cloudflare bindings and Worker name: [`wrangler.jsonc`](./wrangler.jsonc)

When changing the database schema:

1. Edit `lib/db/schema.ts`.
2. Run `pnpm db:generate`.
3. Apply the new migration locally.
4. Commit the schema and generated migration together.
5. Apply the migration remotely before or alongside deployment.

## Contributing

Issues and pull requests are welcome. Keep changes focused, explain the product behaviour they introduce, and include tests for ordering, hierarchy, or scoring rules.

Before opening a pull request:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```
