# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

A **stdio MCP server** that calls the INAVI Maps Open API and renders the results as an
interactive map inside the conversation through MCP Apps. It is not a web server —
`stdout` carries JSON-RPC only.

The sibling project `../inavi-maps-mcp-server` serves documentation (API specs, SDK examples);
this one calls the APIs.

## Commands

```bash
npm run dev          # tsx watch
npm run build        # view (Vite) → public/ui/map.html, then server (tsup) → dist/server.js
npm test             # Vitest
npm run lint         # ESLint
npm run type-check   # three tsconfigs (server / view / view tests)
npm run check:pack   # the npm tarball must contain exactly the six expected files
npm run inspect      # MCP Inspector (after build)
```

`build:ui` must run before `build:server`: the server reads `public/ui/map.html` at runtime.

## Git and Release

- **Commit messages, PR titles and PR bodies are written in English.** Use Conventional Commits
  with a scope where it helps: `feat(ui): ...`, `fix(route): ...`, `ci(release): ...`, `docs(readme): ...`.
  Imperative subject, no trailing period; the body explains why.
- Work on a branch and merge into `main` through a PR. `ci.yml` runs type-check, lint, test,
  build and `check:pack` on Node 22 and 24 for every PR.
- **Releases run from GitHub Actions**, not the shell: `Actions > Release > Run workflow`.
  `npm run release` only prints a pointer and exits 1. The workflow bumps the version, pushes the
  version commit and tag `vX.Y.Z` straight to `main`, publishes to npm, waits for `latest`, and
  creates a GitHub Release. `version-type: none` republishes the version already on `main`
  (recovery path after a failure past the version push).
- npm authenticates with **Trusted Publishing (OIDC)** registered for this repository and
  `release.yml`. There is no npm token. Renaming the workflow file or the repository requires
  re-registering the trusted publisher on npm.
- Never publish source maps. The tarball is `dist/server.js`, `public/ui/map.html`, `README.md`,
  `LICENSE`, `.env.example`, `package.json`.

## Architecture

```
src/         server (Node, ESM). Bundled by tsup into a single dist/server.js
  server.ts    entry — McpServer, tool/resource registration, stdio transport
  config/      dotenv + zod env validation (runs on import)
  clients/     iNavi REST layer, one method per API
               inavi-http.client.ts is the shared base; inavi-error.ts attaches action hints to failures
               search · geocoding · spatial · route · optimize · matrix (same as the API categories)
  tools/       one folder per domain — <name>.tool.ts + schema/*.schema.ts. 11 model-visible tools
               search/    search_places · search_nearby_category · find_entry_points
               lookup/    lookup_category_code (no API call; the table is bundled)
               geocoding/ geocode_address · reverse_geocode
               spatial/   get_admin_boundary
               route/     find_route · find_walking_route · kst-time.ts (times ↔ Korea time)
               optimize/  optimize_waypoint_order
               matrix/    get_distance_matrix
               common/    envelope.ts · split-coords.ts · drop-duplicates.ts · tool-result.ts ·
                          schema/ (shared schemas, incl. waypoint-place.input.schema.ts)
               app/       template-only tools (visibility: ["app"], hidden from the model)
  resources/   ui:// resource registration + CSP
  utils/       logger · paths · schema-dialect

ui/          template (browser, ESM). Vite + vite-plugin-singlefile → one HTML file
  map.html              map + left result panel (summary · filters · result list)
  src/main.ts           App wiring. Receives tool args, results, cancel and teardown
  src/render-host.ts    composition — map creation, renderer dispatch, modes, re-calls, interactions
  src/render/           result drawing. result.ts is the single source of markers, info windows and list markup
  src/host/             host/server messaging (queries, tool context, model context, errors, display mode)
  src/map/              SDK loader, map styles, theme, colors, overlays, fit area
  src/panel/            left panel (controls, pager, detail toggle, marker ↔ list link, POI filter)
  src/rail/             on-map controls (rail, research button, option rows)
  src/route-pick/       route-building mode
  src/shared/           payload.ts (minimal response types + `_meta.kind`) · dom.ts · icons.ts
```

The `@/*` alias points to `src/*` (server code only). View code uses relative imports.

## Server Rules

**Never write to stdout.** No `console.log`. Log with `logger.log(level, data)` (MCP logging
notification); it falls back to stderr before connection or on failure. `env.config.ts` seals
`process.stdout.write` while dotenv loads.

**The only user-facing environment variable is `INAVI_APPKEY`.** README and `.env.example` list
only that. `INAVI_DOMAIN` is read for dev-server testing but never documented. The CDN domain and
request timeout are hard-coded in `env.config.ts` because the CDN goes straight into the template
CSP. Do not expose new settings as environment variables.

**Never log the API key.** Pass URLs through `maskAppkey()` before logging or putting them in errors.
Never put the API key in the template HTML — the template fetches it through `get_map_config`
(a template-only tool) via `app.callServerTool`.

**Every request to iNavi carries `client=api-mcp`** as a query parameter so the API server's access
log can count this project's traffic. Two places: `CLIENT_QUERY` in `inavi-http.client.ts` (GET and
POST) and `CLIENT_TAG` in `ui/src/map/inavi-loader.ts`. It is a query, not a header, because the SDK
loader is a `<script src>`. **Change both together.**

**Responses use one envelope: `{ header, data }`** (`tools/common/envelope.ts`). The upstream APIs
return four different envelope shapes; normalize them in that one place.

**Trimming the body** (`tools/common/drop-duplicates.ts`) removes only values that are exact
duplicates of another field in the same response: the body's `result` (same as
`header.isSuccessful`) and RDM `distance.text` / `duration.text` (derivable from `value`). Verify a
formula holds on real responses before treating a field as a duplicate. On an unknown shape, return
the original. `isHighWay` is dropped from routes because it is wrong (`tools/route/drop-ishighway.ts`);
check `paths[].road_code` for `1` instead. Do not add more of these without repeated evidence.

**Route prediction times are emitted as ISO strings** (`departAt` / `arriveAt`, Korea time) by
`tools/route/kst-time.ts`. Always Korea time: the stdio server inherits the host machine's `TZ`, so
never use local-time getters on `Date`.

**Coordinate arrays are left out of responses by default.** `includeCoords` (default `false`)
controls it. Removed coordinates go to `_meta` and the template restores them
(`src/tools/common/split-coords.ts` ↔ `ui/src/host/restore-coords.ts`).

| Tool | Removed | `_meta` key |
|---|---|---|
| `find_route` · `find_walking_route` | `data.paths[].coords[]` | `routeCoords` |
| `get_admin_boundary` | `data.polygondata[].polygonlist[].polygon[]` | `polygonCoords` |

`_meta` reaches the template only, never the model context.

**The model reads tool descriptions, not output-schema field descriptions.** Put any value meaning
the model must act on (code tables, naming rules) in the tool description.

**Do not put plan limits (daily quotas) in tool descriptions.** The model starts choosing tools by
quota instead of by the question they answer.

**Map display is off by default.** The ten map tools take `showMap` (default `false`), passed to
the template as `_meta.showMap`. All tools share one `ui://` resource; without it every intermediate
lookup would stack another map.

**Tools that take only coordinates also take what place they are** — `startPlace`, `endPlace`,
`vias[].place` (route, walking, optimize, matrix), passed to the template as `_meta.places`. Arrays
keep their length with `null` gaps so names never attach to the wrong pin. When no name is given,
show `출발지` / `도착지` and the coordinate; never invent a name. Optimize results are aligned to
places by coordinate, not by `index`.

**Failure hints stay for the model, not the user.** `src/clients/inavi-error.ts` appends an English
hint to failures; keep it. The template picks user-facing text by result code in
`ui/src/host/error-text.ts` and never copies the raw message.

## Schema Rules

- **Always declare `outputSchema` and make body fields `optional`.** SDK v1 requires
  `structuredContent` when `outputSchema` exists, and a declared field that is missing fails the
  call. iNavi often omits empty fields. Use `dataEnvelopeOutputSchema`.
- **Body objects use `openObject()`; unknown shapes use `anyObject()`.** Plain `z.object()` emits
  `additionalProperties: false`, which contradicts pass-through. `z.unknown()` emits `{}`, which some
  clients reject. Close only the envelope itself and outputs we construct.
- **Never reuse a zod instance within one schema.** The converter emits `$ref: "#/properties/..."`
  for the second use, and clients that do not resolve internal pointers lose that schema. Use
  factory functions called per site (`categorizedAddress()`, `point()`).
- `poi[].subpoi.poi` in search responses is recursive: describe one level and open the inside with
  `anyObject()`. Do not use `z.lazy()` (it emits `$ref` / `definitions`).
- `test/tools/schema-portability.test.ts` enforces these rules and checks that fixtures pass and that
  declarations cover the real fields.

## Template Rules

**Template queries go through the server.** `ui/src/host/queries.ts` calls server tools with
`app.callServerTool` (`searchInBounds`, `reverseGeocodeAt`). Never call iNavi REST from the browser.

**Re-calls go through one path** (`runSearch` / `runOptionTool`). They inherit the arguments that
produced the current result (`activeArguments` in `tool-context.ts`) and replace one or two fields.
Replace `activeArguments` only on success. A new area resets paging. Results the template fetches
itself must also pass through `restoreCoords`.

**The template only re-calls the same tool with changed options.** Calling a different tool is done
by composing a sentence and handing it to the conversation (`sendMessage`, e.g. route building).

**What goes on the map:** only what serves (1) viewing results, (2) re-searching a new area, or
(3) picking one result to continue in the conversation. Changing conditions (query, radius, sort)
belongs to the conversation.

**Per-result controls:**

| Result | Controls |
|---|---|
| `search_places` | language · paging · research in current view · route building |
| `search_nearby_category` | paging · route building |
| `geocode_address` | paging (page size 5, the tool default) |
| `find_route` | search option · vehicle type |
| `find_walking_route` | travel mode (`walk` / `pm`) · search option |
| `find_entry_points` | entry type |
| `get_distance_matrix` | traffic |
| `reverse_geocode` · `get_admin_boundary` · `optimize_waypoint_order` | none |

- Decide availability in one place (`areaSearchBlockReason`) using the tool name the server sent in
  `_meta.kind` (`searchToolOf`, `isCarRoute`). Do not infer from renderer type or argument names —
  the same argument name means different things in different tools.
- Paging re-calls the tool that produced the result; argument sets differ between tools. Page size
  must match the tool's schema default (`queries.ts` table).
- Paging totals use the count of the kind being shown (`poitotalcount` / `admtotalcount`), except
  geocoding, which uses `totalcount` (`pager.ts` `pageTotal`).
- Selecting an option re-calls immediately; there is no Apply button while each control is one row.

**The research button sits at the bottom center** (`research-button.ts`). It appears when any edge
of the view moves more than 10% of its span from the initial view, and hides again on return. The
first `moveend` after rendering resets the baseline (the fit animation is not a user move). Do not
paint the search area when re-searching the current view (`drawArea: false`).

**Route building** is the only map-click mode. Add new modes next to the handle in `render-host.ts`
and call `syncMode()`; derive mode state from the handle, never a separate variable. Confirm before
sending (`경로 묻기` · `다시 고르기` · `취소`); `다시 고르기` clears list marks too (`clearPickMarks`).
Picks use the route entry coordinate (`position`) while pins use `pinPosition`. Block two picks with
the same entry coordinate (`samePickPosition`). `RoutePicker.add()` returns the filled slot.

**Report the model what the template did** via `ui/src/host/model-context.ts`
(`updateModelContext`, top 5 results). Check `getHostCapabilities().updateModelContext` first —
a resolved promise does not mean the host delivered it.

**Failures appear in one of two places**: the hint strip (`warn`) when a map exists, otherwise the
full-screen card (`.status--error`). Call `reportProblem()`; do not add new failure surfaces. Show
`userText` only (`DisplayError` / `displayText(error)`); keep technical causes out of the UI and
out of the browser console. Result code `100` means "nothing found", not an error.

**Summary line shows only what the result says** (`장소 30건 · 전체 460건`).

**List rows show name and address; everything else is behind `상세`.** Stat rows fold the same way
(`StatRow.detail`): route rows keep distance, time and fare open. `test/render/consistency.test.ts`
checks this across renderers.

## Rendering Rules

- **Renderers only translate responses into `MapFeature` / `StatRow`.** Markers, info windows and
  list markup are defined once in `ui/src/render/result.ts`. Do not use `new inavi.maps.Marker`,
  `new inavi.maps.InfoWindow` or `<li class="result-item">` in renderers (Polygon / Polyline are the
  exception). Add a row to `test/render/consistency.test.ts` for each new renderer.
- **All map colors live in `ui/src/map/map-colors.ts`**, themed values as `light` / `dark` pairs via
  `themed()`. Avoid green for filled areas (it disappears over parks); boundaries are a deeper blue.
- Points with the same role (matrix, optimize) get per-index colors (`PIN_SERIES`, `seriesColor`,
  ten colors then wrap); list badges use the same color (`MapFeature.seriesIndex`). Search results
  and route start/via/end keep their fixed colors.
- **Pin art and display size are separate** (`render/pin.ts`: `ART_*` is the 32×44 viewBox,
  `PIN_*` is the drawn size). Badges keep the 32:44 ratio.
- List badges use the same SVG as the map marker (`pinSvgDataUri(color)`, cached per color) as a
  `background-image`. Write SVG attributes with double quotes (`encodeURIComponent` leaves `'`
  unencoded), do not quote inside `url()` in a `style` attribute, and use longhand `background-*`
  properties. Items without a marker use `featureList(features, { marker: false })`.
- **Pin highlights paint both the original and the clustered clone** (`paintPins`, `data-pin-index`).
  Hovering a marker highlights and scrolls the list row; with clustering this is wired through
  clusterer events. Clicking a list row flies to it with `focusZoom`, never zooming out.
- Matrix lists are grouped by origin (`StatRow` without `value` is a header, `child` rows follow) and
  self-pairs are dropped by coordinate.

## Style Rules

- Overlays (hover, selection) use only `--overlay` / `--overlay-strong`; do not add theme-specific
  literal overrides. Popover item hover uses `--overlay-strong`.
- The hint strip (`setMapHint`) has `info` and `warn` tones via `--hint-*` tokens, sits at the bottom
  right above the logo, uses a ~20% background with `backdrop-filter`, 13px / 600 text, no `opacity`.
  Warnings are amber, not red. Buttons in the strip get `pointer-events: auto`; the strip does not.
- Anything overlaid on the map needs `pointer-events: none` unless it is interactive. `.status`
  replaces the map; use `setMapHint` once the map is shown.
- Hide the research pill while a mode is on (`body.map-mode-on`).
- Multi-line hint text uses `\n` (`white-space: pre-line`).

**Do not change iNavi Web SDK call patterns.** The map code is ported from verified examples; change
data values only. iNavi Maps is not Google Maps.

## Finding API Specs and Examples

If the sibling MCP server is connected, call its tools instead of searching files.

```
get_api_spec({ operationId: "getSearchesResult" })      # place search
get_api_spec({ operationId: "getCoordinateResult" })    # geocoding
get_api_spec({ operationId: "getAddressesResult" })     # reverse geocoding
get_api_spec({ operationId: "postRouteNormalResult" })  # route
list_api_specs({ category: "..." })                     # the other 39 APIs

get_map_example({ id: "dynamic-basic" })                # map init
get_map_example({ id: "infowindow-clustered-markers" }) # clusters + info windows
get_map_example({ id: "shapes-polyline" })              # traffic-colored polyline
get_map_example({ id: "dynamic-map-type" })             # map types (the only source of style URLs)
```

## iNavi API Pitfalls

- **Authentication is in the URL path**: `/maps/v3.0/appkeys/{APPKEY}/...`
- **Failures return HTTP 200.** Always check `header.isSuccessful`. `300` = auth failure, `301` = bad URL.
- **Coordinate types differ per API.** Search / geocoding use strings (`dpx: "127.1"`), route and
  entry points use numbers, RDM `origins` / `destinations` use `"x,y"` strings.
- **POI coordinates differ by purpose.** `dpx`/`dpy` are for display (building center),
  `rpx`/`rpy` and `routepoints[]` are vehicle entries, `entrypoint.px/py` are entry points. Use entry
  coordinates for routing.
- **Search can return both `poi` and `adm`**, and spatial filters (`spopt`, `radius`, `x1`–`y2`)
  apply only to `poi`. No request parameter excludes `adm`; the server does not filter it, the tool
  description tells the model, and the map fits the requested area (`ui/src/map/fit-area.ts`).
- **Admin boundaries need the full name from the province down** (`경기도 성남시 분당구`; include the
  district when a city has one).
- **Geocoding `admtotalcount` is the count in this page**, not the total; page with `totalcount`.
- **Reverse geocoding `location.adm` is an object**, not an array. `bldname` is the nearest building,
  not the business at that point. No result means no `location` key.
- **No API answers "what is here?" from coordinates alone.** Search needs `query`, nearby search
  needs `catecode`.
- **`groupByTrafficColor: true` removes `V` / `E` from `point_type`.** We keep `true` (a third of the
  segments) and take vias from the request (`getRequestedVias` + `snapToRoute`), start/end from the
  first/last coordinate.
- **Do not enum `point_type`.** Vias are `V1`, `V2`, ...; compare with `startsWith('V')`.
- **Web SDK assets come from `timbase.inavi.com`, not the API domain.** Both must be in the template
  CSP (`config.inavi.cdnDomain`).

## Spec vs Reality

Do not declare types from the spec alone; `example` values are often wrong.

| API | Field | Spec | Actual |
|---|---|---|---|
| Route prediction | `times[].startTime` · `endTime` | these names | **`start_time` · `end_time`** |
| Spatial search | `polygondata[].polygonlist` | object | **array** |
| Walking / PM route | `paths[].speed` · `road_code` · `traffic_color` | not declared | **present** (`traffic_color` is one value for walking) |
| Spatial search | `polygondata[].admincode` | example `"true"` | 8-digit code (request takes 10) |
| RDM | `mode` | example `"driving"` | `"tms"` |
| RDM | `origins[]` | flat numbers | `"x,y"` string array |
| Route | `isHighWay` | highway included | wrong — dropped from responses |

Count limits contradict within the spec (RDM points 100 vs 300, walking vias 100 vs 5); use the
smaller value.

Fixtures in `test/fixtures/` are captured real responses. Quotas on some APIs are small, so they
are hard to re-capture.

## MCP Apps Host Compatibility

- Put CSP in both `_meta.ui.csp` and `_meta.csp` (spec vs MCP Inspector). See `UI_META` in
  `map-ui.resource.ts`.
- `resourceDomains` needs `data:` and `blob:` (marker icons are data URIs).
- The SDK ready callback must be `window.initMap`; the loader hard-codes it and fails silently
  otherwise (`ui/src/map/inavi-loader.ts`). The loader has a 15 s timeout.
- `worker-src 'none'` blanks tiles and polylines (Mapbox GL needs blob workers). MCP Inspector
  hard-codes it, so verify the map in Claude Desktop and use Inspector for tool calls only.
- `ui/message` fills the host's input box instead of sending.
- Fullscreen is optional; create the button only when `availableDisplayModes` has it, and dispatch
  `resize` after a mode change.
- `ui/tool-cancelled` has not been observed in Claude Desktop.
- There is no dark style in the SDK docs; a separate night styleJSON is applied
  (`ui/src/map/map-style.ts`). On theme change, recreate the map, apply the style, then redraw
  (`setStyle` alone drops markers).

## Testing

- `test/clients`, `test/utils`, `test/tools` — server code, checked by `tsconfig.json`
- `test/render` — view code, needs DOM: checked by `tsconfig.test-ui.json`, files start with
  `// @vitest-environment happy-dom`
- `test/fixtures/*.json` — captured API responses, the reference for renderers
- `test/render/fake-inavi.ts` — SDK test double that records what renderers drew
- Unit tests use only the fake SDK; confirm real rendering in Claude Desktop.
