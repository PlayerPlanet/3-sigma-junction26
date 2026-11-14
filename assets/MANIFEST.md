# Asset manifest

Code refers to **asset ids**, never file paths. The web app's asset registry maps each id to a file
listed here; when the file column is empty (or the file is missing) the registry uses the code-built
primitive for that id. Replacing a primitive with a `.glb` means adding the file and filling in the row,
with no change to scene code.

| id | kind | file | fallback primitive | notes |
|----|------|------|--------------------|-------|
| `lab.room` | model | | floor + inside-only walls | sized to `room` |
| `lab.table.stadium` | model | | extruded stadium top + pedestal | sized [length, height, width] |
| `lab.hood` | model | | cabinet, open front, glass sash, duct | sized [width, room height, depth] |
| `robot.carriage` | model | | rounded box | |
| `robot.mast` | model | | cylinder | |
| `robot.hand` | model | | box + two fingers | two per robot |
| `equip.reagent_shelf` | model | | shelves + boxes | |
| `equip.dispenser` | model | | box + nozzle | |
| `equip.flask` | model | | lathe (cone + neck) | liquid level as inner volume |
| `equip.beaker` | model | | open cylinder | liquid level as inner volume |
| `equip.hotplate_stirrer` | model | | flat box + plate | glows when heating |
| `equip.glassware_rack` | model | | low tray | holds flasks and beakers in slots |
| `equip.balance` | model | | box + pan | |
| `equip.filter_station` | model | | funnel on stand | |
| `equip.analyzer` | model | | box + screen | |
| `equip.waste_bin` | model | | cylinder | |

Conventions for models and primitives: origin at the base centre, +y up, front facing **-z**, metres.
With a `size`, a model is scaled uniformly to fit inside it.

Rails are not an asset: they are generated geometry following the rail graph polylines.

`apps/web/src/scene/assets/manifest.test.ts` checks that every id here has a primitive and that every
`assetId` in `content/equipment/` is listed here.
