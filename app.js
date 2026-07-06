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

// Formatowanie daty (YYYY-MM-DD -> DD.MM.YYYY), z zabezpieczeniem.
function formatDate(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
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

  // Miasta — punkty odniesienia.
  const cityLayer = L.layerGroup().addTo(map);
  for (const c of cities) {
    L.circleMarker([c.lat, c.lon], {
      radius: 4,
      color: "#2a4d9e",
      weight: 1,
      fillColor: "#3d6fd6",
      fillOpacity: 0.9,
    })
      .bindTooltip(c.name, { direction: "top", className: "city-tooltip" })
      .addTo(cityLayer);
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

    peakMarkers.push({ marker, isVisited, dog: p.dog });
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
