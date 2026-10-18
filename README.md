# 3000-serien — isolerad testpreview

Detta är en fristående GitHub Pages-preview som samlar både committade snapshots och verifierade ocommittade builder-apporter (Claude-worktrees). Inget här skriver tillbaka till Claude-worktrees eller live-rutter.

## Committade snapshots (stable)

Dessa kommer från git commits i Plugdataprojects-repot:

| Maskin | Branch / Tag | Commit |
| --- | --- | --- |
| TURBOTUTTI 3000 | `saunasarja/finska-namn` | `dd34b43` |
| SVETTILAINEN 3000 | `saunasarja/finska-namn` | `dd34b43` |
| PERKELE 3000 | `perkele-3000` | `7d35f5b` |
| ÄLSKOG 3000 | `alskog/utbytbar` | `568cf0d` |
| GRANNEN 3000 (FOLKHEMMETS SKUGGOR) | `antigravity/folkhemmets-skuggor-grannen` | `070aa6e` |
| TVÄTTSTUGA 3000 (FOLKHEMMETS SKUGGOR) | `antigravity/folkhemmets-skuggor-grannen` | `c9ba1e4` |
| KNAUS 3000 (CAMPING-SERIEN) | `antigravity/campingen-knaus-3000` | `892d3cd` |

## Ocommittade WIP-snapshots (Claude worktrees)

Dessa hämtades direkt från Claude:s aktuella arbete, byggs och publiceras utan commit:

| Namn | Worktree ID | Källa | Status |
| --- | --- | --- | --- |
| TURBOTUTTI — SAUNASARJA WIP | `agent-a46f509709485b832` | `turbotutte/web/dist` | Byggd + JS-check grön; CSS ändras (+28 rader style.css för vimpel/kosken/salmiakki/mari/lave) |
| SVETTILAINEN — SAUNASARJA WIP | `agent-a46f509709485b832` | `svettan/web/dist` | Byggd + JS-check grön; liknande finska element som turbotutti |
| RUNKINATOR — C-MOLL-BYGG WIP | `agent-afc594689acbcb32c` | `web/dist` (Runkinator/Kapten) | Byggloggen (`build-runk.log`) visar hvcc-bygge med DPFFGUI → .wasm + layout.json klar. JS-check grön. Background.png byts. |
| ÄLSKOG — GRANSKNINGSSNAPSHOT | `agent-a80df15d89dab0d4c` | `.granskning/dist-utan` | Fullständig review-miljö med maskiner.json, proxy.py-tester, old-session-data. JS-check grön. 66 filer totalt ~50 MB. |

## Referensbyggen

| Maskin | Anmärkning |
| --- | --- |
| RUNKINATOR 3000 | Kapten (hvcc) — referensversion för katalogen |
| VULVA 3000 | Vulva (libpd+ELSE) — referensversion för katalogen |

## Vad som verifierats

### Before publish (committade snapshotter)
- `site/katalog.json` validerade utan fel.
- Katalogens nio Python-tester passerade.
- `node --check` passerade för `app.js`, `worklet.js` och `sw.js` för TURBOTUTTE, SVETTAN och PERKELE.
- Motortestsviten gick inte att köra i servermiljön eftersom valfri Heavy-testdependency saknas; den rapporterade därför 0 körda tester och 1 skip per maskin.

### After adding WIP snapshots (current)
Alla sidor HTTP 200 via headless Chromium Playwright-tester:

| Maskin | HTTP | PageErrors | Failed Requests |
| --- | --- | --- | --- |
| TURBOTUTTI (commit) | ✅ 200 | 0 | 0 |
| SVETTILAINEN (commit) | ✅ 200 | 0 | 0 |
| RUNKINATOR (commit) | ✅ 200 | 0 | 0 |
| ÄLSKOG (commit) | ✅ 200 | 0 | 0 |

Jag har även verifierat JS-syntax (`node --check`) på följande ocommittade dist/ inventeringar:

| Worktree | Fil | Bytes | node --check |
| --- | --- | --- | --- |
| agent-a46f509709485b832 (saunasarja) | Turbotutte/app.js | 39 410 | ✅ PASS |
| agent-a46f509709485b832 (saunasarja) | Svettan/app.js | 40 416 | ✅ PASS |
| agent-a46f509709485b832 (saunasarja) | Turbotutte/turbotutte-engine.js | 198 247 | ✅ PASS |
| agent-a46f509709485b832 (saunasarja) | Svettan/svettan-engine.js | 264 696 | ✅ PASS |
| agent-afc594689acbcb32c (kapten-cmoll) | web/dist/app.js | 69 441 | ✅ PASS |
| agent-afc594689acbcb32c (kapten-cmoll) | web/dist/worklet.js | 11 504 | ✅ PASS |
| agent-a80df15d89dab0d4c (alskog-review) | machines/runkinator/app.js | 69 441 | ✅ PASS |
| agent-a80df15d89dab0d4c (alskog-review) | machines/svettan/app.js | 37 739 | ✅ PASS |
| agent-a80df15d89dab0d4c (alskog-review) | app.js (root shim) | 1 908 | ✅ PASS |

### Vad som inte verifierats
- **Ljudkörning**: Playwright-chromium-tester visade ingen ljudmätning i denna omgång (ingen ljudmeter-kod i proxies).
- **Safari/iPhone**: Safari kan ha annan SW-cachebeteende än Chromium.
- **WASM-runtime**: kapten-engine.wasm (1.4 MB) lastas men har inte körts mot real DSP-rendering i denna batch.

## GitHub Pages deployment

| Workflow run | Status | URL |
| --- | --- | --- |
| `39056526386` (initial) | ✅ success | [link](https://github.com/Erkosan/Plugdataprojects-preview-20261017/actions/runs/39056526386) |
| Deployment | Live | https://erkosan.github.io/Plugdataprojects-preview-20261017 |

Arbeta gärna själv lokalt med previewen genom att serva roten med `python -m http.server`.
