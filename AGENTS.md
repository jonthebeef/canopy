# Canopy contributor notes

- The React interface is a static Vite single-page app in `src/react-app`.
- The Hono API Worker is in `src/worker`; only `/api/*` should invoke it.
- Keep D1 access request scoped by passing the binding through `RequestContext`.
- Run `pnpm test`, `pnpm exec tsc --noEmit`, and `pnpm build` before opening a pull request.
