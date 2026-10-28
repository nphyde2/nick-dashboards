# Dashboards

Static site meant for GitHub Pages from the `main` branch root.

- [Sports](sports.html) — LSU football (record, rank, schedule, next-game countdown, headlines), the Chicago Bears, Bulls, Blackhawks, Cubs, and White Sox, plus short cards for Texas A&M and Wisconsin.
- [Chicago weekends](chicago.html) — neighborhood events from Halloween weekend through Thanksgiving 2026, with filters and an OpenStreetMap view.

There is no build step. Open `index.html` or serve the folder as static files.

## Sports data

The sports page asks ESPN’s public site API in the browser: schedule, rankings, and news on `site.web.api.espn.com`, with `site.api.espn.com` as the fallback host. The team-profile URL does not send browser CORS headers, so the record, colors, and logo are read from the schedule payload instead. Times render in `America/Chicago`. If the live request fails, the page reads [`data/sports.json`](data/sports.json).

Refresh the snapshot locally:

```bash
python3 scripts/update_sports.py
```

The script only uses the Python standard library. [`.github/workflows/refresh-sports.yml`](.github/workflows/refresh-sports.yml) runs it Tuesday and Friday at 13:15 UTC and commits `data/sports.json` when the file changes.

## Chicago events

[`chicago.html`](chicago.html) loads [`data/chicago.json`](data/chicago.json). Add or remove events by editing that file. Do not add an event you cannot point at with a public URL.

Top-level fields:

| Field | Meaning |
| --- | --- |
| `updated` | `YYYY-MM-DD` when the file was checked |
| `coverage` | Short description of the date span |
| `weekends` | Filter chips. Each has `id`, `label`, `start`, `end` |
| `events` | The listings |

Each event:

| Field | Meaning |
| --- | --- |
| `id` | Stable slug |
| `name` | What the public listing calls it |
| `neighborhood` | Grouping label used by the list, the map index, and the neighborhood filter |
| `categories` | One or more of `festival`, `parade`, `music`, `comedy`, `theater`, `film`, `holiday`, `market`, `family`, `community`, `transit`, `tour` |
| `start`, `end` | `YYYY-MM-DD`. A one-day event uses the same date twice |
| `time` | Local time in words. Say so if the source did not publish a clock time |
| `venue`, `address` | Place name and street address when one was published |
| `lat`, `lng` | Map pin. Use a real venue coordinate, a point on a published route, or a neighborhood center |
| `summary` | A short original description. Do not paste a source article |
| `admission` | Free, ticketed, or the price the source actually printed |
| `crowd` | `true` for parades, street closures, and other heavy downtown dates |
| `transitNote` | Only facts the source stated (route, closure time). Leave `""` otherwise |
| `locationPrecision` | `venue`, `route`, `corridor`, or `neighborhood` |
| `sources` | Array of `{ "name", "url" }` public pages |

`neighborhood` precision means the city named a community and did not publish a street address. The page says that on the card. After editing, reload `chicago.html`. Nothing else has to be rebuilt.

Example:

```json
{
  "id": "example-fest",
  "name": "Example Fest",
  "neighborhood": "Pilsen",
  "categories": ["festival"],
  "start": "2026-11-07",
  "end": "2026-11-08",
  "time": "Saturday 11:00 a.m.–8:00 p.m.",
  "venue": "Example Hall",
  "address": "1807 S Allport St, Chicago, IL",
  "lat": 41.8577,
  "lng": -87.6575,
  "summary": "One sentence from the public listing, written in your own words.",
  "admission": "Free",
  "crowd": false,
  "transitNote": "",
  "locationPrecision": "venue",
  "sources": [{ "name": "Choose Chicago", "url": "https://www.choosechicago.com/" }]
}
```

## GitHub Pages

[`.nojekyll`](.nojekyll) is there so a branch-based Pages source would not run Jekyll. [`.github/workflows/enable-pages.yml`](.github/workflows/enable-pages.yml) publishes the `main` branch root with the official Pages deploy actions on every push to `main`. The scheduled sports refresh deploys again when `data/sports.json` changes, because a bot push does not start that workflow on its own.

The published root is `https://nphyde2.github.io/nick-dashboards/`.
