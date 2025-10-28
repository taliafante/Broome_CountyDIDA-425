/* script.js — Leaflet map loading from pre-geocoded JSON
   - Loads ./assets/data.geocoded.json
   - Marker clustering, type filters, name search, ZIP filter
   - Export filtered features as GeoJSON
   - Beginner interactive enhancements added
*/
const STATUS = document.getElementById('status');
const SEARCH = document.getElementById('searchBox');
const ZIP_INPUT = document.getElementById('zipBox');
const RESET = document.getElementById('resetBtn');
const TYPE_FILTERS = document.getElementById('typeFilters');

// Map defaults
const DEFAULT_COORDS = [42.0987, -75.9180];
const DEFAULT_ZOOM = 12;
const ICON_URL = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

// Helper: update status text
function setStatus(msg) {
  STATUS.textContent = msg;
}

// Helper: fetch JSON safely
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch ${url}`);
  return r.json();
}

// Helper: debounce wrapper
function debounce(fn, delay = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// Helper: Build popup HTML
function buildPopup(row) {
  const info = [
    ['Type', row.Type],
    ['Address', [row.Street, row.City, row.State, row.Zip].filter(Boolean).join(', ')],
    ['Hours', row['Hours of Operation']],
    ['Area', row['Area Served']],
    ['Deliveries', row['Deliveries?']],
    ['Services', row['Additional Services Offered']],
    ['Drive Thru', row['Drive Thru?']],
    ['Contact', row['Contact']],
    ['Phone', row['Phone']],
    ['Email', row['Email']]
  ];

  return `
    <div class="marker-title">${row.Name || ''}</div>
    ${info
      .filter(([_, v]) => v)
      .map(([k, v]) => `<div class="marker-meta"><b>${k}:</b> ${v}</div>`)
      .join('')}
  `;
}

// Helper: convert filtered features to GeoJSON
function toGeoJSON(features) {
  return {
    type: "FeatureCollection",
    features: features.map(({ row }) => ({
      type: "Feature",
      geometry: row.longitude && row.latitude
        ? { type: "Point", coordinates: [Number(row.longitude), Number(row.latitude)] }
        : null,
      properties: { ...row }
    })).filter(f => f.geometry)
  };
}

// Helper: trigger download of JSON file
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Helper: apply active filters and return filtered rows
function filterRows(rows) {
  const activeTypes = new Set(
    [...TYPE_FILTERS.querySelectorAll('input[type=checkbox]')]
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.type)
  );
  const query = SEARCH.value.trim().toLowerCase();
  const zipList = ZIP_INPUT.value.split(',').map(z => z.trim()).filter(Boolean);

  return rows.filter(row => {
    if (activeTypes.size && !activeTypes.has(row.Type)) return false;
    if (query && !(row.Name || '').toLowerCase().includes(query)) return false;
    if (zipList.length && (!row.Zip || !zipList.includes(String(row.Zip)))) return false;
    return row.latitude && row.longitude;
  });
}

// Main execution
(async function main() {
  setStatus('Loading geocoded data…');
  const rows = await fetchJSON('./assets/data.geocoded.json');

  // Build filter checkboxes by Type
  const types = Array.from(new Set(rows.map(r => r.Type).filter(Boolean))).sort();
  const colors = ['#e6194b','#3cb44b','#ead23bff','#304cb2ff','#f58231','#911eb4','#1E90FF','#f032e6','#bcf60c'];
  const typeColors = {};
  types.forEach((t, i) => typeColors[t] = colors[i % colors.length]);

  types.forEach(t => {
    const id = `type_${t.replace(/\W+/g, '_')}`;
    const label = document.createElement('label');
    label.innerHTML = `
      <input type="checkbox" id="${id}" data-type="${t}" />
      <span style="color:${typeColors[t]}; font-weight:bold;">${t}</span>
    `;
    TYPE_FILTERS.appendChild(label);
  });

  // Initialize Leaflet map
  const map = L.map('map').setView(DEFAULT_COORDS, DEFAULT_ZOOM);

  // Base map
  const baseMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Marker cluster
  const cluster = L.markerClusterGroup().addTo(map);

  // Rain overlay (toggleable)
  const rainLayer = L.tileLayer(
    'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=dfc6b59b27674760d475b6984af8a621',
    { attribution: '&copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>', opacity: 0.8 }
  );

  // Layer control
  L.control.layers({ "OpenStreetMap": baseMap }, { "Rain": rainLayer }, { collapsed: false }).addTo(map);

  // Weather control (top-right)
  const weatherControl = L.control({ position: 'topright' });
  weatherControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'weather-box');
    div.style.background = 'white';
    div.style.padding = '6px 10px';
    div.style.borderRadius = '8px';
    div.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
    div.style.fontSize = '13px';
    div.innerHTML = 'Loading weather...';
    return div;
  };
  weatherControl.addTo(map);

  // --- WEATHER FORECAST FUNCTION ---
  async function fetchForecast(lat, lon) {
    const weatherDiv = document.querySelector('.weather-box');
    try {
      const pointResp = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
        headers: { 'User-Agent': 'my-map-app (email@example.com)' }
      });
      if (!pointResp.ok) throw new Error('Failed to fetch grid point');
      const pointData = await pointResp.json();

      const forecastURL = pointData.properties.forecast;
      if (!forecastURL) throw new Error('No forecast URL found');

      const forecastResp = await fetch(forecastURL, {
        headers: { 'User-Agent': 'my-map-app (email@example.com)' }
      });
      if (!forecastResp.ok) throw new Error('Failed to fetch forecast');
      const forecastData = await forecastResp.json();

      const current = forecastData.properties.periods[0];
      console.log('Current forecast:', current);

      // Update the weather control box
      weatherDiv.innerHTML = `${current.shortForecast}, ${current.temperature}°${current.temperatureUnit}`;
    } catch (err) {
      console.error('Weather forecast error:', err);
      weatherDiv.innerHTML = 'Unable to load weather';
    }
  }

  // Load forecast for default location by click
  map.on('click', e => {
    fetchForecast(e.latlng.lat, e.latlng.lng);
  });




  // Refresh marker display
  function refreshMarkers() {
    cluster.clearLayers();

    const filtered = filterRows(rows);
    const features = [];

    for (const row of filtered) {
      const lat = Number(row.latitude), lon = Number(row.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

      const icon = L.icon({
        iconUrl: ICON_URL,
        iconSize: [25, 25],
        iconAnchor: [12, 25],
        popupAnchor: [0, -25]
      });

      const marker = L.marker([lat, lon], { icon });
      marker.bindPopup(buildPopup(row));
      marker.bindTooltip(row.Name || '', { direction: 'top' });

      marker.on('click', () => {
        marker.setIcon(L.icon({
          iconUrl: ICON_URL,
          iconSize: [35, 35],
          iconAnchor: [17, 35],
          popupAnchor: [0, -35]
        }));
      });

      cluster.addLayer(marker);
      features.push({ lat, lon });
    }

    if (features.length) {
      const bounds = L.latLngBounds(features.map(f => [f.lat, f.lon]));
      map.fitBounds(bounds.pad(0.1));
      setStatus(`Showing ${features.length} location(s).`);
    } else {
      map.setView(DEFAULT_COORDS, DEFAULT_ZOOM);
      setStatus('Select filters to view locations.');
    }
  }

  // Debounced event listeners
  TYPE_FILTERS.addEventListener('change', refreshMarkers);
  SEARCH.addEventListener('input', debounce(refreshMarkers, 250));
  ZIP_INPUT.addEventListener('input', debounce(refreshMarkers, 300));

  // Reset all filters
  RESET.addEventListener('click', () => {
    SEARCH.value = '';
    ZIP_INPUT.value = '';
    TYPE_FILTERS.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    refreshMarkers();
  });

  // Initial UI state
  map.setView(DEFAULT_COORDS, DEFAULT_ZOOM);
  setStatus('Select filters to view locations.');
})();
