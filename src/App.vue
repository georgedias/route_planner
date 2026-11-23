<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import maplibregl, { type Map as MlMap, type GeoJSONSource } from 'maplibre-gl'
import { along, length, lineString, nearestPointOnLine } from '@turf/turf'
import { useRouteStore } from './stores/routeStore'
import { makeGpx } from './services/routeFiles'
import type { RouteCheckpoint } from './types/route'

const store = useRouteStore()
const mapEl = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const mapReady = ref(false)
const mapError = ref('')
let map: MlMap | null = null
const formatDuration = (mins: number) => `${Math.floor(Math.max(0, mins) / 60)}h ${Math.round(Math.max(0, mins) % 60)}m`
const formatClock = (mins: number) => { const [startHour,startMinute] = store.route.startTime.split(':').map(Number); const total = startHour * 60 + startMinute + mins; return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(Math.round(total) % 60).padStart(2,'0')}` }
const arrivalFor = (cp: RouteCheckpoint) => formatClock(cp.distanceKm / Math.max(store.route.averageSpeedKmh, .1) * 60 + store.route.checkpoints.filter(x => x.distanceKm < cp.distanceKm).reduce((s,x) => s + x.restDurationMinutes, 0))
const checkpointRows = computed(() => [...store.route.checkpoints].sort((a,b)=>a.distanceKm-b.distanceKm))
const elevationPath = computed(() => {
  const vals = store.route.elevations.filter((v): v is number => v !== null)
  if (vals.length < 2) return ''
  const min = Math.min(...vals), max = Math.max(...vals), range = Math.max(1,max-min)
  return vals.map((v,i) => `${i===0?'M':'L'} ${(i/(vals.length-1))*1000} ${150-((v-min)/range)*125}`).join(' ')
})
const elevationGain = computed(() => { let gain = 0; for(let i=1;i<store.route.elevations.length;i++){const a=store.route.elevations[i-1],b=store.route.elevations[i]; if(a!==null&&b!==null&&b>a) gain+=b-a} return Math.round(gain) })
const sourceLabel = computed(() => store.route.source === 'demo' ? 'DEMO ROUTE' : store.route.source.toUpperCase() + ' IMPORT')
const timeLimitHours = computed({ get: () => Number((store.route.timeLimitMinutes / 60).toFixed(2)), set: (v: number) => { store.route.timeLimitMinutes = Math.max(0.1, v) * 60 } })

function routeGeoJson() { return { type:'Feature' as const, properties:{}, geometry:{ type:'LineString' as const, coordinates:store.route.coordinates } } }
function checkpointGeoJson() {
  return { type:'FeatureCollection' as const, features:store.route.checkpoints.map(cp => ({ type:'Feature' as const, properties:{ id:cp.id, name:cp.name, type:cp.type, distance:cp.distanceKm }, geometry:{ type:'Point' as const, coordinates:store.pointAt(cp.distanceKm) } })) }
}
function refreshMap() {
  if (!map || !mapReady.value) return
  const routeSource = map.getSource('route-line') as GeoJSONSource | undefined
  const cpSource = map.getSource('route-checkpoints') as GeoJSONSource | undefined
  routeSource?.setData(routeGeoJson() as never); cpSource?.setData(checkpointGeoJson() as never)
}
function initMap() {
  if (!mapEl.value) return
  map = new maplibregl.Map({ container:mapEl.value, style:{ version:8, sources:{ osm:{ type:'raster', tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize:256, attribution:'© OpenStreetMap contributors' } }, layers:[{ id:'osm', type:'raster', source:'osm' }] }, center:store.route.coordinates[0], zoom:8.5, attributionControl:true })
  map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right')
  map.on('load', () => {
    if (!map) return
    map.addSource('route-line',{ type:'geojson', data:routeGeoJson() as never })
    map.addLayer({ id:'route-casing', type:'line', source:'route-line', paint:{'line-color':'#092b45','line-width':9,'line-opacity':.85} })
    map.addLayer({ id:'route-stroke', type:'line', source:'route-line', paint:{'line-color':'#168cf5','line-width':5,'line-opacity':.98} })
    map.addSource('route-checkpoints',{ type:'geojson', data:checkpointGeoJson() as never })
    map.addLayer({ id:'checkpoint-circles', type:'circle', source:'route-checkpoints', paint:{'circle-radius':9,'circle-color':['match',['get','type'],'rest','#f59e0b','control','#a78bfa','finish','#22c55e','#38bdf8'],'circle-stroke-width':3,'circle-stroke-color':'#fff'} })
    map.addLayer({ id:'checkpoint-labels', type:'symbol', source:'route-checkpoints', layout:{'text-field':['concat',['to-string',['round',['get','distance']]],' km · ',['get','name']],'text-offset':[0,1.7],'text-size':11,'text-anchor':'top','text-font':['Open Sans Bold','Arial Unicode MS Bold']}, paint:{'text-color':'#fff','text-halo-color':'#142334','text-halo-width':2} })
    map.on('click', e => {
      if (!map || store.route.coordinates.length < 2) return
      const nearest = nearestPointOnLine(lineString(store.route.coordinates), [e.lngLat.lng,e.lngLat.lat], {units:'kilometers'})
      const km = Number(nearest.properties.location?.toFixed(1) ?? 0)
      store.addCheckpoint('split', km); store.setNotice(`Split added at ${km.toFixed(1)} km. Existing route geometry was not changed.`)
    })
    const bounds = new maplibregl.LngLatBounds()
    store.route.coordinates.forEach(c=>bounds.extend(c))
    map.fitBounds(bounds,{padding:55,duration:0})
    mapReady.value = true
  })
  map.on('error', e => { if (String(e.error?.message || '').includes('tile')) mapError.value = 'Map tiles may be unavailable. Check your internet connection.' })
}
async function importSelected(e: Event) { const input=e.target as HTMLInputElement; const file=input.files?.[0]; if(file) { await store.importFile(file); if(!store.error){await nextTick(); fitRoute()} } input.value='' }
function fitRoute(){ if(!map||!store.route.coordinates.length)return; const b=new maplibregl.LngLatBounds();store.route.coordinates.forEach(c=>b.extend(c));map.fitBounds(b,{padding:65,duration:700});refreshMap() }
function exportGpx(){const content=makeGpx(store.route.name,store.route.coordinates,store.route.elevations);const blob=new Blob([content],{type:'application/gpx+xml'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${store.route.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.gpx`;a.click();URL.revokeObjectURL(url);store.setNotice('GPX export generated.')}
function editCheckpoint(cp:RouteCheckpoint){const name=window.prompt('Checkpoint name',cp.name);if(name===null)return;const distance=window.prompt('Distance from start (km)',String(cp.distanceKm));if(distance===null)return;const km=Number(distance);if(!name.trim()||!Number.isFinite(km)||km<0||km>store.distanceKm){store.error=`Enter a valid name and distance between 0 and ${store.distanceKm.toFixed(1)} km.`;return}let rest=cp.restDurationMinutes;if(cp.type==='rest'){const val=window.prompt('Rest duration (minutes)',String(rest));if(val===null)return;rest=Math.max(0,Number(val)||0)}store.updateCheckpoint({...cp,name:name.trim(),distanceKm:km,restDurationMinutes:rest});store.error=''}
watch(()=>[store.route.coordinates,store.route.checkpoints],refreshMap,{deep:true})
onMounted(()=>initMap())
onBeforeUnmount(()=>map?.remove())
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">⌁</div><div><strong>ENDURANCE</strong><span>ROUTE PLANNER</span></div></div>
      <nav><a class="active">⌖ Route Planner</a><a>▤ My Routes</a><a>↗ Ride with GPS</a><a>⚙ Settings</a></nav>
      <div class="profile"><span class="avatar">GP</span><span>Planner</span><span>⌄</span></div>
    </header>
    <main class="workspace">
      <aside class="sidebar panel">
        <div class="panel-heading"><span>⚙</span> Route configuration <small>{{ sourceLabel }}</small></div>
        <label>Route name<input v-model="store.route.name" /></label>
        <div class="two-fields"><label>Target distance (km)<input v-model.number="store.route.targetDistanceKm" type="number" min="1" /></label><label>Time limit (hours)<input v-model.number="timeLimitHours" type="number" min="0.1" max="48" step="0.5" /></label></div>
        <label>Average riding speed <div class="input-suffix"><input v-model.number="store.route.averageSpeedKmh" type="number" min="1" max="60" step="0.5"/><span>km/h</span></div></label>
        <label>Ride start time<input v-model="store.route.startTime" type="time" /></label>
        <div class="section-label">IMPORT / LOAD ROUTE</div>
        <div class="import-actions"><button @click="fileInput?.click()"><b>⇧</b>Upload GPX / TCX</button><button disabled title="Ride with GPS OAuth integration is planned for a later milestone"><b>↗</b>Ride with GPS</button></div>
        <input ref="fileInput" class="hidden" type="file" accept=".gpx,.tcx,application/gpx+xml,application/xml,text/xml" @change="importSelected" />
        <div class="section-title-row"><div class="section-label">CHECKPOINTS</div><span class="count-pill">{{ checkpointRows.length }}</span></div>
        <div class="legend"><span><i class="dot split"></i> Split</span><span><i class="dot rest"></i> Rest stop</span><span><i class="dot control"></i> Control</span></div>
        <div class="checkpoint-list">
          <div v-for="(cp,index) in checkpointRows" :key="cp.id" class="checkpoint-item">
            <span class="drag">⠿</span><i class="dot" :class="cp.type"></i>
            <div class="checkpoint-info"><strong>{{ cp.name }}</strong><small>{{ cp.distanceKm.toFixed(1) }} km · ETA {{ arrivalFor(cp) }}</small></div>
            <button class="icon-btn" title="Edit checkpoint" @click="editCheckpoint(cp)">✎</button><button class="icon-btn danger" title="Remove checkpoint" @click="store.removeCheckpoint(cp.id)" :disabled="cp.type==='finish'">×</button>
          </div>
        </div>
        <div class="add-actions"><button @click="store.addCheckpoint('split')">＋ Add split</button><button @click="store.addCheckpoint('rest')">＋ Rest stop</button></div>
        <div class="hint">Tip: click anywhere on the route map to place a split at the nearest point on the existing track.</div>
        <div class="sidebar-foot"><span>ROUTE GEOMETRY</span><strong>Preserve original roads</strong><small>Rerouting will be an optional future feature.</small></div>
      </aside>

      <section class="center-column">
        <div class="map-panel panel"><div ref="mapEl" class="map-canvas"></div><div v-if="!mapReady" class="map-loading">Loading route map…</div><div class="map-tag">⌖ {{ store.distanceKm.toFixed(1) }} KM ROUTE</div><div class="map-help">Click route to add a split</div></div>
        <div class="elevation-panel panel">
          <div class="panel-heading">⌁ Elevation profile <span class="muted">{{ elevationGain.toLocaleString() }} m estimated gain</span></div>
          <div v-if="elevationPath" class="elevation-chart"><svg viewBox="0 0 1000 180" preserveAspectRatio="none"><defs><linearGradient id="elevFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#36c98b" stop-opacity=".55"/><stop offset="100%" stop-color="#36c98b" stop-opacity=".02"/></linearGradient></defs><path :d="elevationPath+' L 1000 160 L 0 160 Z'" fill="url(#elevFill)"/><path :d="elevationPath" fill="none" stroke="#4cdb9a" stroke-width="4" vector-effect="non-scaling-stroke"/></svg><div class="chart-axis"><span>0 km</span><span>{{ (store.distanceKm*.25).toFixed(0) }} km</span><span>{{ (store.distanceKm*.5).toFixed(0) }} km</span><span>{{ (store.distanceKm*.75).toFixed(0) }} km</span><span>{{ store.distanceKm.toFixed(0) }} km</span></div></div>
          <div v-else class="empty-chart">Elevation data is not available in this route file.</div>
        </div>
        <div class="table-panel panel">
          <div class="panel-heading">Checkpoint details <span class="muted">{{ checkpointRows.length }} checkpoints</span></div>
          <div class="table-scroll"><table><thead><tr><th>TYPE</th><th>CHECKPOINT</th><th>DISTANCE</th><th>REST</th><th>EST. ARRIVAL</th><th></th></tr></thead><tbody><tr v-for="cp in checkpointRows" :key="cp.id"><td><i class="dot" :class="cp.type"></i></td><td>{{ cp.name }}</td><td>{{ cp.distanceKm.toFixed(1) }} km</td><td>{{ cp.restDurationMinutes ? cp.restDurationMinutes+' min' : '—' }}</td><td>{{ arrivalFor(cp) }}</td><td><button class="table-edit" @click="editCheckpoint(cp)">Edit</button></td></tr></tbody></table></div>
        </div>
      </section>

      <aside class="right-column">
        <div class="summary-panel panel"><div class="panel-heading">Route summary</div><div class="metric-grid"><div class="metric"><span>⌖</span><strong>{{ store.distanceKm.toFixed(1) }}<small> km</small></strong><label>ROUTE DISTANCE</label></div><div class="metric"><span>⌁</span><strong>{{ elevationGain.toLocaleString() }}<small> m</small></strong><label>ELEVATION GAIN</label></div><div class="metric"><span>◷</span><strong>{{ formatDuration(store.rideMinutes) }}</strong><label>EST. RIDE TIME</label></div><div class="metric"><span>☕</span><strong>{{ formatDuration(store.restMinutes) }}</strong><label>REST TIME</label></div></div>
          <div class="total-time"><span>Estimated elapsed time</span><strong>{{ formatDuration(store.totalMinutes) }}</strong></div>
          <div class="validation" :class="store.withinConstraints?'valid':'invalid'"><span>{{ store.withinConstraints?'✓':'!' }}</span><div><strong>{{ store.withinConstraints?'Plan meets limits':'Plan needs adjustment' }}</strong><small>{{ !store.distanceWithinTarget?'Route is '+(store.distanceKm-store.route.targetDistanceKm).toFixed(1)+' km over target':store.onTime?formatDuration(store.remainingMinutes)+' remaining time buffer':'Exceeds cutoff by '+formatDuration(-store.remainingMinutes) }}</small></div></div>
          <div class="limit-row"><span>Time limit</span><strong>{{ formatDuration(store.route.timeLimitMinutes) }}</strong></div><div class="progress-track"><div :style="{width:Math.min(100,store.totalMinutes/store.route.timeLimitMinutes*100)+'%'}" :class="store.onTime?'progress-ok':'progress-bad'"></div></div>
        </div>
        <div class="poi-panel panel"><div class="panel-heading">⌖ Rest stop discovery</div><p>Find amenities near your route.</p><label>Search radius<select><option>500 m</option><option selected>1 km</option><option>2 km</option><option>5 km</option></select></label><div class="poi-options"><label><input type="checkbox" checked/> Convenience stores</label><label><input type="checkbox" checked/> Gas stations</label><label><input type="checkbox" checked/> Cafés & restaurants</label><label><input type="checkbox"/> Public restrooms</label></div><button class="primary-btn" disabled title="POI search integration is planned for a later milestone">Find places along route</button><small class="integration-note">OpenStreetMap POI search planned for milestone 2.</small></div>
      </aside>
    </main>
    <footer class="bottom-bar"><div class="status"><span class="status-dot"></span>{{ store.error || store.notice }}</div><div class="footer-actions"><button @click="fitRoute">◎ Fit route</button><button @click="exportGpx">⇩ Export GPX</button><button class="primary-btn" @click="store.setNotice(store.withinConstraints?'Route validation passed. Distance and elapsed time are within configured limits.':!store.distanceWithinTarget?'Route validation failed: route exceeds the target distance.':'Route validation failed: estimated elapsed time exceeds the configured limit.')">✓ Validate route</button></div></footer>
    <div v-if="mapError" class="toast">{{ mapError }}</div>
  </div>
</template>
