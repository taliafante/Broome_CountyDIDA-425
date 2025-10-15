/* script.js — Leaflet map loading from pre-geocoded JSON
   - Loads ./assets/data.geocoded.json
   - Marker clustering, type filters, name search, ZIP filter
   - Export filtered features as GeoJSON
   - Beginner interactive enhancements added
*/
const STATUS = document.getElementById('status');
const SEARCH = document.getElementById('searchBox');
const ZIP_INPUT = document.getElementById('zipBox'); // ⭐ new zip input element
const RESET = document.getElementById('resetBtn');
const EXPORT_BTN = document.getElementById('exportBtn');
const TYPE_FILTERS = document.getElementById('typeFilters');

function setStatus(msg) { STATUS.textContent = msg; }

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch ${url}`);
  return r.json();
}

function buildPopup(row) {
  const esc = s => (s || '').toString();
  const lines = [];
  lines.push(`<div class="marker-title">${esc(row.Name)}</div>`);
  if (row.Type) lines.push(`<div class="marker-type">${esc(row.Type)}</div>`);
  const addr = [row.Street, row.City, row.State, row.Zip].filter(Boolean).join(', ');
  if (addr) lines.push(`<div class="marker-meta"><b>Address:</b> ${esc(addr)}</div>`);
  if (row["Hours of Operation"]) lines.push(`<div class="marker-meta"><b>Hours:</b> ${esc(row["Hours of Operation"])}</div>`);
  if (row["Area Served"]) lines.push(`<div class="marker-meta"><b>Area:</b> ${esc(row["Area Served"])}</div>`);
  if (row["Deliveries?"]) lines.push(`<div class="marker-meta"><b>Deliveries:</b> ${esc(row["Deliveries?"])}</div>`);
  if (row["Additional Services Offered"]) lines.push(`<div class="marker-meta"><b>Services:</b> ${esc(row["Additional Services Offered"])}</div>`);
  if (row["Drive Thru?"]) lines.push(`<div class="marker-meta"><b>Drive Thru:</b> ${esc(row["Drive Thru?"])}</div>`);
  if (row["Contact"]) lines.push(`<div class="marker-meta"><b>Contact:</b> ${esc(row["Contact"])}</div>`);
  if (row["Phone"]) lines.push(`<div class="marker-meta"><b>Phone:</b> ${esc(row["Phone"])}</div>`);
  if (row["Email"]) lines.push(`<div class="marker-meta"><b>Email:</b> ${esc(row["Email"])}</div>`);
  return lines.join("");
}

function toGeoJSON(features) {
  return {
    type: "FeatureCollection",
    features: features.map(({row}) => ({
      type: "Feature",
      geometry: (row.longitude && row.latitude) ? {
        type: "Point",
        coordinates: [Number(row.longitude), Number(row.latitude)]
      } : null,
      properties: {...row}
    })).filter(f => f.geometry)
  };
}

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

(async function main(){
  setStatus('Loading geocoded data…');
  const rows = await fetchJSON('./assets/data.geocoded.json');

  // Build set of Types
  const types = Array.from(new Set(rows.map(r => r.Type).filter(Boolean))).sort();
  const colors = ['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6','#bcf60c']; 
  const typeColors = {};
  types.forEach((t,i) => typeColors[t] = colors[i % colors.length]);

  types.forEach(t => {
    const id = `type_${t.replace(/\W+/g,'_')}`;
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" id="${id}" data-type="${t}" /> <span style="color:${typeColors[t]}; font-weight:bold;">${t}</span>`;
    TYPE_FILTERS.appendChild(label);
  });

  // Initialize map
  const map = L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const cluster = L.markerClusterGroup().addTo(map);

  let markers = [];

  function refreshMarkers() {
    cluster.clearLayers();
    markers = [];

    const activeTypes = new Set(Array.from(TYPE_FILTERS.querySelectorAll('input[type=checkbox]'))
      .filter(cb=>cb.checked)
      .map(cb=>cb.dataset.type.toString()));
    const query = (SEARCH.value || '').toLowerCase().trim();

    // ⭐ new ZIP filter logic
    const zipQuery = (ZIP_INPUT.value || '').trim();
    const zipList = zipQuery.split(',').map(z => z.trim()).filter(Boolean);

    const features = [];
    for (const row of rows) {
      if (activeTypes.size && row.Type && !activeTypes.has(row.Type)) continue;
      if (query && !(row.Name || '').toLowerCase().includes(query)) continue;

      // ⭐ check zip match if any ZIP entered
      if (zipList.length && (!row.Zip || !zipList.includes(row.Zip.toString()))) continue;

      if (row.latitude == null || row.longitude == null || row.latitude === "" || row.longitude === "") continue;
      const lat = Number(row.latitude), lon = Number(row.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      features.push({ row, lat, lon });
    }

    for (const f of features) {
      const icon = L.icon({
        iconUrl: `https://cdn-icons-png.flaticon.com/512/684/684908.png`,
        iconSize: [25,25],
        iconAnchor: [12,25],
        popupAnchor: [0,-25]
      });
      const m = L.marker([f.lat, f.lon], {icon});
      m.bindPopup(buildPopup(f.row));
      m.bindTooltip(f.row.Name || '', {permanent:false, direction:'top'});
      m.on('click', function() {
        this.setIcon(L.icon({
          iconUrl: `https://cdn-icons-png.flaticon.com/512/684/684908.png`,
          iconSize: [35,35],
          iconAnchor: [17,35],
          popupAnchor: [0,-35]
        }));
      });
      cluster.addLayer(m);
      markers.push(m);
    }

    if (features.length) {
      const bounds = L.latLngBounds(features.map(f => [f.lat, f.lon]));
      map.fitBounds(bounds.pad(0.1));
      setStatus(`Showing ${features.length} location(s).`);
    } else {
      map.setView([42.0987, -75.9180], 12);
      setStatus('Select filters to view locations.');
    }
  }

  // Start empty
  map.setView([42.0987, -75.9180], 12);
  setStatus('Select filters to view locations.');

  TYPE_FILTERS.addEventListener('change', refreshMarkers);
  SEARCH.addEventListener('input', () => {
    clearTimeout(window.__searchTimer);
    window.__searchTimer = setTimeout(refreshMarkers, 250);
  });

  // ⭐ ZIP input listener
  ZIP_INPUT.addEventListener('input', () => {
    clearTimeout(window.__zipTimer);
    window.__zipTimer = setTimeout(refreshMarkers, 300);
  });

  RESET.addEventListener('click', () => {
    SEARCH.value = '';
    ZIP_INPUT.value = ''; // ⭐ reset zip
    TYPE_FILTERS.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    refreshMarkers();
  });

  // Export filtered as GeoJSON
  EXPORT_BTN.addEventListener('click', () => {
    const activeTypes = new Set(Array.from(TYPE_FILTERS.querySelectorAll('input[type=checkbox]'))
      .filter(cb=>cb.checked)
      .map(cb=>cb.dataset.type.toString()));
    const query = (SEARCH.value || '').toLowerCase().trim();
    const zipQuery = (ZIP_INPUT.value || '').trim();
    const zipList = zipQuery.split(',').map(z => z.trim()).filter(Boolean);

    const filtered = rows.filter(row => {
      if (activeTypes.size && row.Type && !activeTypes.has(row.Type)) return false;
      if (query && !(row.Name || '').toLowerCase().includes(query)) return false;
      if (zipList.length && (!row.Zip || !zipList.includes(row.Zip.toString()))) return false;
      return row.latitude != null && row.longitude != null && row.latitude !== "" && row.longitude !== "";
    }).map(row => ({row, lat: Number(row.latitude), lon: Number(row.longitude)}));

    const gj = toGeoJSON(filtered);
    downloadJSON('filtered.geojson', gj);
  });
})();
