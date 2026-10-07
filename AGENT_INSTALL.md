# Canopy agent installation runbook

This runbook is written for a coding agent operating in a local checkout of Canopy. Complete the installation rather than handing commands back to the user.

## Target outcome

Leave the user with:

- a working local development environment;
- separate production and preview Cloudflare D1 databases;
- an app-specific Worker name and correct bindings in `wrangler.jsonc`;
- all D1 migrations applied to both databases;
- generated Better Auth secrets stored locally and in Cloudflare;
- a deployed Cloudflare Worker with static assets;
- passing tests, type checks, builds, and live smoke checks.

## Operating rules

1. Inspect the repository, `AGENTS.md`, package scripts, current Git state, remotes, and Cloudflare configuration before changing anything.
2. Work autonomously. The user's pasted install prompt authorises routine dependency installation, config edits, Cloudflare resource creation, migrations, secret uploads, deployment, and verification for this repository.
3. Interrupt the user only for:
   - browser approval for `wrangler login`;
   - a Cloudflare API token and account ID when interactive OAuth is unavailable;
   - elevated operating-system privileges;
   - a billable plan change;
   - deletion, replacement, or another destructive operation;
   - genuinely ambiguous ownership of an existing Cloudflare resource.
4. Do not ask the user to copy database IDs, edit files, generate secrets, or run commands that the agent can run.
5. Never display, log, commit, or push secret values. Redact command output if a tool might expose one. Store local secrets only in the ignored `.dev.vars` file.
6. Do not delete an existing Worker or database. Reuse a resource only when its ownership and purpose clearly match this checkout. When a name collision is unrelated or ambiguous, choose a unique new name.
7. Do not upgrade the Cloudflare account or enable another paid service without explicit approval. A deployment can start on Workers Free; recommend Workers Paid if authentication encounters CPU limit error 1102.
8. Preserve unrelated working-tree changes. Keep the procedure idempotent so rerunning it repairs or completes the installation without creating duplicate resources.

## 1. Prepare the toolchain

Check the installed versions first. This repository requires Node.js 22 or newer and declares its pnpm version in `package.json`.

- If Node.js is missing or too old, install a current Node.js 22+ release using an already available version manager or the platform's standard package manager. Ask before a command requires administrator privileges.
- Enable Corepack and activate the repository's declared pnpm version when pnpm is unavailable.
- Run `pnpm install --frozen-lockfile`. This installs the repository-pinned Wrangler dependency; do not add or depend on a global Wrangler installation.
- Invoke Wrangler as `pnpm exec wrangler ...` throughout.

Create `.dev.vars` from `.dev.vars.example` when it does not exist. Generate `BETTER_AUTH_SECRET` with a cryptographically secure tool such as `openssl rand -base64 32`, and set the local `BETTER_AUTH_URL` to `http://localhost:3000`. Do not overwrite a valid existing local secret.

Apply the local migrations and run the local quality gates:

```bash
pnpm db:migrate:local
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Fix repository or setup failures that are within scope before continuing.

## 2. Authenticate with Cloudflare

Run `pnpm exec wrangler whoami` without exposing credentials.

- If it is already authenticated, continue.
- In an interactive desktop environment, run `pnpm exec wrangler login` and ask the user only to approve the browser authorization when it opens.
- In a headless environment, ask for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Keep them in the process environment or another secure untracked location. Never write them into repository files.

Confirm that the authenticated account can manage Workers, D1, Worker secrets, and Worker Previews before creating resources.

## 3. Choose names and inspect existing resources

Derive a short Cloudflare-safe base name from the repository directory, normally `canopy` or `opportunity-solution-tree`. Choose these names without asking the user unless the repository already documents a preference:

- Worker: the base name, with a short non-secret suffix when needed for uniqueness;
- production database: `<worker-name>-db`;
- preview database: `<worker-name>-preview-db`.

Use Wrangler to list the account's D1 databases and inspect any Worker with the proposed name. Treat the IDs checked into the upstream `wrangler.jsonc` as example installation data unless those exact resources exist in the authenticated account and clearly belong to this fork.

Reuse an exact, clearly owned resource. Otherwise create the missing databases with `pnpm exec wrangler d1 create ...`, then obtain their IDs from Wrangler output or `pnpm exec wrangler d1 list --json`. Do not make the user copy IDs.

Update `wrangler.jsonc` so that:

- `name` contains the chosen Worker name;
- the production `DB` binding contains the production database name and ID;
- `preview_database_id` contains the preview database ID;
- `previews.d1_databases[0]` contains the same preview database name and ID;
- `migrations_dir` remains `drizzle`;
- `CANOPY_PREVIEW` remains `true` for previews;
- static asset and `/api/*` routing settings remain intact.

Validate the edited JSONC using Wrangler before applying migrations.

## 4. Migrate both databases

Apply every checked-in migration to production and preview:

```bash
pnpm db:migrate:remote
pnpm exec wrangler d1 migrations apply DB --remote --preview
```

Review the command results and confirm that both databases are current. Migration prompts for the newly created databases are routine and authorised by the install prompt.

## 5. Deploy and configure authentication

Run `pnpm cf:deploy` and capture the resulting canonical `https://...workers.dev` origin. Use the origin only, without a path or trailing slash.

Generate a fresh production Better Auth secret locally without printing it. Upload:

- `BETTER_AUTH_SECRET` to the production Worker;
- the canonical Worker origin as `BETTER_AUTH_URL` to the production Worker;
- a separate generated `BETTER_AUTH_SECRET` to the Worker Previews base configuration.

Use Wrangler's secret commands and pipe values over standard input. Do not place production or preview secrets in `wrangler.jsonc`, shell history, Git, command output, or a tracked file. The relevant commands are:

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put BETTER_AUTH_URL
pnpm exec wrangler preview base-config secret put BETTER_AUTH_SECRET
```

Run `pnpm exec wrangler secret list` to confirm the production secret names exist. A final `pnpm cf:deploy` is acceptable when needed to ensure the current code and bindings are the active deployment.

## 6. Verify the installation

Repeat the repository quality gates after the final configuration change:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Smoke-test the deployed app without creating a user on the user's behalf:

- `/` returns HTTP 200 and contains the Canopy application shell;
- `/sign-in` returns HTTP 200;
- `/api/auth/get-session` returns HTTP 200 with an unauthenticated response;
- an unauthenticated protected API request returns HTTP 401;
- a cross-origin unsafe API request returns HTTP 403.

Inspect Cloudflare deployment status and logs if any check fails. Diagnose and repair configuration, migration, binding, secret, or runtime problems, then rerun the affected checks.

## 7. Leave a maintainable repository

Review the diff and ensure it contains configuration changes but no credentials or generated runtime data. If the checkout is a writable fork owned by the user and the install prompt was pasted verbatim, commit and push the setup configuration so future Cloudflare builds use the correct bindings. Never push unrelated user changes. If remote ownership is unclear, prepare a focused commit and ask before pushing.

Report:

- the production URL and Worker name;
- the production and preview database names, but not secrets;
- migrations applied;
- verification commands and results;
- repository files changed and any commit or push performed;
- whether Workers Paid is recommended or already enabled;
- optional custom-domain or Cloudflare Git integration steps, clearly marked as optional.

Do not finish with setup work still pending unless progress is blocked by one of the user-only actions listed above.
