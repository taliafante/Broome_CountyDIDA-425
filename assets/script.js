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
const DOWNLOAD = document.getElementById('downloadBtn');
const SCREENSHOT = document.getElementById('screenshotBtn');
const TYPE_FILTERS = document.getElementById('typeFilters');



// Map defaults
const DEFAULT_COORDS = [42.0987, -75.9180];
const DEFAULT_ZOOM = 12;
const ICON_URL = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

const blessingBoxIcon = L.icon({
  iconUrl: './Completed markers/blessing_box.png',
  iconSize: [38, 40],
  iconAnchor: [16, 32],
});

const communityMealsIcon = L.icon({
  iconUrl: './Completed markers/community_meals.png',
  iconSize: [38, 40],
  iconAnchor: [16, 32],
});

const foodPantryIcon = L.icon({
  iconUrl: './Completed markers/food_pantries.png',
  iconSize: [38, 40],
  iconAnchor: [16, 32],
});

const foodPantrySchoolIcon = L.icon({
  iconUrl: './Completed markers/food_pantryschool.png',
  iconSize: [38, 40],
  iconAnchor: [16, 32],
});

const mobileFoodPantryIcon = L.icon({
  iconUrl: './Completed markers/mobile_foodpantry.png',
  iconSize: [38, 40],
  iconAnchor: [16, 32],
});

const seniorCenterIcon = L.icon({
  iconUrl: './Completed markers/senior_center.png',
  iconSize: [38, 40],
  iconAnchor: [16, 32],
});

const shelterIcon = L.icon({
  iconUrl: './Completed markers/shelter.png',
  iconSize: [38, 40],
  iconAnchor: [16, 32],
});

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

// Build popup HTML
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

  const copyText = `
${row.Name || 'Community Location'}
Type: ${row.Type || 'N/A'}
Address: ${[row.Street, row.City, row.State, row.Zip].filter(Boolean).join(', ') || 'N/A'}
Hours: ${row['Hours of Operation'] || 'N/A'}
Contact: ${row['Phone'] || row['Email'] || 'N/A'}
`.trim();

  const infoHtml = info
    .filter(([_, v]) => v)
    .map(([k, v]) => `<div class="marker-meta"><b>${k}:</b> ${v}</div>`)
    .join('');

  const safeCopyData = encodeURIComponent(copyText);

  return `
    <div class="marker-title">${row.Name || ''}</div>
    ${infoHtml}
    <hr style="margin: 5px 0; border-top: 1px solid #ddd;">
    <button class="copy-btn" data-copy-text="${safeCopyData}" style="
        padding: 5px 10px; 
        background-color: #4CAF50; 
        color: white; 
        border: none; 
        border-radius: 4px; 
        cursor: pointer;
    ">Copy Info</button>
  `;
}

function copyToClipboard(text, buttonElement) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    
    document.body.appendChild(textarea);
    textarea.select();

    try {
        const successful = document.execCommand('copy');
        const originalText = buttonElement.textContent;

        if (successful) {
            buttonElement.textContent = 'Copied!';
            setTimeout(() => {
                buttonElement.textContent = originalText;
            }, 1000);
        } else {
            buttonElement.textContent = 'Copy Failed';
            setTimeout(() => {
                buttonElement.textContent = originalText;
            }, 1500);
        }
    } catch (err) {
        console.error('Unable to copy text: ', err);
    } finally {
        document.body.removeChild(textarea);
    }
}

function handleCopyClick(e) {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const encodedText = btn.dataset.copyText;
    const textToCopy = decodeURIComponent(encodedText);
    copyToClipboard(textToCopy, btn);
}

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


(async function main() {
  setStatus('Loading geocoded data…');
  const rows = await fetchJSON('./assets/data.geocoded.json');

  const typeIconURLs = {
  "Blessing Boxes": './icons/box.png',
  "Community Meals": './icons/community.png',
  "Food Pantries": './icons/food_pantry.png',
  "Food Pantries (School)": './icons/school.png',
  "Mobile Food Pantries": './icons/van.png',
  "Senior Centers": './icons/senior.png',
  "Shelters": './icons/shelter.png'
};

  const types = Array.from(new Set(rows.map(r => r.Type).filter(Boolean))).sort();

  let i = 0 ; 
types.forEach(t => {
  const id = `type_${t.replace(/\W+/g,'_')}`;

  const colors = ['#289237ff','#3a5ddbff','#24a0a0ff','#6e1788ff','#a11337ff','#d46e26ff','#d0ad14ff','#f032e6','#bcf60c']; 

  // create a container
  const contanier = document.createElement('div');
  contanier.id = id;
  contanier.classList.add('type-filter-item');
  contanier.style.color = colors[i];
  contanier.style.backgroundColor = i%2==0 ? '#f0f0f0' : '#ffffff';
  i++;


  // Create checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  //checkbox.id = id;
  checkbox.dataset.type = t;

  // Create icon image
  const img = document.createElement('img');
  img.src = typeIconURLs[t];  // make sure these exist in /icons folder
  img.style.width = '20px';
  img.style.height = '20px';
  img.style.marginRight = '5px';
  img.style.verticalAlign = 'middle';

  // Create label
  const label = document.createElement('label');
  label.style.display = 'flex';
  label.style.alignItems = 'center';
  label.style.marginBottom = '4px';


  label.appendChild(checkbox);
  label.appendChild(img);
  const textSpan = document.createElement('span');
  textSpan.textContent = t;
  textSpan.style.fontWeight = 'bold';   
  textSpan.style.marginLeft = '5px';    

  label.appendChild(textSpan);

  contanier.appendChild(label);

  TYPE_FILTERS.appendChild(contanier);
});

  const colors = ['#289237ff','#3a5ddbff','#24a0a0ff','#6e1788ff','#a11337ff','#d46e26ff','#d0ad14ff','#f032e6','#bcf60c']; 
  const typeColors = {}; 
  types.forEach((t,i) => typeColors[t] = colors[i % colors.length]);

  const map = L.map('map').setView(DEFAULT_COORDS, DEFAULT_ZOOM);

  const baseMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);


var Thunderforest_Neighbourhood = L.tileLayer('https://{s}.tile.thunderforest.com/neighbourhood/{z}/{x}/{y}{r}.png?apikey={apikey}', {
    attribution: '&copy; Thunderforest &copy; OpenStreetMap contributors',
    apikey: '<your apikey>',
    maxZoom: 22
});

var Stadia_AlidadeSmooth = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.{ext}', {
    minZoom: 0,
    maxZoom: 20,
    attribution: '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap',
    ext: 'png'
});

var OpenTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data &copy; OpenStreetMap contributors'
});

var Stadia_AlidadeSatellite = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.{ext}', {
	minZoom: 0,
	maxZoom: 20,
	attribution: '&copy; CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) | &copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	ext: 'jpg'
});

var Stadia_AlidadeSmoothDark = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.{ext}', {
	minZoom: 0,
	maxZoom: 20,
	attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	ext: 'png'
});

// Add your DEFAULT basemap:
Thunderforest_Neighbourhood.addTo(map);

// Basemap options for switching:
var baseMaps = {
    "Colored": Thunderforest_Neighbourhood,
    "Blank": Stadia_AlidadeSmooth,
    "Blank Dark": Stadia_AlidadeSmoothDark,
    "Topography": OpenTopoMap,
    "Satellite": Stadia_AlidadeSatellite
};

// Add clickable basemap layer control:
L.control.layers(baseMaps, null, {
    position: 'bottomright',
    collapsed: false
}).addTo(map);


  const cluster = L.markerClusterGroup({
  disableClusteringAtZoom: 13  
}).addTo(map);



  // Refresh marker display
  function refreshMarkers() {
    cluster.clearLayers();

    const filtered = filterRows(rows);
    const features = [];

    for (const row of filtered) {
      const lat = Number(row.latitude), lon = Number(row.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

      // pick correct icon
      let icon;
      switch(row.Type) {
        case "Blessing Boxes":
          icon = blessingBoxIcon;
          break;
        case "Community Meals":
          icon = communityMealsIcon;
          break;
        case "Food Pantries":
          icon = foodPantryIcon;
          break;
        case "Food Pantries (School)":
          icon = foodPantrySchoolIcon;
          break;
        case "Mobile Food Pantries":
          icon = mobileFoodPantryIcon;
          break;
        case "Senior Centers":
          icon = seniorCenterIcon;
          break;
        case "Shelters":
          icon = shelterIcon;
          break;
        default:
          icon = L.icon({
            iconUrl: ICON_URL,
            iconSize: [25, 25],
            iconAnchor: [12, 25],
            popupAnchor: [0, -25]
          });
      }


      const marker = L.marker([lat, lon], { icon });
      marker.bindPopup(buildPopup(row));
      marker.bindTooltip(row.Name || '', { direction: 'top' });


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

  TYPE_FILTERS.addEventListener('change', refreshMarkers);
  SEARCH.addEventListener('input', debounce(refreshMarkers, 250));
  ZIP_INPUT.addEventListener('input', debounce(refreshMarkers, 300));

  RESET.addEventListener('click', () => {
    SEARCH.value = '';
    ZIP_INPUT.value = '';
    TYPE_FILTERS.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    refreshMarkers();
  });

  const DOWNLOAD = document.getElementById('downloadBtn');

  if (DOWNLOAD) {
    DOWNLOAD.addEventListener('click', () => {
      const filteredRows = filterRows(rows);
      const geojsonData = toGeoJSON(filteredRows);
      downloadJSON('filtered_data.geojson', geojsonData);
    });
  }

  map.getContainer().addEventListener('click', handleCopyClick);

  SCREENSHOT.addEventListener('click', () => {
    const popup = document.querySelector('.leaflet-popup-pane');
    if (popup) popup.style.display = 'none';
    
    const controls = document.querySelector('header');
    if (controls) controls.style.display = 'none';

    const captureElement = document.body;

    html2canvas(captureElement, {
      logging: false, 
      useCORS: true, 
      scrollX: 0,
      scrollY: 0
    }).then(canvas => {
      const a = document.createElement('a');
      a.download = 'community_map_screenshot.png';
      a.href = canvas.toDataURL('image/png');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (popup) popup.style.display = 'block';
      if (controls) controls.style.display = 'block';
    });
  });

  map.setView(DEFAULT_COORDS, DEFAULT_ZOOM);
  setStatus('Select filters to view locations.');
})();
