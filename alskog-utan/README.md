# ÄLSKOG 3000

Den tredje maskinen: mixern och dirigenten som får två maskiner ur serien att älska ihop. Älskog har ingen egen ljudmotor. Den har en **rytmplats** och en **synthplats**, laddar maskinerna där **oförändrade** i ramar, tar in deras ljud i en egen AudioWorklet, mixar, lägger på effekter och styr deras transport, tempo, tonart och banker. Låten är ett samlag i akter. Originalparet är RUNKINATOR och VULVA.

Se också [docs/serien/MASKINER.md](../docs/serien/MASKINER.md) och [docs/serien/ARKITEKTUR.md](../docs/serien/ARKITEKTUR.md).

## Filer

| Fil | Vad |
| --- | --- |
| `index.html`, `style.css` | Sovrummet och panelen: kanalplattor, masterrattar, display, scen- och brevrader. |
| `app.js` | Allt beteende: tillstånd och sparande, ljudvärden (`startEngines`), dirigentklockan, samlagskurvan, Porrfilm (manus, scener, tagningar), ställningar och Smek, gester (tryck, håll = kopiera, dubbeltryck = radera), kugghjulsmenyn. Exponerar `window.alskog`. |
| `worklet.js` | Mixern: tar emot maskinernas utgångar (RUNKINATOR 11 kanaler i webbygget, VULVA stereo), kanalnivåer, Puls, master-FX (TÄCKE filter, SVETT drive, SOVRUM rum, STRYP drive in i limitern, ANDNING, Hångel, Vibrator, Eko, Sängen) och punch-in-effekter (HACKA, BROMSA, BAKLÄNGES, FRYS …). Allokeringsfri DSP för Safari. |
| `maskiner.json` | Registret: vilka maskiner som får ligga på rytm- respektive synthplatsen, en rad per maskin. |
| `shim.js` | Sätts in först i varje maskinsida av byggskriptet så att maskinen använder Älskogs AudioContext (och att relativa worklet-adresser löses mot maskinens egen sida). |
| `sw.js`, `manifest.webmanifest`, ikoner | PWA. |

## Platserna och bytet

- Valet ligger under kugghjulet: en rad **Rytm** och en rad **Synth**, en knapp per maskin i maskinens kanalfärg. Paret och tonarten sparas i sessionen.
- Bara två maskiner är laddade åt gången. Vid byte stoppas den gamla, Älskogs worklet släpper dess processor (Älskogs modul lindar `registerProcessor`, så en släppt processor returnerar `false` och kan städas bort med motor, wasm-minne och samples), noden och porten kopplas loss, platsen får en ny tom buss och ramen tas bort. Först därefter laddas den nya. Spelar Älskog startar den nya maskinen direkt och båda går till takt 1 (som FÖRSONING).
- Kvar i ljudtråden blir bara maskinens modulkod (en AudioContext kan inte glömma en modul); kommer maskinen tillbaka återanvänds den.
- **Tempo och tonart:** Älskog sätter tempot för båda (`bpm`, VULVA `seq_bpm`). TONART (rutan bredvid ⟲) sätter VULVAs `seq_base` (närmaste oktav), TURBOTUTTE och SVETTAN `tune` (−6 … +5 halvtoner, C = 0) och alla nyare maskiner som har `tune`. RUNKINATOR har ingen tonartsparameter; dess kick följer med via Hångel TONART. Inga nya parametrar har lagts i motorerna. Innan TONART rörs visar rutan synthens egen grundton och Älskog ändrar ingenting; vid ett byte låses den tonart som spelades, så att den nya maskinen hamnar i den.
- **Kanalerna** byter namn och färg efter maskinen. En rytmmaskin med stereoutgång (`"ljud": "stereo"`, allt utom RUNKINATOR) hamnar på första kanalen; de fyra andra vilar.

### Bara med originalparet (RUNKINATOR + VULVA)

Hångel DUETT, Spökstöt (Spökkick), banker A–H i Älskog-listen, Porrfilmens roller (RUNK- och VULVA-bank per scen) och kick/snare/hat/sample/RUNK FX som egna kanaler. Hångel TONART kräver RUNKINATOR men följer vilken synth som helst. Med andra par tystnar de eller förenklas: Stöt juckar på hela trummaskinen, Smisk och Spökstöt gör ingenting, scenerna byter bara ställning. Mixer, Puls, master-FX, punch-in, Kamasutra, ställningar, Sängen, samlagskurvan och IDKA SAMLAG fungerar med alla par.

### Lägga till en maskin (till exempel PERKELE 3000)

1. Maskinen byggs efter [NY-MASKIN.md](../docs/serien/NY-MASKIN.md) och har standardkroken `window.<id>` med `ensureAudio()`, `update('start' | 'bpm' | 'tune', v)` och `values` (som TURBOTUTTE och SVETTAN). Sidan ska fungera i en ram och känna av `window.parent.alskog`.
2. Lägg **en rad** i `maskiner.json` på rätt plats, till exempel:

   ```json
   {"id": "perkele", "namn": "PERKELE", "kort": "PERKELE", "dist": "synths/Perkele/web/dist", "live": "perkele", "ljud": "stereo", "midi": "1, 9", "farg": "#…", "dim": "#…"}
   ```

   `id` är både mappen under `machines/` och namnet på värdkroken och ändras aldrig. Visningsnamnet kommer bara från `namn` (Älskog lägger till ” 3000”) och `kort` (pilarna och listen); byter en maskin namn, som TURBOTUTTE → TURBOTUTTI eller SVETTAN → SVETTILAINEN, ändras bara de två fälten. `farg`/`dim` är maskinens kanalfärg ur `design-system/tokens.json` (lägg till en `ch-*`-token om den saknas). `midi` är bara texten i displayen när MIDI ansluts.
3. Kör `python3 tools/build_alskog.py`. En maskin vars `dist` inte är byggd hoppar byggskriptet över, så raden kan läggas in i förväg.

Ingen annan kod behövs. Har maskinen något eget som Älskog borde göra (som VULVAs exempelsekvens eller SVETTANs exempel), läggs det i `ADAPT` i `app.js`.

## Bygga

```sh
python3 tools/build.py --prepare-only --web     # RUNKINATOR webb (med Älskog-utgångarna)
python3 tools/build_vulva_web.py                # VULVA webb (eller använd färdiga synths/Vulva/web/dist)
python3 tools/build_alskog.py                   # → alskog/dist/ (ignoreras av git)
python3 tools/build_alskog.py --utan-porrfilm   # varianten utan Porrfilm (som runken.nu/alskog-utan, katalogens länk)
python3 -m http.server --directory alskog/dist
```

`build_alskog.py` kopierar varje byggd maskin i registret (`web/dist`, `synths/<Maskin>/web/dist`) till `dist/machines/<id>/`, sätter in `shim.js`, pekar maskinernas nedladdningslänkar till deras egna live-adresser och skriver de tillgängliga maskinerna till `dist/maskiner.json`. Bygg maskinernas webb först.

## Funktioner i korthet

- **Kanaler:** KICK, SNARE, HAT, SAMPLE, RUNK FX och synthen (VULVA, TURBOTUTTE, SVETTAN), var och en i sin färg, med nivå, mute och solo.
- **Puls:** kanalerna pumpar mot en vald källa (djup, släpp). **Spökkick** går via en direkt länk mellan RUNKINATORs och Älskogs worklets.
- **Samlagskurvan:** Förspel → Vuxenmys → KNULLKNULLKNULL → andetag → Klimax (riser, trumvirvel, drop, 8 takters efterglöd) → Cigg på sängkanten (breakdown) → Runda två. **IDKA SAMLAG** kör hela kurvan automatiskt.
- **Ställningar:** fyra hörnscener som blandas med Smek; **Kamasutra** följer ställningen; **TROGEN/FRI** avgör om ställningarna följer manuset.
- **Porrfilm:** en filmremsa med scener (RUNK-bank + VULVA-bank + ställning), roller, manus med scenlängd och tagning. Hette Kärleksbrev före v2.

## Varianter

Fyra versioner är live samtidigt (`alskog-utan`, `alskog-porrfilm1`, `alskog-porrfilm2`, `alskog-test`); de tre första har var sin lagringsnyckel så att sparade sessioner inte krockar. Vilken commit var och en motsvarar står i [arkiv/README.md](../arkiv/README.md). Katalogen länkar till `alskog-utan`. `--utan-porrfilm` bygger den här koden som den varianten: samma lagringsnyckel (`alskog-session-v1-utan`), egen cache (`alskog-utan-…`) och Porrfilm dold (koden finns kvar).

## Tester

`tests/run_alskog_web.py`, `tests/run_alskog_features.py` och `tests/run_alskog_swap.py` (headless Chromium). Bytestestet byter synth till TURBOTUTTE, SVETTAN och tillbaka till VULVA och en stereotrumma in på rytmplatsen, mäter ljud från båda platserna, att tempo och tonart följer med, och att den gamla maskinen släpps (två ramar och tre AudioWorklet-noder efter tvingad skräpsamling, räknat med Chromiums WebAudio-händelser).

## Inte gjort än

PERKELE 3000 (rytmplatsen) väntar på sitt webbygge; se ovan. Minnet i Safari på iPhone är inte mätt.
