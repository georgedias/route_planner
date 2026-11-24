<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import maplibregl, { type Map as MlMap, type GeoJSONSource } from "maplibre-gl";
import { lineString, nearestPointOnLine } from "@turf/turf";
import { useRouteStore } from "./stores/routeStore";
import { makeGpx } from "./services/routeFiles";
import type {
  DistanceUnit,
  RouteCheckpoint,
  CheckpointType,
} from "./types/route";

const store = useRouteStore();
const mapEl = ref<HTMLDivElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const mapReady = ref(false);
const mapError = ref("");
const editorOpen = ref(false);
const checkpointDraft = ref<RouteCheckpoint | null>(null);
let map: MlMap | null = null;
const unitLabel = computed(() => store.route.distanceUnit);
const speedLabel = computed(() =>
  store.route.distanceUnit === "mi" ? "mph" : "km/h",
);
const displayDistance = (km: number, digits = 1) =>
  store.fromKm(km).toFixed(digits);
const formatDuration = (mins: number) =>
  `${Math.floor(Math.max(0, mins) / 60)}h ${Math.round(Math.max(0, mins) % 60)}m`;
const formatClock = (mins: number) => {
  const [startHour, startMinute] = store.route.startTime.split(":").map(Number);
  const total = startHour * 60 + startMinute + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(Math.round(total) % 60).padStart(2, "0")}`;
};
const arrivalFor = (cp: RouteCheckpoint) => {
  const index = store.segmentRows.findIndex(
    (row) => row.checkpoint.id === cp.id,
  );
  const elapsed = store.segmentRows
    .slice(0, index + 1)
    .reduce(
      (sum, row) =>
        sum + row.ridingMinutes + row.checkpoint.restDurationMinutes,
      0,
    );
  return formatClock(elapsed);
};
const checkpointRows = computed(() => store.orderedCheckpoints);
const elevationPath = computed(() => {
  const vals = store.route.elevations.filter((v): v is number => v !== null);
  if (vals.length < 2) return "";
  const min = Math.min(...vals),
    max = Math.max(...vals),
    range = Math.max(1, max - min);
  return vals
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${(i / (vals.length - 1)) * 1000} ${150 - ((v - min) / range) * 125}`,
    )
    .join(" ");
});
const elevationGain = computed(() => {
  let gain = 0;
  for (let i = 1; i < store.route.elevations.length; i++) {
    const a = store.route.elevations[i - 1],
      b = store.route.elevations[i];
    if (a !== null && b !== null && b > a) gain += b - a;
  }
  return Math.round(gain);
});
const sourceLabel = computed(() =>
  store.route.source === "demo"
    ? "DEMO ROUTE"
    : store.route.source.toUpperCase() + " IMPORT",
);
const timeLimitHours = computed({
  get: () => Number((store.route.timeLimitMinutes / 60).toFixed(2)),
  set: (v: number) => {
    store.route.timeLimitMinutes = Math.max(0.1, v) * 60;
  },
});
const targetDistanceDisplay = computed({
  get: () => Number(displayDistance(store.route.targetDistanceKm, 2)),
  set: (v: number) => {
    if (Number.isFinite(v))
      store.route.targetDistanceKm = store.toKm(Math.max(0, v));
  },
});
const overallSpeedDisplay = computed({
  get: () =>
    store.route.speedMode === "split"
      ? store.speedFromKmh(store.elapsedAverageSpeedKmh)
      : store.speedFromKmh(store.route.averageSpeedKmh),
  set: (v: number) => {
    if (Number.isFinite(v) && v > 0)
      store.route.averageSpeedKmh = store.speedToKmh(v);
  },
});
const ridingSpeedDisplay = computed(() =>
  store.speedFromKmh(store.ridingAverageSpeedKmh).toFixed(1),
);
const elapsedSpeedDisplay = computed(() =>
  store.speedFromKmh(store.elapsedAverageSpeedKmh).toFixed(1),
);
const draftDistanceDisplay = computed({
  get: () =>
    checkpointDraft.value
      ? Number(displayDistance(checkpointDraft.value.distanceKm, 2))
      : 0,
  set: (v: number) => {
    if (checkpointDraft.value && Number.isFinite(v))
      checkpointDraft.value.distanceKm = store.toKm(Math.max(0, v));
  },
});
const draftSpeedDisplay = computed({
  get: () =>
    checkpointDraft.value
      ? Number(
          store
            .speedFromKmh(
              checkpointDraft.value.averageSpeedKmh ??
                store.route.averageSpeedKmh,
            )
            .toFixed(2),
        )
      : 0,
  set: (v: number) => {
    if (checkpointDraft.value && Number.isFinite(v))
      checkpointDraft.value.averageSpeedKmh = store.speedToKmh(
        Math.max(0.1, v),
      );
  },
});
function typeLabel(type: CheckpointType) {
  return type === "aid_station"
    ? "Aid Station (A)"
    : type === "rest"
      ? "Rest stop"
      : type === "finish"
        ? "Finish"
        : "Split";
}
function segmentSpeedFor(cp: RouteCheckpoint) {
  const row = store.segmentRows.find((item) => item.checkpoint.id === cp.id);
  return row
    ? `${store.speedFromKmh(row.speedKmh).toFixed(1)} ${speedLabel.value}`
    : "—";
}
function routeGeoJson() {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: store.route.coordinates,
    },
  };
}
function checkpointGeoJson() {
  return {
    type: "FeatureCollection" as const,
    features: store.route.checkpoints.map((cp) => ({
      type: "Feature" as const,
      properties: {
        id: cp.id,
        name: cp.name,
        type: cp.type,
        distance: store.fromKm(cp.distanceKm),
      },
      geometry: {
        type: "Point" as const,
        coordinates: store.pointAt(cp.distanceKm),
      },
    })),
  };
}
function refreshMap() {
  if (!map || !mapReady.value) return;
  const routeSource = map.getSource("route-line") as GeoJSONSource | undefined;
  const cpSource = map.getSource("route-checkpoints") as
    GeoJSONSource | undefined;
  routeSource?.setData(routeGeoJson() as never);
  cpSource?.setData(checkpointGeoJson() as never);
  if (map.getLayer("checkpoint-labels"))
    map.setLayoutProperty("checkpoint-labels", "text-field", [
      "concat",
      ["to-string", ["round", ["get", "distance"]]],
      " ",
      unitLabel.value,
      " · ",
      ["get", "name"],
    ]);
}
function initMap() {
  if (!mapEl.value) return;
  map = new maplibregl.Map({
    container: mapEl.value,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    },
    center: store.route.coordinates[0],
    zoom: 8.5,
    attributionControl: {},
  });
  map.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    "top-right",
  );
  map.on("load", () => {
    if (!map) return;
    map.addSource("route-line", {
      type: "geojson",
      data: routeGeoJson() as never,
    });
    map.addLayer({
      id: "route-casing",
      type: "line",
      source: "route-line",
      paint: { "line-color": "#092b45", "line-width": 9, "line-opacity": 0.85 },
    });
    map.addLayer({
      id: "route-stroke",
      type: "line",
      source: "route-line",
      paint: { "line-color": "#168cf5", "line-width": 5, "line-opacity": 0.98 },
    });
    map.addSource("route-checkpoints", {
      type: "geojson",
      data: checkpointGeoJson() as never,
    });
    map.addLayer({
      id: "checkpoint-circles",
      type: "circle",
      source: "route-checkpoints",
      paint: {
        "circle-radius": 9,
        "circle-color": [
          "match",
          ["get", "type"],
          "rest",
          "#f59e0b",
          "aid_station",
          "#a78bfa",
          "finish",
          "#22c55e",
          "#38bdf8",
        ],
        "circle-stroke-width": 3,
        "circle-stroke-color": "#fff",
      },
    });
    map.addLayer({
      id: "checkpoint-labels",
      type: "symbol",
      source: "route-checkpoints",
      layout: {
        "text-field": [
          "concat",
          ["to-string", ["round", ["get", "distance"]]],
          " ",
          unitLabel.value,
          " · ",
          ["get", "name"],
        ],
        "text-offset": [0, 1.7],
        "text-size": 11,
        "text-anchor": "top",
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#fff",
        "text-halo-color": "#142334",
        "text-halo-width": 2,
      },
    });
    map.on("click", (e) => {
      if (!map || store.route.coordinates.length < 2) return;
      const nearest = nearestPointOnLine(
        lineString(store.route.coordinates),
        [e.lngLat.lng, e.lngLat.lat],
        { units: "kilometers" },
      );
      const km = Number(nearest.properties.location?.toFixed(1) ?? 0);
      store.addCheckpoint("split", km);
      store.setNotice(
        `Split added at ${displayDistance(km)} ${unitLabel.value}. Existing route geometry was not changed.`,
      );
    });
    const bounds = new maplibregl.LngLatBounds();
    store.route.coordinates.forEach((c) => bounds.extend(c));
    map.fitBounds(bounds, { padding: 55, duration: 0 });
    mapReady.value = true;
  });
  map.on("error", (e) => {
    if (String(e.error?.message || "").includes("tile"))
      mapError.value =
        "Map tiles may be unavailable. Check your internet connection.";
  });
}
async function importSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await store.importFile(file);
    if (!store.error) {
      await nextTick();
      fitRoute();
    }
  }
  input.value = "";
}
function fitRoute() {
  if (!map || !store.route.coordinates.length) return;
  const b = new maplibregl.LngLatBounds();
  store.route.coordinates.forEach((c) => b.extend(c));
  map.fitBounds(b, { padding: 65, duration: 700 });
  refreshMap();
}
function exportGpx() {
  const content = makeGpx(
    store.route.name,
    store.route.coordinates,
    store.route.elevations,
  );
  const blob = new Blob([content], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${store.route.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
  store.setNotice("GPX export generated.");
}
function editCheckpoint(cp: RouteCheckpoint) {
  checkpointDraft.value = {
    ...cp,
    averageSpeedKmh: cp.averageSpeedKmh ?? store.route.averageSpeedKmh,
  };
  editorOpen.value = true;
  store.error = "";
}
function closeEditor() {
  editorOpen.value = false;
  checkpointDraft.value = null;
}
function saveCheckpoint() {
  const draft = checkpointDraft.value;
  if (!draft) return;
  if (
    !draft.name.trim() ||
    !Number.isFinite(draft.distanceKm) ||
    draft.distanceKm < 0 ||
    draft.distanceKm > store.distanceKm
  ) {
    store.error = `Enter a name and a distance between 0 and ${displayDistance(store.distanceKm)} ${unitLabel.value}.`;
    return;
  }
  if (
    !Number.isFinite(draft.restDurationMinutes) ||
    draft.restDurationMinutes < 0 ||
    !Number.isFinite(draft.averageSpeedKmh) ||
    (draft.averageSpeedKmh ?? 0) <= 0
  ) {
    store.error =
      "Enter a valid segment speed and a non-negative stop duration.";
    return;
  }
  const updated = { ...draft, name: draft.name.trim() };
  if (updated.type === "finish") updated.distanceKm = store.distanceKm;
  store.updateCheckpoint(updated);
  store.error = "";
  store.setNotice(`${typeLabel(updated.type)} “${updated.name}” updated.`);
  closeEditor();
}
function onCheckpointTypeChange(type: CheckpointType) {
  if (!checkpointDraft.value) return;
  checkpointDraft.value.type = type;
  if (type === "finish") {
    checkpointDraft.value.name = "Finish";
    checkpointDraft.value.distanceKm = store.distanceKm;
  } else if (
    type === "aid_station" &&
    !checkpointDraft.value.name.toLowerCase().includes("aid")
  )
    checkpointDraft.value.name = "Aid Station";
  else if (type === "rest" && checkpointDraft.value.restDurationMinutes === 0)
    checkpointDraft.value.restDurationMinutes = 15;
}
function onUnitChange(unit: DistanceUnit) {
  store.setDistanceUnit(unit);
}
watch(
  () => [
    store.route.coordinates,
    store.route.checkpoints,
    store.route.distanceUnit,
  ],
  refreshMap,
  { deep: true },
);
onMounted(() => initMap());
onBeforeUnmount(() => map?.remove());
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">⌁</div>
        <div><strong>ENDURANCE</strong><span>ROUTE PLANNER</span></div>
      </div>
      <nav>
        <a class="active">⌖ Route Planner</a><a>▤ My Routes</a
        ><a>↗ Ride with GPS</a><a>⚙ Settings</a>
      </nav>
      <div class="profile">
        <span class="avatar">GP</span><span>Planner</span><span>⌄</span>
      </div>
    </header>
    <main class="workspace">
      <aside class="sidebar panel">
        <div class="panel-heading">
          <span>⚙</span> Route configuration <small>{{ sourceLabel }}</small>
        </div>
        <label>Route name<input v-model="store.route.name" /></label>
        <div class="two-fields">
          <label
            >Target distance ({{ unitLabel }})<input
              v-model.number="targetDistanceDisplay"
              type="number"
              min="1"
              step="0.1" /></label
          ><label
            >Time limit (hours)<input
              v-model.number="timeLimitHours"
              type="number"
              min="0.1"
              max="48"
              step="0.5"
          /></label>
        </div>
        <div class="two-fields unit-speed-row">
          <label
            >Distance units<select
              :value="store.route.distanceUnit"
              @change="
                onUnitChange(
                  ($event.target as HTMLSelectElement).value as DistanceUnit,
                )
              "
            >
              <option value="km">Kilometres (km)</option>
              <option value="mi">Miles (mi)</option>
            </select></label
          ><label
            >Speed planning<select v-model="store.route.speedMode">
              <option value="overall">One overall speed</option>
              <option value="split">Speed for each segment</option>
            </select></label
          >
        </div>
        <label
          >{{
            store.route.speedMode === "split"
              ? "Calculated overall average speed (incl. stops)"
              : "Overall average riding speed"
          }}
          <div class="input-suffix">
            <input
              v-model.number="overallSpeedDisplay"
              type="number"
              min="0.1"
              max="100"
              step="0.1"
              :readonly="store.route.speedMode === 'split'"
            /><span>{{ speedLabel }}</span>
          </div></label
        >
        <div v-if="store.route.speedMode === 'split'" class="speed-summary">
          <span>Riding average (moving time)</span
          ><strong>{{ ridingSpeedDisplay }} {{ speedLabel }}</strong
          ><span>Elapsed average (incl. stops)</span
          ><strong>{{ elapsedSpeedDisplay }} {{ speedLabel }}</strong
          ><small
            >Set the segment speed in each checkpoint editor. The overall
            average recalculates automatically.</small
          >
        </div>
        <label
          >Ride start time<input v-model="store.route.startTime" type="time"
        /></label>
        <div class="section-label">IMPORT / LOAD ROUTE</div>
        <div class="import-actions">
          <button @click="fileInput?.click()"><b>⇧</b>Upload GPX / TCX</button
          ><button
            disabled
            title="Ride with GPS OAuth integration is planned for a later milestone"
          >
            <b>↗</b>Ride with GPS
          </button>
        </div>
        <input
          ref="fileInput"
          class="hidden"
          type="file"
          accept=".gpx,.tcx,application/gpx+xml,application/xml,text/xml"
          @change="importSelected"
        />
        <div class="section-title-row">
          <div class="section-label">CHECKPOINTS</div>
          <span class="count-pill">{{ checkpointRows.length }}</span>
        </div>
        <div class="legend">
          <span><i class="dot split"></i> Split</span
          ><span><i class="dot rest"></i> Rest stop</span
          ><span><i class="dot aid_station"></i> Aid station (A)</span>
        </div>
        <div class="checkpoint-list">
          <div
            v-for="(cp, index) in checkpointRows"
            :key="cp.id"
            class="checkpoint-item"
          >
            <span class="drag">⠿</span><i class="dot" :class="cp.type"></i>
            <div class="checkpoint-info">
              <strong>{{ cp.name }}</strong
              ><small
                >{{ displayDistance(cp.distanceKm) }} {{ unitLabel }} · ETA
                {{ arrivalFor(cp) }}</small
              >
            </div>
            <button
              class="icon-btn"
              title="Edit checkpoint"
              @click="editCheckpoint(cp)"
            >
              ✎</button
            ><button
              class="icon-btn danger"
              title="Remove checkpoint"
              @click="store.removeCheckpoint(cp.id)"
              :disabled="cp.type === 'finish'"
            >
              ×
            </button>
          </div>
        </div>
        <div class="add-actions">
          <button @click="store.addCheckpoint('split')">＋ Add split</button
          ><button @click="store.addCheckpoint('rest')">＋ Rest stop</button
          ><button
            class="wide-action"
            @click="store.addCheckpoint('aid_station')"
          >
            ＋ Aid Station (A)
          </button>
        </div>
        <div class="hint">
          Tip: click anywhere on the route map to place a split at the nearest
          point on the existing track.
        </div>
        <div class="sidebar-foot">
          <span>ROUTE GEOMETRY</span><strong>Preserve original roads</strong
          ><small>Rerouting will be an optional future feature.</small>
        </div>
      </aside>

      <section class="center-column">
        <div class="map-panel panel">
          <div ref="mapEl" class="map-canvas"></div>
          <div v-if="!mapReady" class="map-loading">Loading route map…</div>
          <div class="map-tag">
            ⌖ {{ displayDistance(store.distanceKm) }}
            {{ unitLabel.toUpperCase() }} ROUTE
          </div>
          <div class="map-help">Click route to add a split</div>
        </div>
        <div class="elevation-panel panel">
          <div class="panel-heading">
            ⌁ Elevation profile
            <span class="muted"
              >{{ elevationGain.toLocaleString() }} m estimated gain</span
            >
          </div>
          <div v-if="elevationPath" class="elevation-chart">
            <svg viewBox="0 0 1000 180" preserveAspectRatio="none">
              <defs>
                <linearGradient id="elevFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#36c98b" stop-opacity=".55" />
                  <stop offset="100%" stop-color="#36c98b" stop-opacity=".02" />
                </linearGradient>
              </defs>
              <path
                :d="elevationPath + ' L 1000 160 L 0 160 Z'"
                fill="url(#elevFill)"
              />
              <path
                :d="elevationPath"
                fill="none"
                stroke="#4cdb9a"
                stroke-width="4"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <div class="chart-axis">
              <span>0 {{ unitLabel }}</span
              ><span
                >{{ displayDistance(store.distanceKm * 0.25, 0) }}
                {{ unitLabel }}</span
              ><span
                >{{ displayDistance(store.distanceKm * 0.5, 0) }}
                {{ unitLabel }}</span
              ><span
                >{{ displayDistance(store.distanceKm * 0.75, 0) }}
                {{ unitLabel }}</span
              ><span
                >{{ displayDistance(store.distanceKm, 0) }}
                {{ unitLabel }}</span
              >
            </div>
          </div>
          <div v-else class="empty-chart">
            Elevation data is not available in this route file.
          </div>
        </div>
        <div class="table-panel panel">
          <div class="panel-heading">
            Checkpoint details
            <span class="muted">{{ checkpointRows.length }} checkpoints</span>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>TYPE</th>
                  <th>CHECKPOINT</th>
                  <th>DISTANCE</th>
                  <th>SEGMENT SPEED</th>
                  <th>STOP</th>
                  <th>EST. ARRIVAL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cp in checkpointRows" :key="cp.id">
                  <td><i class="dot" :class="cp.type"></i></td>
                  <td>{{ cp.name }}</td>
                  <td>{{ displayDistance(cp.distanceKm) }} {{ unitLabel }}</td>
                  <td>{{ segmentSpeedFor(cp) }}</td>
                  <td>
                    {{
                      cp.restDurationMinutes
                        ? cp.restDurationMinutes + " min"
                        : "—"
                    }}
                  </td>
                  <td>{{ arrivalFor(cp) }}</td>
                  <td>
                    <button class="table-edit" @click="editCheckpoint(cp)">
                      Edit
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <aside class="right-column">
        <div class="summary-panel panel">
          <div class="panel-heading">Route summary</div>
          <div class="metric-grid">
            <div class="metric">
              <span>⌖</span
              ><strong
                >{{ displayDistance(store.distanceKm)
                }}<small> {{ unitLabel }}</small></strong
              ><label>ROUTE DISTANCE</label>
            </div>
            <div class="metric">
              <span>⌁</span
              ><strong
                >{{ elevationGain.toLocaleString() }}<small> m</small></strong
              ><label>ELEVATION GAIN</label>
            </div>
            <div class="metric">
              <span>◷</span
              ><strong>{{ formatDuration(store.rideMinutes) }}</strong
              ><label>EST. RIDE TIME</label>
            </div>
            <div class="metric">
              <span>☕</span
              ><strong>{{ formatDuration(store.restMinutes) }}</strong
              ><label>STOP TIME</label>
            </div>
          </div>
          <div class="total-time">
            <span>Estimated elapsed time</span
            ><strong>{{ formatDuration(store.totalMinutes) }}</strong>
          </div>
          <div
            class="validation"
            :class="store.withinConstraints ? 'valid' : 'invalid'"
          >
            <span>{{ store.withinConstraints ? "✓" : "!" }}</span>
            <div>
              <strong>{{
                store.withinConstraints
                  ? "Plan meets limits"
                  : "Plan needs adjustment"
              }}</strong
              ><small>{{
                !store.distanceWithinTarget
                  ? "Route is " +
                    displayDistance(
                      store.distanceKm - store.route.targetDistanceKm,
                    ) +
                    " " +
                    unitLabel +
                    " over target"
                  : store.onTime
                    ? formatDuration(store.remainingMinutes) +
                      " remaining time buffer"
                    : "Exceeds cutoff by " +
                      formatDuration(-store.remainingMinutes)
              }}</small>
            </div>
          </div>
          <div class="limit-row">
            <span>Time limit</span
            ><strong>{{ formatDuration(store.route.timeLimitMinutes) }}</strong>
          </div>
          <div class="progress-track">
            <div
              :style="{
                width:
                  Math.min(
                    100,
                    (store.totalMinutes / store.route.timeLimitMinutes) * 100,
                  ) + '%',
              }"
              :class="store.onTime ? 'progress-ok' : 'progress-bad'"
            ></div>
          </div>
        </div>
        <div class="poi-panel panel">
          <div class="panel-heading">⌖ Rest stop discovery</div>
          <p>Find amenities near your route.</p>
          <label
            >Search radius<select>
              <option>500 m</option>
              <option selected>1 km</option>
              <option>2 km</option>
              <option>5 km</option>
            </select></label
          >
          <div class="poi-options">
            <label><input type="checkbox" checked /> Convenience stores</label
            ><label><input type="checkbox" checked /> Gas stations</label
            ><label><input type="checkbox" checked /> Cafés & restaurants</label
            ><label><input type="checkbox" /> Public restrooms</label>
          </div>
          <button
            class="primary-btn"
            disabled
            title="POI search integration is planned for a later milestone"
          >
            Find places along route</button
          ><small class="integration-note"
            >OpenStreetMap POI search planned for milestone 2.</small
          >
        </div>
      </aside>
    </main>
    <footer class="bottom-bar">
      <div class="status">
        <span class="status-dot"></span>{{ store.error || store.notice }}
      </div>
      <div class="footer-actions">
        <button @click="fitRoute">◎ Fit route</button
        ><button @click="exportGpx">⇩ Export GPX</button
        ><button
          class="primary-btn"
          @click="
            store.setNotice(
              store.withinConstraints
                ? 'Route validation passed. Distance and elapsed time are within configured limits.'
                : !store.distanceWithinTarget
                  ? 'Route validation failed: route exceeds the target distance.'
                  : 'Route validation failed: estimated elapsed time exceeds the configured limit.',
            )
          "
        >
          ✓ Validate route
        </button>
      </div>
    </footer>
    <div
      v-if="editorOpen && checkpointDraft"
      class="modal-backdrop"
      @click.self="closeEditor"
      @keydown.esc="closeEditor"
    >
      <section
        class="checkpoint-modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkpoint-editor-title"
      >
        <div class="modal-heading">
          <div>
            <span class="section-label">ROUTE PLANNING</span>
            <h2 id="checkpoint-editor-title">Edit checkpoint</h2>
            <p>Configure every planning value for this checkpoint.</p>
          </div>
          <button
            class="modal-close"
            aria-label="Close editor"
            @click="closeEditor"
          >
            ×
          </button>
        </div>
        <div class="modal-grid">
          <label
            >Checkpoint type<select
              :value="checkpointDraft.type"
              @change="
                onCheckpointTypeChange(
                  ($event.target as HTMLSelectElement).value as CheckpointType,
                )
              "
            >
              <option value="split">Split</option>
              <option value="rest">Rest stop</option>
              <option value="aid_station">Aid Station (A)</option>
              <option value="finish">Finish</option>
            </select></label
          >
          <label
            >Checkpoint name<input
              v-model="checkpointDraft.name"
              maxlength="80"
          /></label>
          <label
            >Distance from route start ({{ unitLabel }})<input
              v-model.number="draftDistanceDisplay"
              type="number"
              min="0"
              :max="displayDistance(store.distanceKm, 2)"
              step="0.1"
              :disabled="checkpointDraft.type === 'finish'"
          /></label>
          <label
            >Average speed for preceding segment ({{ speedLabel }})<input
              v-model.number="draftSpeedDisplay"
              type="number"
              min="0.1"
              max="100"
              step="0.1"
          /></label>
          <label
            >Stop duration (minutes)<input
              v-model.number="checkpointDraft.restDurationMinutes"
              type="number"
              min="0"
              max="1440"
              step="1"
          /></label>
          <div class="modal-field-note">
            <strong>How speed is applied</strong
            ><span
              >This speed applies from the previous checkpoint (or route start)
              to this checkpoint. Stop duration is added after arrival.</span
            >
          </div>
        </div>
        <div v-if="store.error" class="modal-error">{{ store.error }}</div>
        <div class="modal-actions">
          <button class="secondary-btn" @click="closeEditor">Cancel</button
          ><button class="primary-btn" @click="saveCheckpoint">
            Save checkpoint
          </button>
        </div>
      </section>
    </div>
    <div v-if="mapError" class="toast">{{ mapError }}</div>
  </div>
</template>
