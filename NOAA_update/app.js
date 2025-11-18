// Endpoints
const forecastEndpoint = "https://api.weather.gov/gridpoints/BGM/64,56/forecast";
const alertEndpoint    = "https://api.weather.gov/alerts/active?zone=NYZ009";
const gridEndpoint     = "https://api.weather.gov/gridpoints/BGM/64,56";

let map, radarFrames = [], radarTimes = [], radarLayers = [], radarIndex = 0;

/* ===== Map + base (from upload #3) ===== */
function initMap(){
  map = L.map('radar-map', {
    center:[42.06,-75.97],
    zoom:10,
    zoomControl:false,
    attributionControl:false,
    dragging:false,
    scrollWheelZoom:false
  });
  const Stadia_AlidadeSatellite = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.{ext}', {
    minZoom:0, maxZoom:20, ext:'jpg'
  });
  Stadia_AlidadeSatellite.addTo(map);
}

/* ===== Timeline ===== */
function buildTimeline(){
  const track = document.getElementById("timeline-track");
  track.innerHTML = "";
  if(!radarFrames.length) return;
  const n = radarFrames.length;
  for(let i=0;i<n;i++){
    const tick = document.createElement("div");
    tick.className = "timeline-tick";
    tick.style.left = `${(i/(n-1))*100}%`;
    track.appendChild(tick);
  }
  const marker = document.createElement("div");
  marker.className = "timeline-marker";
  marker.id = "timeline-marker";
  marker.style.left = "0%";
  track.appendChild(marker);
}
function updateTimelineMarker(index){
  const marker = document.getElementById("timeline-marker");
  if(marker && radarFrames.length>1){
    marker.style.left = `${(index/(radarFrames.length-1))*100}%`;
  }
}

/* ===== Radar crossfade (from upload #1 timing) ===== */
async function loadRadarFrames(){
  const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
  const data = await res.json();
  radarFrames = data.radar.past.map(f=>f.path);
  radarTimes  = data.radar.past.map(f=>f.time);

  radarLayers.forEach(l=>map.removeLayer(l));
  radarLayers = [];
  radarFrames.forEach((path,i)=>{
    const layer = L.tileLayer(`https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`, {
      opacity: i===0 ? 0.6 : 0,
      zIndex: 10 + i
    });
    layer.addTo(map);
    radarLayers.push(layer);
  });
  radarIndex = 0;
  buildTimeline();
  animateRadarCrossfade();
}
function animateRadarCrossfade(){
  if(!radarLayers.length) return;
  const current   = radarLayers[radarIndex];
  const nextIndex = (radarIndex + 1) % radarLayers.length;
  const next      = radarLayers[nextIndex];

  let t=0; const duration=2000; const start=performance.now();
  updateTimestamp(radarTimes[nextIndex]);
  updateTimelineMarker(nextIndex);

  function step(now){
    t = (now-start)/duration; if(t>1) t=1;
    const eased = 0.5 - 0.5*Math.cos(Math.PI*t);
    current.setOpacity(0.6*(1-eased));
    next.setOpacity(0.6*eased);
    if(t<1){ requestAnimationFrame(step); }
    else { radarIndex = nextIndex; requestAnimationFrame(()=>animateRadarCrossfade()); }
  }
  requestAnimationFrame(step);
}
function updateTimestamp(unixTime){
  const d=new Date(unixTime*1000);
  document.getElementById("timestamp").textContent = d.toISOString().replace('T',' ').split('.')[0] + " UTC";
}

/* Refresh radar set every 10 minutes */
setInterval(loadRadarFrames, 10*60*1000);

/* ===== Forecast + Alerts (mix of #1 icons and #2 bottom panel) ===== */
async function fetchForecastAndAlerts(){
  const [fr, ar] = await Promise.all([
    fetch(forecastEndpoint, { headers: { "Accept": "application/geo+json" } }),
    fetch(alertEndpoint)
  ]);
  const fd = await fr.json();
  const ad = await ar.json();
  renderMain(fd, ad);
  renderForecast(fd);
}

function alertIcon(event){
  const e = event.toLowerCase();
  if(e.includes("wind"))     return "wi-strong-wind";
  if(e.includes("flood"))    return "wi-flood";
  if(e.includes("thunder"))  return "wi-thunderstorm";
  if(e.includes("snow"))     return "wi-snow";
  if(e.includes("heat"))     return "wi-hot";
  if(e.includes("tornado"))  return "wi-tornado";
  if(e.includes("fog"))      return "wi-fog";
  return "wi-warning";
}

function renderMain(fd, ad){
  const c = fd.properties.periods[0];
  const desc = c.shortForecast + ". " + c.detailedForecast;
  const formatted = desc.replace(/\. /g, ".\n");  // split by periods onto new lines
  document.getElementById("col-left").textContent = formatted;

  console.log( c );
  // Right column metrics (no labels, as per bottom panel example)
  const dirs={N:0,NNE:22,NE:45,ENE:67,E:90,ESE:112,SE:135,SSE:157,S:180,SSW:202,SW:225,WSW:247,W:270,WNW:292,NW:315,NNW:337};
  const ang = dirs[c.windDirection] || 0;
  document.getElementById("col-right").innerHTML = `
    <span><i class="wi wi-thermometer"></i><b>${c.temperature.toFixed(1)}°${c.temperatureUnit}</b></span>
    <span><i class="wi wi-wind from-${ang}-deg"></i>${c.windSpeed}</span>
    <span><i class="wi wi-raindrops"></i>${c.probabilityOfPrecipitation.value ?? 0}%</span>`;

  // Center column gets sidebar-derived extra metrics if available later
  if(window.__extraData){
    const ex = window.__extraData;
    document.getElementById("col-center").innerHTML = `
      <span><i class="wi wi-humidity"></i>Humidity: ${ex.RH ?? "N/A"}%</span>
      <span><i class="wi wi-barometer"></i>Pressure: ${ex.Pressure ?? "N/A"} hPa</span>
      <span><i class="wi wi-cloudy"></i>Sky: ${ex.Sky ?? "N/A"}%</span>
      <span><i class="wi wi-strong-wind"></i>Wind Gust: ${ex.Wgust ?? "N/A"} km/h</span>`;
  }

  const banner = document.getElementById("alert-banner");
  if(ad.features?.length>0){
    const a = ad.features[0].properties;
    const icon = alertIcon(a.event);
    banner.style.display = "block";
    banner.innerHTML = `⚠️ <i class="wi ${icon}"></i> ${a.event.toUpperCase()}: ${a.headline}`;
  } else {
    banner.style.display = "none";
  }
}

/* Forecast row with animated icons (from upload #1) */
function mapForecastToIcon(shortForecast, isDaytime=true){
  const s = shortForecast.toLowerCase();
  if (s.includes("thunder")) return { icon: "wi-thunderstorm",               anim: "animate-thunder" };
  if (s.includes("snow"))    return { icon: "wi-snow",                       anim: "animate-snow"    };
  if (s.includes("rain") || s.includes("showers"))
                             return { icon: "wi-rain",                       anim: "animate-rain"    };
  if (s.includes("cloudy"))  return { icon: "wi-cloudy",                     anim: "animate-cloud"   };
  if (s.includes("fog"))     return { icon: "wi-fog",                        anim: "animate-cloud"   };
  if (s.includes("clear"))   return { icon: isDaytime ? "wi-day-sunny" : "wi-night-clear", anim: "animate-sun" };
  return { icon: "wi-day-sunny-overcast", anim: "animate-cloud" };
}
function renderForecast(fd){
  const row = document.getElementById("forecast-row");
  row.innerHTML = "";
  fd.properties.periods.slice(1,4).forEach(period => {
    const { icon, anim } = mapForecastToIcon(period.shortForecast, period.isDaytime);
    const card = document.createElement("div");
    card.className = "forecast-card";
    card.innerHTML = `
      <h3>${period.name}</h3>
      <i class="wi ${icon} ${anim}"></i>
      <div><b>${period.temperature.toFixed(1)}°${period.temperatureUnit}</b></div>
      <div>${period.shortForecast}</div>
      <div><i class="wi wi-raindrops"></i> ${period.probabilityOfPrecipitation.value ?? 0}%</div>`;
    row.appendChild(card);
  });
}

/* ===== Sidebar metrics (from upload #3) ===== */
async function fetchGridpoints(){
  const r = await fetch(gridEndpoint, { headers: { "Accept":"application/geo+json" } });
  const g = await r.json();
  populateSideTab(g.properties);
  // also expose a subset for center column
  const p = g.properties;
  const RH = p.relativeHumidity?.values?.[0]?.value?.toFixed(0);
  const Pressure = (p.pressure?.values?.[0]?.value/100).toFixed(1);
  const Sky = p.skyCover?.values?.[0]?.value?.toFixed(0);
  const Wgust = p.windGust?.values?.[0]?.value?.toFixed(1);
  window.__extraData = { RH, Pressure, Sky, Wgust };
  // Update center column now that we have data
  const center = document.getElementById("col-center");
  center.innerHTML = `
    <span><i class="wi wi-humidity"></i>Humidity: ${RH ?? "N/A"}%</span>
    <span><i class="wi wi-barometer"></i>Pressure: ${Pressure ?? "N/A"} hPa</span>
    <span><i class="wi wi-cloudy"></i>Sky: ${Sky ?? "N/A"}%</span>
    <span><i class="wi wi-strong-wind"></i>Wind Gust: ${Wgust ?? "N/A"} km/h</span>`;
  // Fit sidebar after content renders
  requestAnimationFrame(()=>requestAnimationFrame(()=>fitSidebarToMap()));
}

function firstVal(o){ const a=o?.values||[]; for(let i=0;i<a.length;i++){ if(a[i].value!=null) return {value:a[i].value}; } return {value:null}; }
function toF(v,u){ if(v==null) return null; if(u && u.includes("degC")) return (v*9/5)+32; return v; }
function addRow(cont,icon,label,val,unit=""){ if(val==null) return; const div=document.createElement("div"); div.className="row"; div.innerHTML=`<i class="wi ${icon}"></i><span>${label}: <b>${val}${unit?" "+unit:""}</b></span>`; cont.appendChild(div); }
function addWindRow(cont,label,val){ if(val==null) return; const dir=Math.round(val); const div=document.createElement("div"); div.className="row"; div.innerHTML=`<i class="wi wi-wind from-${dir}-deg"></i><span>${label}: <b>${dir}°</b></span>`; cont.appendChild(div); }

function populateSideTab(p){

  console.log(p)
  const gT=document.getElementById("grp-temp"),
        gM=document.getElementById("grp-moist"),
        gW=document.getElementById("grp-wind"),
        gC=document.getElementById("grp-clouds"),
        gP=document.getElementById("grp-pressure");
  [gT,gM,gW,gC,gP].forEach(el=>el.innerHTML="");

  const T=firstVal(p.temperature), Td=firstVal(p.dewpoint), Ta=firstVal(p.apparentTemperature),
        Tmax=firstVal(p.maxTemperature), Tmin=firstVal(p.minTemperature);
        
  addRow(gT,"wi-thermometer","Temperature",      toF(T.value,   p.temperature?.uom)?.toFixed(1),"°F");
  addRow(gT,"wi-thermometer-exterior","Dew Point",toF(Td.value,  p.dewpoint?.uom)?.toFixed(1),"°F");
  addRow(gT,"wi-thermometer","Feels Like",        toF(Ta.value,  p.apparentTemperature?.uom)?.toFixed(1),"°F");
  addRow(gT,"wi-direction-up","Max Temperature",  toF(Tmax.value,p.maxTemperature?.uom)?.toFixed(1),"°F");
  addRow(gT,"wi-direction-down","Min Temperature",toF(Tmin.value,p.minTemperature?.uom)?.toFixed(1),"°F");

  const RH=firstVal(p.relativeHumidity), QPF=firstVal(p.quantitativePrecipitation), SN=firstVal(p.snowfallAmount), Ice=firstVal(p.iceAccumulation);
  addRow(gM,"wi-humidity","Relative Humidity", RH.value,"%");
  addRow(gM,"wi-raindrops","Precipitation",    QPF.value,"mm");
  addRow(gM,"wi-snow","Snowfall",              SN.value,"mm");
  addRow(gM,"wi-rain-mix","Ice Accumulation",  Ice.value,"mm");

  const Wspd=firstVal(p.windSpeed), Wgst=firstVal(p.windGust), Wdir=firstVal(p.windDirection),
        TrWspd=firstVal(p.transportWindSpeed), TrWdir=firstVal(p.transportWindDirection);
  addRow(gW,"wi-strong-wind","Wind Speed",               Wspd.value,"km/h");
  addRow(gW,"wi-windy","Wind Gust",                      Wgst.value,"km/h");
  addWindRow(gW,"Wind Direction",                        Wdir.value);
  addRow(gW,"wi-wind-beaufort-6","Transport Wind Speed", TrWspd.value,"km/h");
  addWindRow(gW,"Transport Wind Direction",              TrWdir.value);

  const Sky=firstVal(p.skyCover), Mix=firstVal(p.mixingHeight);
  const Wx = p.weather?.values?.[0]?.value?.[0]?.weather || "N/A";
  addRow(gC,"wi-cloudy","Sky Cover",    Sky.value,"%");
  addRow(gC,"wi-na","Weather Code",     Wx);
  addRow(gC,"wi-cloud","Mixing Height", Mix.value,"m");

  const P=firstVal(p.pressure);
  if(P.value!=null) addRow(gP,"wi-barometer","Pressure",(P.value/100).toFixed(1),"hPa");
}

/* Sidebar scaling */
function fitSidebarToMap(){
  const mapEl=document.getElementById("radar-map");
  const tab=document.getElementById("side-tab");
  if(!mapEl||!tab)return;
  const targetH=mapEl.clientHeight-20;
  let s=1.0;const minS=0.35;let safety=0;
  const ratio=targetH/tab.scrollHeight;
  s=Math.min(1,Math.max(minS,ratio*0.92));
  tab.style.setProperty('--s',s);
  while(tab.scrollHeight>targetH&&s>minS&&safety<30){
    s=Math.max(minS,s*0.94);
    tab.style.setProperty('--s',s);
    void tab.offsetHeight;safety++;
  }
}
window.addEventListener("resize",()=>requestAnimationFrame(fitSidebarToMap));

/* ===== Init ===== */
initMap();
loadRadarFrames();
fetchGridpoints().then(fetchForecastAndAlerts);
