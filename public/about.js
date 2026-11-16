function revealApiDetails() {
  const target = document.getElementById(location.hash.slice(1));
  const details = target?.closest('details');
  if (details && !details.open) {
    details.open = true;
    target.scrollIntoView();
  }
}
revealApiDetails();
window.addEventListener('hashchange', revealApiDetails);

function renderResolutionMap(config) {
  const site = config?.site;
  if (!Number.isFinite(site?.latitude) || !Number.isFinite(site.longitude) || !window.L) return;
  const sources = [
    { id: "piaf", label: "PIAF", detail: "Prévoit la pluie sur 3 h", sizeLabel: "0,8 × 1,1 km", color: "#087cac", originLongitude: -6, originLatitude: 51.5, longitudeStep: 0.01, latitudeStep: 0.01 },
    { id: "arome", label: "AROME", detail: "Prévoit les prochaines 48 h", sizeLabel: "0,8 × 1,1 km", color: "#008b74", originLongitude: -12, originLatitude: 55.4, longitudeStep: 0.01, latitudeStep: 0.01 },
    { id: "pearome", reference: true, label: "PE‑AROME", detail: "Calcule les probabilités à 48 h", sizeLabel: "2,0 × 2,8 km", color: "#d18b00", originLongitude: -12, originLatitude: 55.4, longitudeStep: 0.025, latitudeStep: 0.025 },
    { id: "arpege", label: "ARPEGE", detail: "Prolonge la prévision et le signal d’orage à 4 jours", sizeLabel: "4,0 × 5,6 km", color: "#d45555", originLongitude: -32, originLatitude: 72, longitudeStep: 0.05, latitudeStep: 0.05 },
    { id: "pearpege", reference: true, label: "PE‑ARPEGE", detail: "Mesure l’incertitude à 4 jours", sizeLabel: "7,9 × 11,1 km", color: "#8b4ca3", originLongitude: -32, originLatitude: 72, longitudeStep: 0.1, latitudeStep: 0.1 }
  ];

  const map = L.map("scale-map", {
    preferCanvas: true,
    zoomControl: true,
    dragging: false,
    keyboard: false,
    boxZoom: false,
    scrollWheelZoom: "center",
    doubleClickZoom: "center",
    touchZoom: "center"
  }).setView([site.latitude, site.longitude], 11);
  const backgroundNote = document.getElementById("map-background");
  let hasBackground = false;
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    opacity: 0.42,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).on('tileerror', () => { backgroundNote.hidden = hasBackground; })
    .on('tileload', () => { hasBackground = true; backgroundNote.hidden = true; })
    .addTo(map);

  const layers = new Map();

  function wcsPolygon(source, eastIndex, northIndex) {
    const nativeColumn = Math.round((site.longitude - source.originLongitude) / source.longitudeStep);
    const nativeRow = Math.round((source.originLatitude - site.latitude) / source.latitudeStep);
    const centerLongitude = source.originLongitude + (nativeColumn + eastIndex) * source.longitudeStep;
    const centerLatitude = source.originLatitude - (nativeRow - northIndex) * source.latitudeStep;
    const halfLongitude = source.longitudeStep / 2;
    const halfLatitude = source.latitudeStep / 2;
    return [
      [centerLatitude - halfLatitude, centerLongitude - halfLongitude],
      [centerLatitude - halfLatitude, centerLongitude + halfLongitude],
      [centerLatitude + halfLatitude, centerLongitude + halfLongitude],
      [centerLatitude + halfLatitude, centerLongitude - halfLongitude]
    ];
  }

  function sourceLayer(source) {
    const group = L.layerGroup();
    const gridRadius = 5;
    for (let north = -gridRadius; north <= gridRadius; north++) {
      for (let east = -gridRadius; east <= gridRadius; east++) {
        const central = north === 0 && east === 0;
        const distance = Math.hypot(east, north);
        const fade = Math.max(0, 1 - distance / (gridRadius + 0.35));
        if (!central && fade <= 0) continue;
        L.polygon(wcsPolygon(source, east, north), {
          color: source.color,
          weight: central ? 3 : 1,
          opacity: central ? 1 : 0.58 * fade * fade,
          fill: central,
          fillColor: source.color,
          fillOpacity: central ? 0.09 : 0,
          interactive: central
        }).bindTooltip(central ? `${source.label} · ${source.sizeLabel}` : "", {
          permanent: false,
          direction: "center",
          className: "grid-label"
        }).addTo(group);
      }
    }
    return group;
  }

  [...sources].reverse().forEach(source => {
    const layer = sourceLayer(source);
    if (!source.reference) layer.addTo(map);
    layers.set(source.id, layer);
  });

  const placeLabel = document.createElement("span");
  placeLabel.textContent = site.place || site.name;
  L.circleMarker([site.latitude, site.longitude], {
    radius: 6,
    color: "#fff",
    weight: 3,
    fillColor: "#113f58",
    fillOpacity: 1
  }).addTo(map).bindTooltip(placeLabel, {
    permanent: true,
    direction: "top",
    offset: [0, -8],
    className: "site-marker-label"
  });

  const controls = document.querySelector("#layer-controls");
  sources.forEach(source => {
    const label = document.createElement("label");
    label.className = "layer-toggle";
    label.style.setProperty("--layer-color", source.color);
    label.innerHTML = `<input type="checkbox" ${source.reference ? "" : "checked"} data-layer="${source.id}"><span class="layer-copy"><strong>${source.label}</strong><small>${source.detail}</small>${source.reference ? '<span class="layer-reference">Repère de comparaison</span>' : ""}</span><span class="layer-size">${source.sizeLabel}</span>`;
    controls.append(label);
  });

  controls.addEventListener("change", event => {
    const input = event.target.closest("input[data-layer]");
    if (!input) return;
    const layer = layers.get(input.dataset.layer);
    if (input.checked) layer.addTo(map);
    else layer.removeFrom(map);
  });

  function fitAll() {
    map.setView([site.latitude, site.longitude], 13, { animate: false });
  }

  fitAll();
}

renderResolutionMap(window.METEO_RUNTIME_CONFIG);
