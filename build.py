#!/usr/bin/env python3
"""Parse the iTunes MusicLibrary.xml and DJ Set CSVs into a single tracks.json
that powers the static filtering website.

Dance popularity is derived from how often each track actually appeared in
past DJ set CSV exports — a much better signal for youth-dance use than a
generic web popularity lookup.
"""
from __future__ import annotations

import csv
import json
import plistlib
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent
RAW = ROOT / "raw data"
XML = RAW / "MusicLibrary.xml"
OUT = ROOT / "tracks.json"


# ---------- normalization helpers ----------

_PAREN_RE = re.compile(r"\s*[\(\[][^)\]]*[\)\]]")
_FEAT_RE = re.compile(r"\s*(feat\.?|featuring|ft\.?|with)\s+.*", re.I)
_NONWORD_RE = re.compile(r"[^a-z0-9]+")


def norm(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower()
    s = _PAREN_RE.sub("", s)
    s = _FEAT_RE.sub("", s)
    s = _NONWORD_RE.sub("", s)
    return s


def pair_key(title: str, artist: str) -> str:
    return f"{norm(title)}|{norm(artist)}"


# ---------- DJ set CSV play counts ----------

def count_dance_plays() -> Counter[str]:
    plays: Counter[str] = Counter()
    for csv_path in sorted(RAW.glob("DJ Set*.csv")):
        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                title = (row.get("Title") or "").strip()
                artist = (row.get("Artist") or "").strip()
                if not title:
                    continue
                plays[pair_key(title, artist)] += 1
                # also index by title only as a fallback bucket
                plays[f"{norm(title)}|"] += 0  # ensure key exists (no-op)
    return plays


# ---------- genre / era / tempo parsing ----------

DECADE_RE = re.compile(r"\b(\d{2})s\b", re.I)


def parse_era(genre: str, year: int | None) -> str | None:
    if genre:
        m = DECADE_RE.search(genre)
        if m:
            d = int(m.group(1))
            # 50s..90s -> 19xx, 00s..40s -> 20xx
            full = 1900 + d if d >= 50 else 2000 + d
            return f"{full}s"
    if year:
        return f"{(year // 10) * 10}s"
    return None


def base_genre(genre: str) -> str:
    if not genre:
        return "Unknown"
    g = genre.strip()
    # drop decade markers and "slow" qualifier
    g = DECADE_RE.sub("", g)
    g = re.sub(r"\bslow\b", "", g, flags=re.I)
    g = re.sub(r"\s{2,}", " ", g).strip(" /")
    # canonicalize a few common variants
    synonyms = {
        "hip hop/rap": "Hip-Hop/Rap",
        "hip-hop": "Hip-Hop/Rap",
        "hip-hop/rap": "Hip-Hop/Rap",
        "r&b/soul": "R&B/Soul",
        "funk/disco/soul": "Funk/Disco/Soul",
        "linedance": "Line Dance",
        "line dance": "Line Dance",
        "oldies/mashup": "Oldies",
        "oldies": "Oldies",
        "rock/alternative": "Rock/Alternative",
        "rock/pop": "Rock/Pop",
        "pop latino": "Latin",
        "urbano latino": "Latin",
        "musica tropical": "Latin",
        "latin": "Latin",
        "pop": "Pop",
        "rock": "Rock",
        "country": "Country",
        "dance": "Dance",
        "jazz": "Jazz",
        "disney": "Disney",
        "halloween": "Halloween",
        "k-pop": "K-Pop",
        "alternative": "Alternative",
        "indie pop": "Indie Pop",
        "instrumental": "Instrumental",
        "swing": "Swing",
        "polka": "Polka",
        "soundtrack": "Soundtrack",
        "movies/tv/sounds": "Soundtrack",
        "sounds/games": "Soundtrack",
    }
    key = g.lower().strip()
    if key in synonyms:
        return synonyms[key]
    # strip stray trailing punctuation
    return g if g else "Unknown"


def is_slow_genre(genre: str) -> bool:
    return bool(genre) and bool(re.search(r"\bslow\b", genre, re.I))


def classify_tempo(bpm: float | None, genre: str) -> str:
    """Return fast | slow | mid | unknown."""
    if is_slow_genre(genre):
        return "slow"
    if bpm is None or bpm <= 0:
        return "unknown"
    if bpm < 95:
        return "slow"
    if bpm >= 118:
        return "fast"
    return "mid"


# ---------- main build ----------

def main() -> None:
    print(f"Parsing {XML} ...")
    with XML.open("rb") as f:
        plist = plistlib.load(f)

    raw_tracks: dict = plist.get("Tracks", {})
    plays = count_dance_plays()
    print(f"  {len(raw_tracks)} tracks in library")
    print(f"  {sum(plays.values())} plays across DJ set CSVs")

    tracks: list[dict] = []
    for _tid, t in raw_tracks.items():
        name = (t.get("Name") or "").strip()
        artist = (t.get("Artist") or t.get("Album Artist") or "").strip()
        if not name:
            continue
        kind = t.get("Kind") or ""
        # skip non-music items
        if "audio" not in kind.lower() and "video" not in kind.lower() and kind:
            continue

        genre_raw = (t.get("Genre") or "").strip()
        year = t.get("Year")
        bpm = t.get("BPM")
        rating = t.get("Rating") or 0  # 0..100
        loved = bool(t.get("Loved"))
        play_count = t.get("Play Count") or 0
        total_time_ms = t.get("Total Time") or 0

        key = pair_key(name, artist)
        dance_plays = plays.get(key, 0)
        if dance_plays == 0:
            # fallback: title-only match (handles missing artist in CSV)
            dance_plays = plays.get(f"{norm(name)}|", 0)

        tracks.append(
            {
                "name": name,
                "artist": artist,
                "album": (t.get("Album") or "").strip(),
                "genre_raw": genre_raw,
                "genre": base_genre(genre_raw),
                "era": parse_era(genre_raw, year),
                "year": year,
                "bpm": round(bpm, 1) if isinstance(bpm, (int, float)) and bpm else None,
                "tempo": classify_tempo(bpm, genre_raw),
                "rating": rating,
                "loved": loved,
                "play_count": play_count,
                "dance_plays": dance_plays,
                "duration_sec": round(total_time_ms / 1000) if total_time_ms else None,
            }
        )

    # ---------- popularity score ----------
    # Primary signal: dance_plays (actual historical use at dances).
    # Secondary: loved, rating, play_count. Normalized to 0..100.
    max_dance = max((t["dance_plays"] for t in tracks), default=0) or 1
    max_plays = max((t["play_count"] for t in tracks), default=0) or 1

    for t in tracks:
        dance_norm = (t["dance_plays"] / max_dance) * 100 if max_dance else 0
        rating_norm = t["rating"]  # already 0..100
        plays_norm = (t["play_count"] / max_plays) * 100 if max_plays else 0
        loved_norm = 100 if t["loved"] else 0
        # weighted blend
        score = (
            0.65 * dance_norm
            + 0.15 * loved_norm
            + 0.10 * rating_norm
            + 0.10 * plays_norm
        )
        t["popularity"] = round(score, 1)

    # sort by popularity desc for convenience
    tracks.sort(key=lambda x: (-x["popularity"], x["name"].lower()))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": plist.get("Date").isoformat() if plist.get("Date") else None,
                "track_count": len(tracks),
                "tracks": tracks,
            },
            f,
            ensure_ascii=False,
            indent=0,
        )
    print(f"Wrote {OUT} ({len(tracks)} tracks)")

    # brief summary
    by_tempo = Counter(t["tempo"] for t in tracks)
    by_genre = Counter(t["genre"] for t in tracks)
    by_era = Counter(t["era"] for t in tracks)
    print("  tempo:", dict(by_tempo))
    print("  top genres:", by_genre.most_common(8))
    print("  eras:", dict(sorted(by_era.items(), key=lambda x: (x[0] or ""))))
    print(f"  tracks with dance_plays > 0: {sum(1 for t in tracks if t['dance_plays'])}")


if __name__ == "__main__":
    main()
