# 3000-serien — isolerad testpreview

Detta är en fristående GitHub Pages-publicering för test, skapad utan att ändra Claude-agenternas worktrees eller live-rutter på runken.nu.

Innehåll och bevisad källa:

- TURBOTUTTI 3000 och SVETTILAINEN 3000: `saunasarja/finska-namn` vid `dd34b43083e0a51945198d278245c948d527acda`.
- PERKELE 3000: `perkele-3000` vid `7d35f5b8daf6cff2b6f278aa7e2ca606c620e199`.
- ÄLSKOG 3000: `alskog/utbytbar` vid `568cf0d6e232dd470c0e4e34a47729e802b8a5a2`.
- Katalogen, RUNKINATOR och VULVA kommer från den committade `saunasarja/finska-namn`-snapshoten ovan.

Detta är inte en merge och inte en ny kanonisk bygggren. Det är en statisk, isolerad sammanställning av färdiga `dist/`-artefakter och den exakta källcommitten ska alltid anges när testresultat rapporteras.

Verifierat före publicering:

- `site/katalog.json` validerade utan fel.
- Katalogens nio Python-tester passerade.
- `node --check` passerade för `app.js`, `worklet.js` och `sw.js` för TURBOTUTTE, SVETTAN och PERKELE.
- Motortestsviten gick inte att köra i servermiljön eftersom valfri Heavy-testdependency saknas; den rapporterade därför 0 körda tester och 1 skip per maskin.
- Playwright-venv saknades, så ingen browser-interaktions- eller ljudmätning är påstådd.
