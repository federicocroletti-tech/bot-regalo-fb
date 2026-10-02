# Regali Facebook Catalogo

- Stack: React 19, TypeScript strict, Vite, Vitest.
- Keep domain and persistence independent from the UI to allow a future web backend.
- Do not add scraping, private APIs, cookie handling, or browser automation for Facebook.
- Any Meta Graph API integration must be implemented only from current official documentation, with explicit documented permissions and app review requirements.
- Treat Gmail notifications from explicitly authorized Facebook groups as the primary automated source; retain valid post permalinks as candidates when notification text is incomplete.
- Prioritize Milan and nearby-area signals in candidate ranking and presentation.
- Poll authorized sources hourly by default and avoid duplicate or unnecessary provider calls.
- Support additional Facebook Pages only when the user manages them and grants documented Meta permissions.
- Add third-party gift or donation sources only through their documented APIs, RSS/Atom feeds, exported data, or explicit written authorization; do not scrape them.
- Run `npm run lint`, `npm test`, `npm run typecheck:server`, and `npm run build` after relevant changes.
