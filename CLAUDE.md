# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is a **fork of Ghostfolio 3.9.0** (`pintaste/ghostfolio`). It is consumed by the parent project at `../` (Delta → Ghostfolio import) — see `../CLAUDE.md` for the overall workflow and the **hard rule of never touching the VPS production stack**. This file is about developing _inside the fork_.

## How this fork is run (important)

In this project the fork is **not** run via the normal Nx dev server. It is built into a Docker image and run by the isolated local stack at `http://localhost:3334`. There is **no hot reload** — every change goes through a full image rebuild:

```bash
# from ghostfolio/
docker build -f Dockerfile -t ghostfolio-fork:precision .          # ~6–8 min — run in background
cd ../import-tool/local-stack
docker compose up -d --force-recreate ghostfolio
curl -s -o /dev/null -w '%{http_code}' http://localhost:3334/api/v1/health   # expect 200
```

Confirm a change reached the served bundle (Angular `@Input()`/method names survive minification):

```bash
cid=$(docker ps -qf name=gf-local-app)
docker exec "$cid" sh -c "grep -rl '<inputOrMethodName>' /ghostfolio/apps/client/en/"
```

The build compiles Angular **and** the `libs/ui` Storybook with `strictTemplates` + `strictNullChecks`, so a template typo or a possibly‑undefined access in `libs/ui` **fails the whole image build**. After editing `libs/ui`, scan the build log for `error TS`/`ERROR in` before deploying.

## Standard Nx commands (for non‑Docker work)

Node ≥ 22.18. Monorepo is Nx.

```bash
npm run start:server     # nx api:serve --watch
npm run start:client     # nx client:serve (hmr)
npm run lint             # lint all projects
npm run test             # test all (uses .env.example)
npx nx test ui           # test one project
npx nx test ui --test-file=<spec>   # single spec
npx nx build client      # build one project
```

## Monorepo layout

- `apps/client` — Angular app (standalone components, signal inputs, `@if/@for` control flow).
- `apps/api` — NestJS API (Prisma/Postgres, Redis, Bull).
- `libs/common` — shared types, interfaces, DTOs, helpers (`@ghostfolio/common/*`). Changes here cross both apps.
- `libs/ui` — shared standalone components (`@ghostfolio/ui/*`), e.g. `gf-value`, `gf-holdings-table`, `gf-line-chart`, `gf-toggle`. Strict Storybook build (see above).
- `prisma/schema.prisma` — DB schema. `MarketData` holds both asset prices and FX rates (symbol = `CADUSD`, `USDCAD`, …).

## Cross‑cutting patterns this fork relies on

### User settings (adding a new one)

A setting flows through three files, then is read on the client:

1. `libs/common/.../interfaces/user-settings.interface.ts` — add the field.
2. `libs/common/.../dtos/update-user-setting.dto.ts` — whitelist it (e.g. `@IsIn([...])`). **The user‑setting controller deletes keys whose value is `false`/`null`**, so a toggle that must persist its "off" state has to be a **string enum, not a boolean**.
3. (if it's a new union) add a type under `libs/common/.../types/` and export it from `types/index.ts`.
4. Persist with `dataService.putUserSetting({ key })`, then `userService.get(true)`; `apps/client/src/app/app.component.ts` reacts to `userService.stateChanged` to apply global effects.

### Gain/loss color scheme (红涨绿跌 by default)

- Colors are CSS variables `--gf-color-gain-rgb` / `--gf-color-loss-rgb` defined in `apps/client/src/styles.scss` (default gain = red), overridden by `body.gf-performance-colors-western` (gain = green).
- `app.component.ts` toggles that body class from the `gainLossColorScheme` user setting.
- `gf-value` colors the number (`.value`), the sign (`.gf-sign`) and the unit/symbol (`.gf-unit`) via those vars when `colorizeSign` is set. Anything canvas‑based (`gf-line-chart`) reads the same vars via `getComputedStyle`.
- To color a new performance value, render it through `gf-value` with `[colorizeSign]="true"` — do **not** hardcode `text-success`/`text-danger`.

### `gf-value` (the money/number primitive)

- `isCurrency` + `unit` → renders a currency **symbol prefix** (`$`, `CA$`, `CN¥` via `Intl.NumberFormat.formatToParts`), not a trailing code. No `unit` → bare number (tables).
- `isQuantity` → dynamic precision for small/large quantities.

### `gf-holdings-table`

Feature‑gated by inputs so the same component serves the home page, account dialog, and public page:

- `groupByAssetSubClass` — collapsible category header rows (chevron toggles `collapsedGroups`), in‑group sorting (sort is captured manually while grouped because the grouped row order must be preserved), per‑group subtotals rendered through the **real columns** (group row reuses `displayedColumns`; cells that touch `assetProfile` are guarded with `$any(element).isGroupHeader`).
- `showTotal` — grand‑total footer row (`totals()` computed from the holdings input).
- `stickyHeader` — wraps the table in a `max-height` scroll pane so `position: sticky` has a bounded scroll container.
- Aggregate `performance %` = Σnetperf / Σinvestment, **guarded** against `|investment| ≤ 0.01` (closed positions net to ~0 → otherwise astronomical %).

### Currency / FX

Base‑currency display is changed globally via `putUserSetting({ baseCurrency })` (accurate backend recompute) — not a front‑end conversion overlay. This requires dense FX in `MarketData` for both directions; see `../CLAUDE.md` (FX section) for the `USD{X}` fallback gotcha that 500s `base != USD` if only `{X}USD` is seeded.

## Conventions

- Match upstream style; keep changes surgical. Comments in this fork's customizations are bilingual (CN/EN) to match existing edits.
- Frontend customizations live mainly in `libs/ui/src/lib/{value,holdings-table,line-chart,activities-table}` and `apps/client/.../components/{home-holdings,holding-detail-dialog,user-account-settings}`.
