/* Korona Gór Polskich — mapa zdobytych szczytów */

// Widok zostanie dopasowany do zasięgu szczytów po wczytaniu danych.
const map = L.map("map", {
  center: [50.0, 18.0],
  zoom: 7,
  minZoom: 5,
  maxZoom: 15,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

// Ikony markerów jako proste kółka (divIcon) — bez zewnętrznych obrazków.
// grayed=true => szczyt wyszarzony (np. zakaz psów przy aktywnym filtrze).
function peakIcon(visited, grayed) {
  const cls = visited ? "marker-visited" : "marker-todo";
  const color = grayed ? "#b5b5b5" : visited ? "#2d9c4a" : "#c94040";
  const opacity = grayed ? 0.5 : 1;
  return L.divIcon({
    className: "peak-marker " + cls + (grayed ? " marker-grayed" : ""),
    html: `<span style="
      display:block;width:16px;height:16px;border-radius:50%;
      background:${color};border:2px solid #fff;opacity:${opacity};
      box-shadow:0 0 3px rgba(0,0,0,0.6);"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// Informacja o psie na szczyt (🐕) na podstawie pola "dog".
const DOG_LABELS = {
  ok: "🐕 Pies dozwolony (na smyczy)",
  limited: "🐕 Pies warunkowo (smycz / uwaga na rezerwat)",
  no: "🚫🐕 Zakaz psów",
};
function dogInfo(dog) {
  const label = DOG_LABELS[dog];
  if (!label) return "";
  return `<div class="pt-dog pt-dog-${dog}">${label}</div>`;
}

// Normalizacja tekstu do wyszukiwania: bez diakrytyków, małe litery.
// NFD nie rozkłada "ł", więc podmieniamy ją ręcznie (Śnieżka -> "sniezka",
// Chełmiec -> "chelmiec").
function normalize(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .trim();
}

// Formatowanie daty (YYYY-MM-DD -> DD.MM.YYYY), z zabezpieczeniem.
function formatDate(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

// Odległość w metrach -> czytelny tekst ("853 m" / "35,6 km").
function formatDist(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

// Narzędzie pomiaru odległości ("linijka").
// targets: [{ marker, latlng, name }] — szczyty i miasta do snapowania.
function setupMeasureTool(map, targets) {
  const SNAP_PX = 18; // promień przyciągania do markera (piksele)
  const DEDUPE_PX = 8; // ignoruj kliknięcie tuż obok poprzedniego punktu
  const state = {
    active: false,
    points: [], // { latlng, name }
    line: null,
    vertices: [],
    segLabels: [],
  };

  let btn, panel, totalEl, hintEl;

  const control = L.control({ position: "topleft" });
  control.onAdd = function () {
    const wrap = L.DomUtil.create("div", "leaflet-bar measure-control");
    btn = L.DomUtil.create("a", "measure-btn", wrap);
    btn.href = "#";
    btn.title = "Zmierz odległość";
    btn.setAttribute("role", "button");
    btn.innerHTML = "📏";

    panel = L.DomUtil.create("div", "measure-panel", wrap);
    panel.innerHTML =
      '<div class="measure-total"></div>' +
      '<div class="measure-hint"></div>' +
      '<a href="#" class="measure-clear">Wyczyść</a>';
    totalEl = panel.querySelector(".measure-total");
    hintEl = panel.querySelector(".measure-hint");
    const clearBtn = panel.querySelector(".measure-clear");

    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.on(btn, "click", (e) => {
      L.DomEvent.preventDefault(e);
      toggle();
    });
    L.DomEvent.on(clearBtn, "click", (e) => {
      L.DomEvent.preventDefault(e);
      clearMeasure();
    });
    return wrap;
  };
  control.addTo(map);

  function totalDistance() {
    let d = 0;
    for (let i = 1; i < state.points.length; i++)
      d += state.points[i - 1].latlng.distanceTo(state.points[i].latlng);
    return d;
  }

  function updatePanel() {
    panel.style.display = state.active ? "block" : "none";
    if (!state.active) return;
    if (state.points.length === 0) {
      totalEl.textContent = "";
      hintEl.textContent = "Klikaj punkty na mapie…";
    } else {
      totalEl.textContent = `${state.points.length} pkt · ${formatDist(
        totalDistance()
      )}`;
      hintEl.textContent =
        state.points.length === 1
          ? "Dodaj kolejny punkt…"
          : "Esc lub przycisk Wyczyść = od nowa.";
    }
  }

  // Przyciąganie: jeśli kliknięcie jest blisko markera, zwróć jego pozycję i nazwę.
  function snap(latlng) {
    const cp = map.latLngToContainerPoint(latlng);
    let best = null;
    let bestD = SNAP_PX;
    for (const t of targets) {
      const d = cp.distanceTo(map.latLngToContainerPoint(t.latlng));
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best
      ? { latlng: best.latlng, name: best.name }
      : { latlng, name: null };
  }

  function clearGeometry() {
    if (state.line) {
      map.removeLayer(state.line);
      state.line = null;
    }
    state.vertices.forEach((v) => map.removeLayer(v));
    state.vertices = [];
    state.segLabels.forEach((l) => map.removeLayer(l));
    state.segLabels = [];
  }

  function redraw() {
    const latlngs = state.points.map((p) => p.latlng);
    if (state.line) state.line.setLatLngs(latlngs);
    else if (latlngs.length > 1)
      state.line = L.polyline(latlngs, {
        color: "#e8590c",
        weight: 3,
        dashArray: "6,6",
        interactive: false,
      }).addTo(map);

    state.vertices.forEach((v) => map.removeLayer(v));
    state.vertices = state.points.map((p) => {
      const m = L.circleMarker(p.latlng, {
        radius: 5,
        color: "#fff",
        weight: 2,
        fillColor: "#e8590c",
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
      if (p.name)
        m.bindTooltip(p.name, {
          permanent: true,
          direction: "right",
          className: "measure-vertex-label",
        });
      return m;
    });

    state.segLabels.forEach((l) => map.removeLayer(l));
    state.segLabels = [];
    for (let i = 1; i < state.points.length; i++) {
      const a = state.points[i - 1].latlng;
      const b = state.points[i].latlng;
      const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
      state.segLabels.push(
        L.marker(mid, {
          interactive: false,
          icon: L.divIcon({
            className: "measure-seg-label",
            html: formatDist(a.distanceTo(b)),
            iconSize: [70, 18],
            iconAnchor: [35, 9],
          }),
        }).addTo(map)
      );
    }
  }

  function addResolvedPoint(latlng, name) {
    if (state.points.length) {
      const last = state.points[state.points.length - 1].latlng;
      const d = map
        .latLngToContainerPoint(last)
        .distanceTo(map.latLngToContainerPoint(latlng));
      if (d < DEDUPE_PX) return; // ignoruj podwójne kliknięcie w to samo miejsce
    }
    state.points.push({ latlng, name: name || null });
    redraw();
    updatePanel();
  }

  function onMapClick(e) {
    const s = snap(e.latlng);
    addResolvedPoint(s.latlng, s.name);
  }

  // Kliknięcie prosto w marker (szczyt/miasto) — pewny snap na jego pozycję.
  function onTargetClick(t) {
    if (!state.active) return;
    addResolvedPoint(t.latlng, t.name);
  }
  targets.forEach((t) =>
    t.marker.on("click", (e) => {
      if (!state.active) return;
      L.DomEvent.stop(e);
      onTargetClick(t);
    })
  );

  function clearMeasure() {
    clearGeometry();
    state.points = [];
    updatePanel();
  }

  function onKey(e) {
    if (e.key === "Escape") clearMeasure();
  }

  function toggle() {
    state.active = !state.active;
    const cont = map.getContainer();
    if (state.active) {
      btn.classList.add("active");
      cont.classList.add("measuring");
      map.doubleClickZoom.disable();
      map.on("click", onMapClick);
      document.addEventListener("keydown", onKey);
    } else {
      btn.classList.remove("active");
      cont.classList.remove("measuring");
      map.doubleClickZoom.enable();
      map.off("click", onMapClick);
      document.removeEventListener("keydown", onKey);
      clearMeasure();
    }
    updatePanel();
  }

  updatePanel();
}

// Wyszukiwanie szczytu po nazwie (pole w nagłówku + rozwijana lista).
// peaks: [{ marker, isVisited, name, range, lat, lon }]
function setupPeakSearch(map, peaks) {
  const MAX_RESULTS = 8;
  const input = document.getElementById("peak-search-input");
  const list = document.getElementById("peak-search-results");
  if (!input || !list) return;

  let matches = []; // aktualnie wyświetlane trafienia
  let active = -1; // indeks podświetlonego wiersza
  let flash = null; // tymczasowy marker "błysku"

  function hideList() {
    list.hidden = true;
    list.innerHTML = "";
    matches = [];
    active = -1;
  }

  function search(query) {
    const q = normalize(query);
    if (!q) return [];
    const scored = [];
    for (const pm of peaks) {
      const idx = normalize(pm.name).indexOf(q);
      if (idx === -1) continue;
      scored.push({ pm, prefix: idx === 0 ? 0 : 1 });
    }
    // Najpierw trafienia od początku nazwy, potem alfabetycznie.
    scored.sort(
      (a, b) => a.prefix - b.prefix || a.pm.name.localeCompare(b.pm.name, "pl")
    );
    return scored.slice(0, MAX_RESULTS).map((s) => s.pm);
  }

  function setActive(i) {
    active = i;
    const items = list.querySelectorAll(".peak-search-item");
    items.forEach((el, idx) => el.classList.toggle("active", idx === active));
  }

  function render() {
    if (matches.length === 0) {
      list.innerHTML = '<li class="peak-search-empty">Brak wyników</li>';
      list.hidden = false;
      return;
    }
    list.innerHTML = matches
      .map(
        (pm, i) =>
          `<li class="peak-search-item" data-idx="${i}">` +
          `<span class="psi-name">${pm.name}</span>` +
          `<span class="psi-range">· ${pm.range}</span>` +
          (pm.isVisited ? '<span class="psi-check">✓</span>' : "") +
          `</li>`
      )
      .join("");
    list.hidden = false;
    setActive(0);
  }

  function flashPeak(pm) {
    if (flash) {
      map.removeLayer(flash);
      flash = null;
    }
    const current = flash = L.circleMarker([pm.lat, pm.lon], {
      radius: 16,
      color: "#e8590c",
      weight: 3,
      fill: false,
      interactive: false,
      className: "peak-flash",
    }).addTo(map);
    setTimeout(() => {
      if (current === flash) flash = null;
      map.removeLayer(current);
    }, 2200);
  }

  function selectPeak(pm) {
    if (!pm) return;
    hideList();
    input.value = pm.name;
    map.flyTo([pm.lat, pm.lon], Math.max(map.getZoom(), 12));
    pm.marker.openTooltip();
    flashPeak(pm);
    input.blur();
  }

  input.addEventListener("input", () => {
    matches = search(input.value);
    if (!normalize(input.value)) {
      hideList();
      return;
    }
    render();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      hideList();
      input.blur();
      return;
    }
    if (list.hidden || matches.length === 0) {
      if (e.key === "Enter") {
        const found = search(input.value);
        if (found.length) selectPeak(found[0]);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((active + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((active - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectPeak(matches[active] || matches[0]);
    }
  });

  list.addEventListener("mousemove", (e) => {
    const li = e.target.closest(".peak-search-item");
    if (li) setActive(Number(li.dataset.idx));
  });

  list.addEventListener("click", (e) => {
    const li = e.target.closest(".peak-search-item");
    if (li) selectPeak(matches[Number(li.dataset.idx)]);
  });

  // Klik poza widgetem chowa listę.
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#peak-search")) hideList();
  });
}

function showError(msg) {
  const div = document.createElement("div");
  div.id = "load-error";
  div.innerHTML = msg;
  document.body.appendChild(div);
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function init() {
  let peaks, cities, visited;
  try {
    [peaks, cities, visited] = await Promise.all([
      loadJSON("data/peaks.json"),
      loadJSON("data/cities.json"),
      loadJSON("data/visited.json"),
    ]);
  } catch (err) {
    showError(
      "Nie udało się wczytać danych.<br><br>" +
        "Jeśli otworzyłeś plik bezpośrednio z dysku (file://), " +
        "przeglądarka blokuje wczytywanie JSON. Uruchom lokalny serwer, np.:<br>" +
        "<code>python3 -m http.server</code><br>i wejdź na " +
        "<code>http://localhost:8000</code>.<br><br><small>" +
        String(err) +
        "</small>"
    );
    return;
  }

  // Mapa nazwa -> data odwiedzenia (dopasowanie po nazwie szczytu).
  const visitedByName = new Map();
  for (const v of visited) {
    if (v && v.peak) visitedByName.set(v.peak.trim().toLowerCase(), v.date || null);
  }

  // Cele do pomiaru odległości (szczyty + miasta) — do snapowania.
  const measureTargets = [];

  // Miasta — punkty odniesienia.
  const cityLayer = L.layerGroup().addTo(map);
  for (const c of cities) {
    const cm = L.circleMarker([c.lat, c.lon], {
      radius: 4,
      color: "#2a4d9e",
      weight: 1,
      fillColor: "#3d6fd6",
      fillOpacity: 0.9,
    })
      .bindTooltip(c.name, { direction: "top", className: "city-tooltip" })
      .addTo(cityLayer);
    measureTargets.push({ marker: cm, latlng: cm.getLatLng(), name: c.name });
  }

  // Szczyty.
  const peakLayer = L.layerGroup().addTo(map);
  const peakMarkers = []; // { marker, isVisited, dog }
  let visitedCount = 0;

  for (const p of peaks) {
    const key = p.name.trim().toLowerCase();
    const isVisited = visitedByName.has(key);
    const date = isVisited ? visitedByName.get(key) : null;
    if (isVisited) visitedCount++;

    const dateLine = isVisited
      ? `<div class="pt-date">✓ Zdobyty: ${
          date ? formatDate(date) : "(brak daty)"
        }</div>`
      : `<div class="pt-todo">Jeszcze do zdobycia</div>`;

    const dogLine = dogInfo(p.dog);

    const tooltipHtml = `
      <div class="peak-tooltip">
        <div class="pt-name">${p.name}</div>
        <div class="pt-range">${p.range} · ${p.elevation} m n.p.m.</div>
        ${dateLine}
        ${dogLine}
      </div>`;

    const marker = L.marker([p.lat, p.lon], { icon: peakIcon(isVisited, false) })
      .bindTooltip(tooltipHtml, { direction: "top", offset: [0, -6] })
      .addTo(peakLayer);

    peakMarkers.push({
      marker,
      isVisited,
      dog: p.dog,
      name: p.name,
      range: p.range,
      lat: p.lat,
      lon: p.lon,
    });
    measureTargets.push({ marker, latlng: marker.getLatLng(), name: p.name });
  }

  // Filtr "dla pieska": wyszarza szczyty z zakazem psów (dog === "no").
  const dogCb = document.getElementById("dog-filter-cb");
  function applyDogFilter() {
    const on = dogCb.checked;
    for (const pm of peakMarkers) {
      const grayed = on && pm.dog === "no";
      pm.marker.setIcon(peakIcon(pm.isVisited, grayed));
    }
  }
  dogCb.addEventListener("change", applyDogFilter);
  applyDogFilter();

  // Narzędzie pomiaru odległości.
  setupMeasureTool(map, measureTargets);

  // Wyszukiwanie szczytu po nazwie.
  setupPeakSearch(map, peakMarkers);

  // Dopasuj widok do zasięgu samych szczytów (nie całej Polski).
  const peakBounds = L.latLngBounds(peaks.map((p) => [p.lat, p.lon]));
  map.fitBounds(peakBounds, { padding: [40, 40] });

  // Postęp.
  const total = peaks.length;
  document.getElementById("progress-count").textContent =
    `${visitedCount}/${total}`;
  document.getElementById("progress-fill").style.width =
    `${(visitedCount / total) * 100}%`;
}

init();
