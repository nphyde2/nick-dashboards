(function () {
  const TZ = "America/Chicago";
  const listEl = document.getElementById("list");
  const statusEl = document.getElementById("status");
  const filtersEl = document.getElementById("filters");
  const mapEl = document.getElementById("map");
  const gridEl = document.getElementById("grid");
  const COLORS = {
    festival: "#b4532a", parade: "#9b1d3a", music: "#3c4d8c", comedy: "#8a5a12",
    theater: "#6b3f69", film: "#1f6f6a", holiday: "#1d4e89", market: "#3f6b2a",
    family: "#a15c38", community: "#3e5c4a", transit: "#8d2f2f", tour: "#44566b"
  };
  const LABEL = {
    festival: "Festivals", parade: "Parades", music: "Music", comedy: "Comedy",
    theater: "Theater", film: "Film", holiday: "Holiday", market: "Markets",
    family: "Family", community: "Community", transit: "Transit and crowds", tour: "Tours"
  };
  const state = { weekend: "all", category: "all", neighborhood: "all", crowd: false, q: "" };
  let data = null;
  let map = null;
  let layer = null;
  const markers = {};

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function rangeLabel(start, end) {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });
    const s = fmt.format(new Date(start + "T12:00:00"));
    if (start === end) return s;
    const e = fmt.format(new Date(end + "T12:00:00"));
    return s + "–" + e;
  }

  function overlaps(event, start, end) {
    return event.start <= end && event.end >= start;
  }

  function matches(event) {
    if (state.weekend !== "all") {
      const weekend = data.weekends.find((item) => item.id === state.weekend);
      if (weekend && !overlaps(event, weekend.start, weekend.end)) return false;
    }
    if (state.category !== "all" && (event.categories || []).indexOf(state.category) === -1) return false;
    if (state.neighborhood !== "all" && event.neighborhood !== state.neighborhood) return false;
    if (state.crowd && !event.crowd) return false;
    if (state.q) {
      const blob = [event.name, event.neighborhood, event.venue, event.summary, event.time].join(" ").toLowerCase();
      if (blob.indexOf(state.q) === -1) return false;
    }
    return true;
  }

  function colorFor(event) {
    const first = (event.categories || [])[0];
    return COLORS[first] || "#3e4a3c";
  }

  function precisionNote(event) {
    if (event.locationPrecision === "neighborhood") return "Pin is the neighborhood center. The city release did not publish a street address.";
    if (event.locationPrecision === "route") return "Pin sits on the published route, not at a single entrance.";
    if (event.locationPrecision === "corridor") return "Pin marks the middle of the published corridor.";
    return "";
  }

  function card(event) {
    const cats = (event.categories || []).map((cat) => '<span class="tag">' + esc(LABEL[cat] || cat) + "</span>").join("");
    const sources = (event.sources || []).map((source) => '<a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.name) + "</a>").join("");
    const note = precisionNote(event);
    const transit = event.transitNote ? '<p class="transit">' + esc(event.transitNote) + "</p>" : "";
    return '<article class="event" id="event-' + esc(event.id) + '">' +
      '<div class="event-top"><p class="when">' + esc(rangeLabel(event.start, event.end)) + (event.crowd ? ' <span class="crowd">Crowd</span>' : "") + "</p>" +
      "<h3>" + esc(event.name) + "</h3>" +
      '<p class="where">' + esc(event.venue) + "</p></div>" +
      '<p class="time">' + esc(event.time) + "</p>" +
      "<p>" + esc(event.summary) + "</p>" +
      (event.admission ? '<p class="admission">' + esc(event.admission) + "</p>" : "") +
      transit +
      (note ? '<p class="precision">' + esc(note) + "</p>" : "") +
      '<div class="tags">' + cats + "</div>" +
      '<p class="sources">Source: ' + sources + '</p>' +
      '<button type="button" data-focus="' + esc(event.id) + '">Show on map</button>' +
    "</article>";
  }

  function renderList(events) {
    if (!events.length) {
      listEl.innerHTML = '<p class="empty">Nothing matches those filters. Clear one and the weekends fill back in.</p>';
      return;
    }
    const crowds = events.filter((event) => event.crowd).slice().sort((a, b) => a.start.localeCompare(b.start));
    const strip = crowds.length
      ? '<section class="strip"><h2>Crowds and street dates</h2><ul>' + crowds.map((event) => {
          return "<li><button type=\"button\" data-focus=\"" + esc(event.id) + "\"><strong>" + esc(rangeLabel(event.start, event.end)) + "</strong> " + esc(event.name) + "</button><span>" + esc(event.transitNote || event.neighborhood) + "</span></li>";
        }).join("") + "</ul></section>"
      : "";
    const groups = new Map();
    events.slice().sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name)).forEach((event) => {
      if (!groups.has(event.neighborhood)) groups.set(event.neighborhood, []);
      groups.get(event.neighborhood).push(event);
    });
    const names = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    const body = names.map((name) => {
      const items = groups.get(name);
      return '<section class="hood"><h2>' + esc(name) + " <span>" + items.length + "</span></h2>" + items.map(card).join("") + "</section>";
    }).join("");
    listEl.innerHTML = strip + body;
  }

  function renderGrid(events) {
    const counts = new Map();
    events.forEach((event) => counts.set(event.neighborhood, (counts.get(event.neighborhood) || 0) + 1));
    const names = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
    gridEl.innerHTML = '<p class="grid-label">Neighborhoods in this filter</p><div class="tiles">' + names.map((name) => {
      return '<button type="button" data-hood="' + esc(name) + '"><b>' + esc(name) + "</b><span>" + counts.get(name) + "</span></button>";
    }).join("") + "</div>";
    gridEl.hidden = false;
  }

  function popupHtml(event) {
    const link = (event.sources && event.sources[0]) || null;
    return "<strong>" + esc(event.name) + "</strong><br>" + esc(event.neighborhood) + "<br>" + esc(rangeLabel(event.start, event.end)) +
      (link ? '<br><a href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer">' + esc(link.name) + "</a>" : "");
  }

  function renderMap(events) {
    Object.keys(markers).forEach((key) => delete markers[key]);
    if (!map) {
      renderGrid(events);
      return;
    }
    layer.clearLayers();
    const points = [];
    events.forEach((event) => {
      if (typeof event.lat !== "number" || typeof event.lng !== "number") return;
      const marker = L.circleMarker([event.lat, event.lng], {
        radius: event.locationPrecision === "neighborhood" ? 8 : 10,
        color: colorFor(event),
        weight: 2,
        fillColor: colorFor(event),
        fillOpacity: event.locationPrecision === "neighborhood" ? 0.35 : 0.82
      });
      marker.bindPopup(popupHtml(event));
      marker.addTo(layer);
      markers[event.id] = marker;
      points.push([event.lat, event.lng]);
    });
    if (points.length) map.fitBounds(points, { padding: [28, 28], maxZoom: 13 });
    else map.setView([41.87, -87.65], 11);
    renderGrid(events);
  }

  function apply() {
    const events = data.events.filter(matches);
    statusEl.textContent = events.length + (events.length === 1 ? " event" : " events");
    renderList(events);
    renderMap(events);
  }

  function chip(label, active, attrs) {
    return '<button type="button" class="chip' + (active ? " on" : "") + '" ' + attrs + ">" + esc(label) + "</button>";
  }

  function renderFilters() {
    const neighborhoods = Array.from(new Set(data.events.map((event) => event.neighborhood))).sort((a, b) => a.localeCompare(b));
    const categories = Array.from(new Set(data.events.flatMap((event) => event.categories || [])));
    const weekendChips = chip("All dates", state.weekend === "all", 'data-weekend="all"') +
      data.weekends.map((weekend) => chip(weekend.label, state.weekend === weekend.id, 'data-weekend="' + esc(weekend.id) + '"')).join("");
    const categoryChips = chip("All types", state.category === "all", 'data-category="all"') +
      categories.map((cat) => chip(LABEL[cat] || cat, state.category === cat, 'data-category="' + esc(cat) + '"')).join("") +
      chip("Crowd dates", state.crowd, 'data-crowd="1"');
    filtersEl.innerHTML =
      '<label class="search">Search<input type="search" id="q" value="' + esc(state.q) + '" placeholder="Neighborhood, venue, or name"></label>' +
      '<label class="pick">Neighborhood<select id="hood"><option value="all">All neighborhoods</option>' +
      neighborhoods.map((name) => '<option value="' + esc(name) + '"' + (state.neighborhood === name ? " selected" : "") + ">" + esc(name) + "</option>").join("") +
      "</select></label>" +
      '<div class="chips" role="group" aria-label="Weekend">' + weekendChips + "</div>" +
      '<div class="chips" role="group" aria-label="Type">' + categoryChips + "</div>";
  }

  function focusEvent(id) {
    const marker = markers[id];
    const cardEl = document.getElementById("event-" + id);
    if (cardEl) cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (marker && map) {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13));
      marker.openPopup();
    }
  }

  document.addEventListener("click", (event) => {
    const weekend = event.target.closest("[data-weekend]");
    const category = event.target.closest("[data-category]");
    const crowd = event.target.closest("[data-crowd]");
    const focus = event.target.closest("[data-focus]");
    const hood = event.target.closest("[data-hood]");
    if (weekend) { state.weekend = weekend.getAttribute("data-weekend"); renderFilters(); apply(); }
    if (category) { state.category = category.getAttribute("data-category"); state.crowd = false; renderFilters(); apply(); }
    if (crowd) { state.crowd = !state.crowd; if (state.crowd) state.category = "all"; renderFilters(); apply(); }
    if (focus) focusEvent(focus.getAttribute("data-focus"));
    if (hood) { state.neighborhood = hood.getAttribute("data-hood"); renderFilters(); apply(); }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "q") {
      state.q = event.target.value.trim().toLowerCase();
      apply();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "hood") {
      state.neighborhood = event.target.value;
      apply();
    }
  });

  function bootMap() {
    if (!window.L) {
      mapEl.hidden = true;
      return;
    }
    map = L.map(mapEl, { scrollWheelZoom: true });
    map.setView([41.87, -87.65], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  fetch("data/chicago.json", { cache: "no-cache" }).then((response) => {
    if (!response.ok) throw new Error("chicago.json " + response.status);
    return response.json();
  }).then((payload) => {
    data = payload;
    const updated = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, month: "long", day: "numeric", year: "numeric"
    }).format(new Date(payload.updated + "T12:00:00"));
    document.getElementById("coverage").textContent = payload.coverage + " · listings checked " + updated;
    bootMap();
    renderFilters();
    apply();
    setTimeout(() => { if (map) map.invalidateSize(); }, 200);
  }).catch(() => {
    statusEl.textContent = "The events file did not load.";
    listEl.innerHTML = '<p class="empty">data/chicago.json could not be read.</p>';
  });
})();
