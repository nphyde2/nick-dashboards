#!/usr/bin/env python3
"""Refresh data/sports.json from ESPN's public site API.

The sports page requests the same endpoints in the browser. This file is the
committed fallback for when that fetch fails, and the artifact the scheduled
workflow commits twice a week.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "sports.json"
USER_AGENT = "nick-dashboards-sports/1.0 (public GitHub Pages snapshot)"
HOSTS = ("https://site.web.api.espn.com", "https://site.api.espn.com")
SEARCH = "https://site.web.api.espn.com/apis/search/v2"

TEAMS = [
    {
        "key": "lsu",
        "role": "hero",
        "sport": "football",
        "league": "college-football",
        "id": "99",
        "leagueLabel": "College football",
        "conference": "SEC",
        "alternate": "FDD023",
        "newsQuery": '"LSU"',
        "newsMust": ["LSU"],
        "newsReject": ["basketball", "march madness", "softball", "baseball", "dies at"],
        "newsLimit": 5,
    },
    {
        "key": "bears",
        "role": "chicago",
        "sport": "football",
        "league": "nfl",
        "id": "3",
        "leagueLabel": "NFL",
        "conference": "NFC",
        "alternate": "E64100",
        "newsQuery": '"Chicago Bears"',
        "newsMust": ["Bears"],
        "newsReject": ["golden bears", "baylor"],
        "newsLimit": 3,
    },
    {
        "key": "bulls",
        "role": "chicago",
        "sport": "basketball",
        "league": "nba",
        "id": "4",
        "leagueLabel": "NBA",
        "conference": "Eastern Conference",
        "alternate": "000000",
        "newsQuery": '"Chicago Bulls"',
        "newsMust": ["Bulls"],
        "newsReject": ["bulls eye", "running of"],
        "newsLimit": 3,
    },
    {
        "key": "blackhawks",
        "role": "chicago",
        "sport": "hockey",
        "league": "nhl",
        "id": "4",
        "leagueLabel": "NHL",
        "conference": "Western Conference",
        "alternate": "000000",
        "newsQuery": '"Chicago Blackhawks"',
        "newsMust": ["Blackhawks"],
        "newsReject": [],
        "newsLimit": 3,
    },
    {
        "key": "cubs",
        "role": "chicago",
        "sport": "baseball",
        "league": "mlb",
        "id": "16",
        "leagueLabel": "MLB",
        "conference": "NL Central",
        "alternate": "CC3433",
        "newsQuery": '"Chicago Cubs"',
        "newsMust": ["Cubs"],
        "newsReject": [],
        "newsLimit": 3,
    },
    {
        "key": "whitesox",
        "role": "chicago",
        "sport": "baseball",
        "league": "mlb",
        "id": "4",
        "leagueLabel": "MLB",
        "conference": "AL Central",
        "alternate": "C4CED4",
        "newsQuery": '"Chicago White Sox"',
        "newsMust": ["White Sox"],
        "newsReject": [],
        "newsLimit": 3,
    },
    {
        "key": "tamu",
        "role": "minimal",
        "sport": "football",
        "league": "college-football",
        "id": "245",
        "leagueLabel": "College football",
        "conference": "SEC",
        "alternate": "FFFFFF",
        "newsQuery": '"Texas A&M"',
        "newsMust": ["Texas A&M", "Aggies"],
        "newsReject": ["basketball", "baseball", "softball"],
        "newsLimit": 2,
    },
    {
        "key": "wisconsin",
        "role": "minimal",
        "sport": "football",
        "league": "college-football",
        "id": "275",
        "leagueLabel": "College football",
        "conference": "Big Ten",
        "alternate": "FFFFFF",
        "newsQuery": '"Wisconsin Badgers"',
        "newsMust": ["Wisconsin", "Badgers"],
        "newsReject": ["basketball", "hockey", "baseball"],
        "newsLimit": 2,
    },
]


def get_json(url: str, attempts: int = 3) -> dict:
    last_error: Exception | None = None
    for attempt in range(attempts):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}") from last_error


def hex_color(value: str | None, fallback: str) -> str:
    if not value:
        return fallback
    text = value.strip()
    if not text.startswith("#"):
        text = "#" + text
    return text.upper()


def logo_of(team: dict) -> str | None:
    logos = team.get("logos") or []
    for logo in logos:
        rel = logo.get("rel") or []
        if "default" in rel and "dark" not in rel and logo.get("href"):
            return logo["href"]
    if logos and logos[0].get("href"):
        return logos[0]["href"]
    return team.get("logo")


def get_path(path: str) -> dict:
    last_error: Exception | None = None
    for host in HOSTS:
        try:
            return get_json(host + path)
        except Exception as error:  # noqa: BLE001 — try the other ESPN host
            last_error = error
    raise RuntimeError(path) from last_error


def team_page(team: dict) -> str | None:
    clubhouse = team.get("clubhouse")
    if isinstance(clubhouse, str):
        return clubhouse.replace("http://", "https://")
    for link in team.get("links") or []:
        rel = link.get("rel") or []
        if "clubhouse" in rel or link.get("text") in {"Clubhouse", "Team"}:
            href = link.get("href")
            if isinstance(href, str):
                return href.replace("http://", "https://")
    return None


def record_summary(team: dict) -> str | None:
    for item in (team.get("record") or {}).get("items") or []:
        if item.get("type") == "total" and item.get("summary"):
            return item["summary"]
    return None


def score_text(score) -> str | None:
    if score is None:
        return None
    if isinstance(score, dict):
        if score.get("displayValue") not in (None, ""):
            return str(score["displayValue"])
        if "value" in score:
            value = score["value"]
            if isinstance(value, float) and value.is_integer():
                return str(int(value))
            return str(value)
        return None
    return str(score)


def broadcast_name(competition: dict) -> str | None:
    names: list[str] = []
    for item in competition.get("broadcasts") or []:
        media = item.get("media") or {}
        short = media.get("shortName")
        if short and short not in names:
            names.append(short)
        for name in item.get("names") or []:
            if name and name not in names:
                names.append(name)
    if not names:
        return None
    return ", ".join(names[:3])


def rank_of(competitor: dict) -> int | None:
    current = (competitor.get("curatedRank") or {}).get("current")
    if isinstance(current, int) and 1 <= current <= 25:
        return current
    return None


def parse_games(schedule: dict, team_id: str) -> list[dict]:
    games = []
    for event in schedule.get("events") or []:
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        competition = competitions[0]
        competitors = competition.get("competitors") or []
        ours = next((c for c in competitors if str((c.get("team") or {}).get("id")) == str(team_id)), None)
        opp = next((c for c in competitors if str((c.get("team") or {}).get("id")) != str(team_id)), None)
        if not ours or not opp:
            continue
        status = (competition.get("status") or {}).get("type") or {}
        short_detail = status.get("shortDetail") or ""
        detail_text = f"{short_detail} {status.get('detail') or ''}".lower()
        if "postpon" in detail_text or "cancel" in detail_text:
            continue
        time_tbd = competition.get("timeValid") is False or "TBD" in short_detail.upper()
        completed = bool(status.get("completed"))
        our_score = score_text(ours.get("score"))
        opp_score = score_text(opp.get("score"))
        result = None
        if completed:
            if ours.get("winner") is True:
                result = "W"
            elif opp.get("winner") is True:
                result = "L"
            elif our_score is not None and our_score == opp_score:
                result = "T"
        opponent = opp.get("team") or {}
        venue = competition.get("venue") or {}
        address = venue.get("address") or {}
        city_bits = [address.get("city"), address.get("state")]
        city = ", ".join(bit for bit in city_bits if bit)
        games.append(
            {
                "id": str(event.get("id") or competition.get("id") or ""),
                "date": event.get("date"),
                "name": event.get("name"),
                "shortName": event.get("shortName"),
                "opponent": opponent.get("displayName") or opponent.get("name"),
                "opponentShort": opponent.get("shortDisplayName") or opponent.get("location") or opponent.get("name"),
                "opponentAbbrev": opponent.get("abbreviation"),
                "opponentLogo": logo_of(opponent),
                "opponentRank": rank_of(opp),
                "homeAway": ours.get("homeAway"),
                "neutral": bool(competition.get("neutralSite")),
                "venue": venue.get("fullName"),
                "city": city or None,
                "broadcast": broadcast_name(competition),
                "status": status.get("state") or ("post" if completed else "pre"),
                "completed": completed,
                "detail": status.get("shortDetail") or status.get("detail"),
                "timeTbd": time_tbd,
                "scoreFor": our_score,
                "scoreAgainst": opp_score,
                "result": result,
            }
        )
    games.sort(key=lambda game: game.get("date") or "")
    return games


def trim_games(games: list[dict], role: str) -> list[dict]:
    if role == "hero":
        return games
    completed = [game for game in games if game["completed"]]
    upcoming = [game for game in games if not game["completed"]]
    return completed[-8:] + upcoming[:4]


def poll_rank(rankings: dict, label: str, team_id: str) -> int | None:
    needle = label.lower()
    for poll in rankings.get("rankings") or []:
        name = (poll.get("name") or "") + " " + (poll.get("shortName") or "")
        if needle not in name.lower():
            continue
        for row in poll.get("ranks") or []:
            team = row.get("team") or {}
            if str(team.get("id")) == str(team_id):
                current = row.get("current")
                if isinstance(current, int):
                    return current
    return None


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def normalize_news_item(title: str, url: str | None, published: str | None) -> dict | None:
    if not title or not url:
        return None
    href = url.replace("http://", "https://")
    return {"title": title, "url": href, "published": published}


def headline_ok(title: str, must: list[str], reject: list[str]) -> bool:
    low = title.lower()
    if must and not any(term.lower() in low for term in must):
        return False
    if any(term.lower() in low for term in reject):
        return False
    return True


def fetch_search_news(team: dict) -> list[dict]:
    query = urllib.parse.quote(team["newsQuery"])
    payload = get_json(f"{SEARCH}?query={query}&limit=10&type=article")
    contents = []
    for group in payload.get("results") or []:
        contents.extend(group.get("contents") or [])
    items = []
    for content in contents:
        title = content.get("displayName") or ""
        if not headline_ok(title, team["newsMust"], team["newsReject"]):
            continue
        link = content.get("link") or {}
        item = normalize_news_item(title, link.get("web"), content.get("date"))
        if item:
            items.append(item)
    return items


def fetch_league_news(team: dict) -> list[dict]:
    payload = get_path(f"/apis/site/v2/sports/{team['sport']}/{team['league']}/news?limit=50")
    names = team["newsMust"]
    scored = []
    for article in payload.get("articles") or []:
        title = article.get("headline") or ""
        if not headline_ok(title, names, team["newsReject"]):
            # League feed can mention the club only in the dek. Keep those
            # when the headline itself is a roundup that names the club.
            description = article.get("description") or ""
            blob = f"{title} {description}"
            if not headline_ok(blob, names, team["newsReject"]):
                continue
            if not any(term.lower() in title.lower() for term in names):
                continue
        web = (article.get("links") or {}).get("web") or {}
        href = web.get("href") if isinstance(web, dict) else None
        item = normalize_news_item(title, href, article.get("published"))
        if item:
            scored.append(item)
    return scored


def select_news(team: dict) -> list[dict]:
    merged: list[dict] = []
    seen: set[str] = set()
    # Search and the league feed overlap. Merge both so a recap that the
    # search index has not caught yet can still lead the list.
    try:
        merged.extend(fetch_search_news(team))
    except Exception as error:  # noqa: BLE001 — news is optional next to scores
        print(f"news search failed for {team['key']}: {error}", file=sys.stderr)
    try:
        merged.extend(fetch_league_news(team))
    except Exception as error:  # noqa: BLE001
        print(f"league news failed for {team['key']}: {error}", file=sys.stderr)
    now = datetime.now(timezone.utc)
    fresh_windows = (timedelta(days=21), timedelta(days=45), timedelta(days=120))
    chosen: list[dict] = []
    for window in fresh_windows:
        chosen = []
        seen.clear()
        cutoff = now - window
        for item in sorted(merged, key=lambda row: row.get("published") or "", reverse=True):
            published = parse_time(item.get("published"))
            if published and published < cutoff:
                continue
            if item["url"] in seen:
                continue
            seen.add(item["url"])
            chosen.append(item)
        if len(chosen) >= min(2, team["newsLimit"]):
            break
    return chosen[: team["newsLimit"]]


def counted_record(games: list[dict]) -> str:
    wins = sum(1 for game in games if game["completed"] and game["result"] == "W")
    losses = sum(1 for game in games if game["completed"] and game["result"] == "L")
    ties = sum(1 for game in games if game["completed"] and game["result"] == "T")
    if ties:
        return f"{wins}-{losses}-{ties}"
    return f"{wins}-{losses}"


def load_schedule(config: dict, season_type: int | None = None) -> dict:
    suffix = f"?seasontype={season_type}" if season_type else ""
    path = f"/apis/site/v2/sports/{config['sport']}/{config['league']}/teams/{config['id']}/schedule{suffix}"
    return get_path(path)


def build_team(config: dict, rankings: dict | None) -> dict:
    if config["league"] == "mlb":
        try:
            schedule_payload = load_schedule(config, 3)
        except Exception:  # noqa: BLE001
            schedule_payload = {"events": []}
        regular_payload = load_schedule(config, 2)
        if not schedule_payload.get("team"):
            schedule_payload["team"] = regular_payload.get("team") or {}
        regular_games = parse_games(regular_payload, config["id"])
    else:
        schedule_payload = load_schedule(config)
        regular_games = None
    team = schedule_payload.get("team") or {}
    season_games = parse_games(schedule_payload, config["id"])
    base_games = regular_games if config["league"] == "mlb" and regular_games is not None else season_games
    upcoming_pool = season_games
    if config["league"] == "mlb" and regular_games is not None:
        upcoming_pool = sorted(regular_games + season_games, key=lambda game: game.get("date") or "")
    if config["league"] == "mlb" and not any(not game["completed"] for game in upcoming_pool) and season_games:
        display_source = season_games
    elif any(not game["completed"] for game in upcoming_pool):
        display_source = upcoming_pool
    else:
        display_source = base_games
    games = trim_games(display_source, config["role"])
    upcoming = [game for game in upcoming_pool if not game["completed"]]
    phase = "in-season" if upcoming else "offseason"
    rank = None
    if config["league"] == "college-football" and rankings:
        rank = {
            "ap": poll_rank(rankings, "AP Top 25", config["id"]),
            "coaches": poll_rank(rankings, "Coaches", config["id"]),
        }
    if config["league"] == "mlb" and regular_games is not None:
        record = counted_record(regular_games)
        record_label = "Regular season"
    else:
        record = team.get("recordSummary") or counted_record(season_games)
        record_label = "Record"
    season_note = "Offseason. The latest schedule on ESPN has no game left." if phase == "offseason" else None
    return {
        "key": config["key"],
        "role": config["role"],
        "name": team.get("displayName") or team.get("name"),
        "shortName": team.get("shortDisplayName") or team.get("name") or team.get("abbreviation"),
        "abbreviation": team.get("abbreviation"),
        "sport": config["sport"],
        "league": config["league"],
        "leagueLabel": config["leagueLabel"],
        "conference": config["conference"],
        "espnId": str(config["id"]),
        "color": hex_color(team.get("color"), "#222222"),
        "alternateColor": hex_color(team.get("alternateColor") or config.get("alternate"), "#F5F5F5"),
        "logo": logo_of(team),
        "teamUrl": team_page(team),
        "record": record,
        "recordLabel": record_label,
        "standing": team.get("standingSummary"),
        "rank": rank,
        "phase": phase,
        "seasonNote": season_note,
        "nextGame": upcoming[0] if upcoming else None,
        "schedule": games,
        "news": select_news(config),
    }


def main() -> int:
    rankings = None
    try:
        rankings = get_path("/apis/site/v2/sports/football/college-football/rankings")
    except Exception as error:  # noqa: BLE001
        print(f"rankings unavailable: {error}", file=sys.stderr)
    teams = [build_team(config, rankings) for config in TEAMS]
    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "timezone": "America/Chicago",
        "source": "ESPN public site API",
        "teams": teams,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    for team in teams:
        nxt = team["nextGame"]
        nxt_label = f"{nxt['opponentShort']} {nxt['date']}" if nxt else "none"
        print(f"  {team['key']}: {team['record']} {team['phase']} next={nxt_label} news={len(team['news'])}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        print(f"update_sports failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
