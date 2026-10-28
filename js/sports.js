(function () {
  const TZ = "America/Chicago";
  const app = document.getElementById("app");
  const statusEl = document.getElementById("status");
  let clock = null;
  let mode = "pending";
  let liveFailed = false;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function formatUpdated(iso) {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(new Date(iso));
    return formatted + " · Chicago";
  }

  function when(iso, timeTbd) {
    const date = new Date(iso);
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "short", month: "short", day: "numeric"
    }).format(date);
    if (timeTbd) return { dateLabel, timeLabel: "Time TBD" };
    const timeLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour: "numeric", minute: "2-digit"
    }).format(date);
    return { dateLabel, timeLabel };
  }

  function longWhen(game) {
    if (!game) return "";
    const date = new Date(game.date);
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "long", month: "long", day: "numeric"
    }).format(date);
    if (game.timeTbd) return day + " · time TBD";
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour: "numeric", minute: "2-digit", timeZoneName: "short"
    }).format(date);
    return day + " · " + time;
  }

  function brandColors(team) {
    let primary = team.color || "#888888";
    let accent = team.alternateColor || primary;
    if (primary === "#000000") primary = accent === "#000000" ? "#C4CED4" : accent;
    if (accent === "#000000" || accent === "#FFFFFF") accent = primary === "#FFFFFF" ? "#FDD023" : primary;
    if (team.key === "lsu") accent = "#FDD023";
    return { primary, accent };
  }

  function opponentLabel(game) {
    const rank = game.opponentRank ? "#" + game.opponentRank + " " : "";
    return rank + (game.opponentShort || game.opponent || "TBD");
  }

  function siteLabel(game) {
    if (game.neutral) return "Neutral" + (game.city ? " · " + game.city : "");
    const side = game.homeAway === "away" ? "Away" : "Home";
    return side + (game.city ? " · " + game.city : "");
  }

  function resultText(game) {
    if (game.status === "in") {
      if (game.scoreFor != null && game.scoreAgainst != null) {
        return game.scoreFor + "–" + game.scoreAgainst;
      }
      return "Live";
    }
    if (!game.completed) return game.timeTbd ? "TBD" : (game.broadcast || "Scheduled");
    const scores = (game.scoreFor != null ? game.scoreFor : "–") + "–" + (game.scoreAgainst != null ? game.scoreAgainst : "–");
    return game.result ? game.result + " " + scores : scores;
  }

  function logo(team, className) {
    if (!team.logo) return "";
    return '<img class="' + className + '" src="' + esc(team.logo) + '" alt="" width="64" height="64">';
  }

  function rankLine(team) {
    if (!team.rank) return "";
    const bits = [];
    if (team.rank.ap) bits.push("AP " + team.rank.ap);
    if (team.rank.coaches) bits.push("Coaches " + team.rank.coaches);
    return bits.join(" · ");
  }

  function formDots(team) {
    const recent = team.schedule.filter((game) => game.completed).slice(-5);
    if (!recent.length) return "";
    return '<p class="form" aria-label="Recent results">' + recent.map((game) => {
      const kind = game.result === "W" ? "win" : game.result === "L" ? "loss" : "tie";
      return '<span class="dot ' + kind + '">' + esc(game.result || "–") + "</span>";
    }).join("") + "</p>";
  }

  function newsList(items) {
    if (!items || !items.length) return '<p class="quiet">No recent headline named this team.</p>';
    return '<ul class="news">' + items.map((item) => {
      const stamp = item.published ? when(item.published, false).dateLabel : "";
      return '<li><a href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.title) + '</a><time>' + esc(stamp) + "</time></li>";
    }).join("") + "</ul>";
  }

  function nextBlock(team) {
    const game = team.nextGame;
    if (!game) {
      return '<p class="phase">Offseason</p><p class="season-note">' + esc(team.seasonNote || "No game remaining on the ESPN schedule.") + "</p>";
    }
    const live = game.status === "in";
    return '<p class="phase">' + (live ? "Live" : "Next") + "</p>" +
      '<p class="next-opp">' + esc(opponentLabel(game)) + "</p>" +
      '<p class="next-meta">' + esc(longWhen(game)) + "</p>" +
      '<p class="next-meta">' + esc(siteLabel(game)) + (game.broadcast ? " · " + esc(game.broadcast) : "") + "</p>" +
      (live && game.detail ? '<p class="next-meta">' + esc(game.detail) + "</p>" : "") +
      (game.scoreFor != null ? '<p class="live-score">' + esc(resultText(game)) + "</p>" : "");
  }

  function lastLine(team) {
    const last = team.schedule.filter((game) => game.completed).slice(-1)[0];
    if (!last) return "";
    const prep = last.neutral ? "vs" : last.homeAway === "away" ? "at" : "vs";
    return '<p class="last">Last ' + esc(resultText(last)) + " " + esc(prep) + " " + esc(opponentLabel(last)) + "</p>";
  }

  function hero(team) {
    const colors = brandColors(team);
    const game = team.nextGame;
    const ranks = rankLine(team);
    const countdown = game && game.status !== "in" && !game.timeTbd
      ? '<div class="countdown" data-kickoff="' + esc(game.date) + '" aria-live="polite"><div><b data-unit="d">–</b><span>Days</span></div><div><b data-unit="h">–</b><span>Hours</span></div><div><b data-unit="m">–</b><span>Min</span></div><div><b data-unit="s">–</b><span>Sec</span></div></div>'
      : (game && game.status === "in"
        ? '<p class="countdown-note">On now' + (game.detail ? " · " + esc(game.detail) : "") + "</p>"
        : '<p class="countdown-note">Kickoff time is not posted yet.</p>');
    const rows = team.schedule.map((item) => {
      const slot = when(item.date, item.timeTbd);
      const kind = item.status === "in" ? "live" : item.completed ? (item.result || "").toLowerCase() : "future";
      const cell = item.status === "in"
        ? esc(resultText(item)) + (item.detail ? "<small>" + esc(item.detail) + "</small>" : "")
        : item.completed
          ? esc(resultText(item))
          : esc(item.broadcast || (item.timeTbd ? "Time TBD" : "Scheduled"));
      return "<tr class=\"" + kind + "\"><td>" + esc(slot.dateLabel) + "<small>" + esc(slot.timeLabel) + "</small></td><td>" + esc(opponentLabel(item)) + "</td><td>" + esc(siteLabel(item)) + "</td><td class=\"result\">" + cell + "</td></tr>";
    }).join("");
    return '<section class="hero" style="--team:' + colors.primary + ';--accent:' + colors.accent + '">' +
      '<div class="identity">' +
        logo(team, "hero-logo") +
        '<p class="kicker">' + esc(team.leagueLabel) + " · " + esc(team.conference) + "</p>" +
        "<h2>" + esc(team.name) + "</h2>" +
        '<p class="record"><span>' + esc(team.recordLabel) + "</span>" + esc(team.record || "–") + "</p>" +
        '<p class="ranks">' + esc([ranks, team.standing].filter(Boolean).join(" · ")) + "</p>" +
        '<div class="next-card">' + nextBlock(team) + countdown + "</div>" +
      "</div>" +
      '<div class="schedule-wrap"><h3>Schedule</h3><table><caption>LSU football schedule and results</caption><thead><tr><th>Date</th><th>Opponent</th><th>Site</th><th>Result</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="news-col"><h3>Recent headlines</h3>' + newsList(team.news) + "</div>" +
    "</section>";
  }

  function clubCard(team) {
    const colors = brandColors(team);
    const off = team.phase === "offseason";
    return '<article class="club' + (off ? " off" : "") + '" style="--team:' + colors.primary + ';--accent:' + colors.accent + '">' +
      '<header>' + logo(team, "club-logo") + "<div><p>" + esc(team.leagueLabel) + "</p><h3>" + esc(team.shortName || team.name) + "</h3></div></header>" +
      '<p class="record"><span>' + esc(team.recordLabel) + "</span>" + esc(team.record || "–") + "</p>" +
      (team.standing ? '<p class="standing">' + esc(team.standing) + "</p>" : "") +
      nextBlock(team) +
      formDots(team) +
      lastLine(team) +
      (team.news && team.news[0] ? '<p class="one-headline"><a href="' + esc(team.news[0].url) + '" target="_blank" rel="noopener noreferrer">' + esc(team.news[0].title) + "</a>" + (team.news[0].published ? "<span> · " + esc(when(team.news[0].published, false).dateLabel) + "</span>" : "") + "</p>" : "") +
    "</article>";
  }

  function miniCard(team) {
    const colors = brandColors(team);
    const game = team.nextGame;
    const ranks = rankLine(team);
    const next = game
      ? esc(longWhen(game)) + " · " + esc(game.homeAway === "away" ? "at " : "vs ") + esc(opponentLabel(game))
      : "No game posted";
    return '<article class="mini" style="--team:' + colors.primary + ';--accent:' + colors.accent + '">' +
      logo(team, "mini-logo") +
      "<div><p>" + esc(team.leagueLabel) + "</p><h3>" + esc(team.name) + "</h3>" +
      '<p class="mini-record">' + esc(team.record || "–") + (ranks ? " · " + esc(ranks) : "") + (team.standing ? " · " + esc(team.standing) : "") + "</p>" +
      "<p>" + next + "</p>" + lastLine(team) + "</div></article>";
  }

  function render(data, sourceMode) {
    mode = sourceMode;
    const byKey = {};
    data.teams.forEach((team) => { byKey[team.key] = team; });
    const chicago = ["bears", "bulls", "blackhawks", "cubs", "whitesox"].map((key) => byKey[key]).filter(Boolean);
    const minimal = ["tamu", "wisconsin"].map((key) => byKey[key]).filter(Boolean);
    const sourceLabel = sourceMode === "live" ? "Live ESPN" : "Saved snapshot";
    statusEl.innerHTML = "<strong>" + sourceLabel + "</strong> · Updated " + esc(formatUpdated(data.generatedAt)) +
      (sourceMode === "snapshot" && liveFailed ? " · The live request did not finish, so this is the committed fallback." : "");
    app.innerHTML = hero(byKey.lsu) +
      '<section class="band"><div class="section-head"><h2>Chicago</h2><p>Bears, Bulls, Blackhawks, and both baseball clubs. Baseball shows an offseason state once ESPN has no game left.</p></div><div class="clubs">' +
      chicago.map(clubCard).join("") + "</div></section>" +
      '<section class="band slim"><div class="section-head"><h2>Also on the board</h2><p>Texas A&amp;M and Wisconsin, kept to a record and the next kickoff.</p></div><div class="minis">' +
      minimal.map(miniCard).join("") + "</div></section>";
    startClock();
  }

  function startClock() {
    if (clock) clearInterval(clock);
    const box = document.querySelector(".countdown");
    if (!box) return;
    const kick = new Date(box.getAttribute("data-kickoff")).getTime();
    const units = {
      d: box.querySelector('[data-unit="d"]'),
      h: box.querySelector('[data-unit="h"]'),
      m: box.querySelector('[data-unit="m"]'),
      s: box.querySelector('[data-unit="s"]')
    };
    const tick = () => {
      let diff = kick - Date.now();
      if (diff <= 0) {
        units.d.textContent = "0";
        units.h.textContent = "0";
        units.m.textContent = "0";
        units.s.textContent = "0";
        return;
      }
      const total = Math.floor(diff / 1000);
      units.d.textContent = String(Math.floor(total / 86400));
      units.h.textContent = String(Math.floor((total % 86400) / 3600)).padStart(2, "0");
      units.m.textContent = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
      units.s.textContent = String(total % 60).padStart(2, "0");
    };
    tick();
    clock = setInterval(tick, 1000);
  }

  function fail(message) {
    statusEl.textContent = message;
    app.innerHTML = '<p class="empty">' + esc(message) + "</p>";
  }

  const live = window.EspnBoard.loadLive();
  const snapshot = fetch("data/sports.json", { cache: "no-cache" }).then((response) => {
    if (!response.ok) throw new Error("snapshot " + response.status);
    return response.json();
  });

  snapshot.then((data) => {
    if (mode === "live") return;
    render(data, "snapshot");
  }).catch(() => {
    if (mode !== "live") fail("Scores could not be loaded from ESPN or from the saved snapshot.");
  });

  live.then((data) => {
    liveFailed = false;
    render(data, "live");
  }).catch(() => {
    liveFailed = true;
    if (mode === "snapshot") {
      const current = statusEl.textContent || "";
      if (current.indexOf("committed fallback") === -1) {
        statusEl.innerHTML += " · The live request did not finish, so this is the committed fallback.";
      }
    }
  });
})();
