/* Live normalizer for ESPN's public site API.
   Field names match the snapshot written by scripts/update_sports.py. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EspnBoard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const HOSTS = ["https://site.web.api.espn.com", "https://site.api.espn.com"];
  const SEARCH = "https://site.web.api.espn.com/apis/search/v2";

  const TEAMS = [
    { key: "lsu", role: "hero", sport: "football", league: "college-football", id: "99", leagueLabel: "College football", conference: "SEC", alternate: "FDD023", newsQuery: '"LSU"', newsMust: ["LSU"], newsReject: ["basketball", "march madness", "softball", "baseball", "dies at"], newsLimit: 5 },
    { key: "bears", role: "chicago", sport: "football", league: "nfl", id: "3", leagueLabel: "NFL", conference: "NFC", alternate: "E64100", newsQuery: '"Chicago Bears"', newsMust: ["Bears"], newsReject: ["golden bears", "baylor"], newsLimit: 3 },
    { key: "bulls", role: "chicago", sport: "basketball", league: "nba", id: "4", leagueLabel: "NBA", conference: "Eastern Conference", alternate: "000000", newsQuery: '"Chicago Bulls"', newsMust: ["Bulls"], newsReject: ["bulls eye", "running of"], newsLimit: 3 },
    { key: "blackhawks", role: "chicago", sport: "hockey", league: "nhl", id: "4", leagueLabel: "NHL", conference: "Western Conference", alternate: "000000", newsQuery: '"Chicago Blackhawks"', newsMust: ["Blackhawks"], newsReject: [], newsLimit: 3 },
    { key: "cubs", role: "chicago", sport: "baseball", league: "mlb", id: "16", leagueLabel: "MLB", conference: "NL Central", alternate: "CC3433", newsQuery: '"Chicago Cubs"', newsMust: ["Cubs"], newsReject: [], newsLimit: 3 },
    { key: "whitesox", role: "chicago", sport: "baseball", league: "mlb", id: "4", leagueLabel: "MLB", conference: "AL Central", alternate: "C4CED4", newsQuery: '"Chicago White Sox"', newsMust: ["White Sox"], newsReject: [], newsLimit: 3 },
    { key: "tamu", role: "minimal", sport: "football", league: "college-football", id: "245", leagueLabel: "College football", conference: "SEC", alternate: "FFFFFF", newsQuery: '"Texas A&M"', newsMust: ["Texas A&M", "Aggies"], newsReject: ["basketball", "baseball", "softball"], newsLimit: 2 },
    { key: "wisconsin", role: "minimal", sport: "football", league: "college-football", id: "275", leagueLabel: "College football", conference: "Big Ten", alternate: "FFFFFF", newsQuery: '"Wisconsin Badgers"', newsMust: ["Wisconsin", "Badgers"], newsReject: ["basketball", "hockey", "baseball"], newsLimit: 2 }
  ];

  async function fetchJson(path) {
    const urls = /^https?:/.test(path) ? [path] : HOSTS.map((host) => host + path);
    let lastError = null;
    for (const url of urls) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(response.status + " " + url);
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(path);
  }

  function hexColor(value, fallback) {
    if (!value) return fallback;
    const text = String(value).trim();
    return (text.charAt(0) === "#" ? text : "#" + text).toUpperCase();
  }

  function logoOf(team) {
    if (!team) return null;
    if (typeof team.logo === "string") return team.logo;
    const logos = team.logos || [];
    for (const logo of logos) {
      const rel = logo.rel || [];
      if (rel.indexOf("default") !== -1 && rel.indexOf("dark") === -1 && logo.href) return logo.href;
    }
    if (logos[0] && logos[0].href) return logos[0].href;
    return null;
  }

  function teamPage(team) {
    if (team && typeof team.clubhouse === "string") return team.clubhouse.replace("http://", "https://");
    for (const link of (team && team.links) || []) {
      const rel = link.rel || [];
      if (rel.indexOf("clubhouse") !== -1 || link.text === "Clubhouse" || link.text === "Team") {
        if (typeof link.href === "string") return link.href.replace("http://", "https://");
      }
    }
    return null;
  }

  function countedRecord(games) {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    games.forEach((game) => {
      if (!game.completed) return;
      if (game.result === "W") wins += 1;
      else if (game.result === "L") losses += 1;
      else if (game.result === "T") ties += 1;
    });
    return ties ? wins + "-" + losses + "-" + ties : wins + "-" + losses;
  }

  function scoreText(score) {
    if (score == null) return null;
    if (typeof score === "object") {
      if (score.displayValue != null && score.displayValue !== "") return String(score.displayValue);
      if ("value" in score) {
        const value = score.value;
        return typeof value === "number" && Number.isInteger(value) ? String(value) : String(value);
      }
      return null;
    }
    return String(score);
  }

  function broadcastName(competition) {
    const names = [];
    for (const item of competition.broadcasts || []) {
      const media = item.media || {};
      if (media.shortName && names.indexOf(media.shortName) === -1) names.push(media.shortName);
      for (const name of item.names || []) {
        if (name && names.indexOf(name) === -1) names.push(name);
      }
    }
    return names.length ? names.slice(0, 3).join(", ") : null;
  }

  function rankOf(competitor) {
    const current = competitor.curatedRank && competitor.curatedRank.current;
    return Number.isInteger(current) && current >= 1 && current <= 25 ? current : null;
  }

  function parseGames(schedule, teamId) {
    const games = [];
    for (const event of (schedule && schedule.events) || []) {
      const competition = (event.competitions || [])[0];
      if (!competition) continue;
      const competitors = competition.competitors || [];
      const ours = competitors.find((c) => String((c.team || {}).id) === String(teamId));
      const opp = competitors.find((c) => String((c.team || {}).id) !== String(teamId));
      if (!ours || !opp) continue;
      const status = (competition.status && competition.status.type) || {};
      const shortDetail = status.shortDetail || "";
      const detailText = (shortDetail + " " + (status.detail || "")).toLowerCase();
      if (detailText.indexOf("postpon") !== -1 || detailText.indexOf("cancel") !== -1) continue;
      const timeTbd = competition.timeValid === false || shortDetail.toUpperCase().indexOf("TBD") !== -1;
      const completed = Boolean(status.completed);
      const ourScore = scoreText(ours.score);
      const oppScore = scoreText(opp.score);
      let result = null;
      if (completed) {
        if (ours.winner === true) result = "W";
        else if (opp.winner === true) result = "L";
        else if (ourScore != null && ourScore === oppScore) result = "T";
      }
      const opponent = opp.team || {};
      const venue = competition.venue || {};
      const address = venue.address || {};
      const city = [address.city, address.state].filter(Boolean).join(", ");
      games.push({
        id: String(event.id || competition.id || ""),
        date: event.date,
        name: event.name,
        shortName: event.shortName,
        opponent: opponent.displayName || opponent.name,
        opponentShort: opponent.shortDisplayName || opponent.location || opponent.name,
        opponentAbbrev: opponent.abbreviation,
        opponentLogo: logoOf(opponent),
        opponentRank: rankOf(opp),
        homeAway: ours.homeAway,
        neutral: Boolean(competition.neutralSite),
        venue: venue.fullName || null,
        city: city || null,
        broadcast: broadcastName(competition),
        status: status.state || (completed ? "post" : "pre"),
        completed,
        detail: status.shortDetail || status.detail || null,
        timeTbd,
        scoreFor: ourScore,
        scoreAgainst: oppScore,
        result
      });
    }
    games.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return games;
  }

  function trimGames(games, role) {
    if (role === "hero") return games;
    const completed = games.filter((game) => game.completed);
    const upcoming = games.filter((game) => !game.completed);
    return completed.slice(-8).concat(upcoming.slice(0, 4));
  }

  function pollRank(rankings, label, teamId) {
    if (!rankings) return null;
    const needle = label.toLowerCase();
    for (const poll of rankings.rankings || []) {
      const name = ((poll.name || "") + " " + (poll.shortName || "")).toLowerCase();
      if (name.indexOf(needle) === -1) continue;
      for (const row of poll.ranks || []) {
        if (String((row.team || {}).id) === String(teamId) && Number.isInteger(row.current)) return row.current;
      }
    }
    return null;
  }

  function parseTime(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function headlineOk(title, must, reject) {
    const low = title.toLowerCase();
    if (must.length && !must.some((term) => low.indexOf(term.toLowerCase()) !== -1)) return false;
    if (reject.some((term) => low.indexOf(term.toLowerCase()) !== -1)) return false;
    return true;
  }

  function newsItem(title, url, published) {
    if (!title || !url) return null;
    return { title, url: url.replace("http://", "https://"), published: published || null };
  }

  async function fetchSearchNews(team) {
    const payload = await fetchJson(SEARCH + "?query=" + encodeURIComponent(team.newsQuery) + "&limit=10&type=article");
    const items = [];
    for (const group of payload.results || []) {
      for (const content of group.contents || []) {
        const title = content.displayName || "";
        if (!headlineOk(title, team.newsMust, team.newsReject)) continue;
        const item = newsItem(title, (content.link || {}).web, content.date);
        if (item) items.push(item);
      }
    }
    return items;
  }

  async function fetchLeagueNews(team) {
    const payload = await fetchJson("/apis/site/v2/sports/" + team.sport + "/" + team.league + "/news?limit=50");
    const items = [];
    for (const article of payload.articles || []) {
      const title = article.headline || "";
      if (!headlineOk(title, team.newsMust, team.newsReject)) continue;
      const web = (article.links || {}).web || {};
      const item = newsItem(title, web.href, article.published);
      if (item) items.push(item);
    }
    return items;
  }

  async function selectNews(team) {
    let merged = [];
    try { merged = merged.concat(await fetchSearchNews(team)); } catch (error) { /* news is optional */ }
    try { merged = merged.concat(await fetchLeagueNews(team)); } catch (error) { /* news is optional */ }
    const now = Date.now();
    const windows = [21, 45, 120];
    let chosen = [];
    for (const days of windows) {
      const cutoff = now - days * 86400000;
      const seen = new Set();
      chosen = [];
      const ordered = merged.slice().sort((a, b) => String(b.published).localeCompare(String(a.published)));
      for (const item of ordered) {
        const published = parseTime(item.published);
        if (published && published.getTime() < cutoff) continue;
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        chosen.push(item);
      }
      if (chosen.length >= Math.min(2, team.newsLimit)) break;
    }
    return chosen.slice(0, team.newsLimit);
  }

  function buildTeam(config, schedulePayload, rankings, news, regularGames) {
    const team = (schedulePayload && schedulePayload.team) || {};
    const seasonGames = parseGames(schedulePayload, config.id);
    const baseGames = config.league === "mlb" && regularGames ? regularGames : seasonGames;
    const upcomingPool = config.league === "mlb" && regularGames
      ? regularGames.concat(seasonGames).sort((a, b) => String(a.date).localeCompare(String(b.date)))
      : seasonGames;
    const displaySource = (config.league === "mlb" && !upcomingPool.some((game) => !game.completed) && seasonGames.length)
      ? seasonGames
      : (upcomingPool.some((game) => !game.completed) ? upcomingPool : baseGames);
    const games = trimGames(displaySource, config.role);
    const upcoming = games.filter((game) => !game.completed);
    const phase = upcomingPool.some((game) => !game.completed) ? "in-season" : "offseason";
    const rank = config.league === "college-football"
      ? { ap: pollRank(rankings, "AP Top 25", config.id), coaches: pollRank(rankings, "Coaches", config.id) }
      : null;
    const record = config.league === "mlb" && regularGames
      ? countedRecord(regularGames)
      : (team.recordSummary || countedRecord(seasonGames));
    return {
      key: config.key,
      role: config.role,
      name: team.displayName || team.name,
      shortName: team.shortDisplayName || team.name || team.abbreviation,
      abbreviation: team.abbreviation,
      sport: config.sport,
      league: config.league,
      leagueLabel: config.leagueLabel,
      conference: config.conference,
      espnId: String(config.id),
      color: hexColor(team.color, "#222222"),
      alternateColor: hexColor(team.alternateColor || config.alternate, "#F5F5F5"),
      logo: logoOf(team),
      teamUrl: teamPage(team),
      record,
      recordLabel: config.league === "mlb" ? "Regular season" : "Record",
      standing: team.standingSummary || null,
      rank,
      phase,
      seasonNote: phase === "offseason" ? "Offseason. The latest schedule on ESPN has no game left." : null,
      nextGame: upcomingPool.filter((game) => !game.completed)[0] || null,
      schedule: games,
      news: news || []
    };
  }

  async function loadSchedule(config, seasonType) {
    const suffix = seasonType ? "?seasontype=" + seasonType : "";
    return fetchJson("/apis/site/v2/sports/" + config.sport + "/" + config.league + "/teams/" + config.id + "/schedule" + suffix);
  }

  async function loadLive() {
    let rankings = null;
    try {
      rankings = await fetchJson("/apis/site/v2/sports/football/college-football/rankings");
    } catch (error) {
      rankings = null;
    }
    const teams = await Promise.all(TEAMS.map(async (config) => {
      const schedulePayload = await loadSchedule(config, config.league === "mlb" ? 3 : null);
      const regularPayload = config.league === "mlb" ? await loadSchedule(config, 2) : null;
      const news = await selectNews(config);
      const regularGames = regularPayload ? parseGames(regularPayload, config.id) : null;
      return buildTeam(config, schedulePayload, rankings, news, regularGames);
    }));
    return {
      generatedAt: new Date().toISOString(),
      timezone: "America/Chicago",
      source: "ESPN public site API",
      teams
    };
  }

  return { loadLive, TEAMS };
});
