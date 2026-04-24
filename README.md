# DJ Assist

A simple static site for filtering and sorting your youth-dance music library
by **tempo**, **genre**, **era**, and **dance-floor popularity**.

## What's included

- [build.py](build.py) — parses `raw data/MusicLibrary.xml` and all
  `raw data/DJ Set*.csv` exports into [web/tracks.json](web/tracks.json).
- [web/index.html](web/index.html) + [web/app.js](web/app.js) + [web/styles.css](web/styles.css) — the site.

## How popularity is computed

A web lookup per song isn't feasible for 670 tracks, and a generic
"Billboard-style" score wouldn't reflect what works at _youth dances_.
Instead, the build script mines your DJ set CSVs to count how many times
each track was actually played at past dances. That's the primary signal.

Final `popularity` (0–100) is a weighted blend:

- **65%** dance plays across your DJ set history
- **15%** loved flag in the library
- **10%** star rating
- **10%** overall iTunes play count

Tracks also get a `dance_plays` field you can sort on directly.

## Tempo / era parsing

- `tempo` comes from the BPM tag (`fast` ≥ 118, `mid` 95–117, `slow` < 95),
  and is forced to `slow` if the genre string contains "slow".
- `era` is extracted from genre markers like `Pop 80s`, `Slow 10s`, falling
  back to the track's year tag.
- `genre` is normalized — era suffixes and the `slow` qualifier are stripped
  so `Pop 80s` and `Slow 90s` both collapse under `Pop`, etc.

## Run

```bash
python3 build.py               # regenerate web/tracks.json
cd web && python3 -m http.server 8000
# open http://localhost:8000
```
