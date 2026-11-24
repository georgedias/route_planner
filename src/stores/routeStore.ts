import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { along, length, lineString } from "@turf/turf";
import type { Position, RouteCheckpoint, RoutePlan } from "../types/route";
import { parseRouteFile } from "../services/routeFiles";

const demoCoordinates: Position[] = [
  [-92.25, 37.83],
  [-92.2, 37.87],
  [-92.14, 37.9],
  [-92.08, 37.91],
  [-92.02, 37.95],
  [-91.96, 37.98],
  [-91.9, 38.01],
  [-91.84, 38.04],
  [-91.78, 38.07],
  [-91.72, 38.1],
  [-91.66, 38.14],
  [-91.6, 38.17],
  [-91.54, 38.2],
  [-91.48, 38.23],
  [-91.42, 38.26],
  [-91.36, 38.29],
  [-91.3, 38.32],
  [-91.24, 38.35],
  [-91.18, 38.38],
  [-91.12, 38.41],
];

export const useRouteStore = defineStore("route", () => {
  const route = ref<RoutePlan>({
    id: "demo-route",
    name: "Ozark Century Challenge",
    source: "demo",
    coordinates: demoCoordinates,
    elevations: demoCoordinates.map(
      (_, i) =>
        210 +
        Math.round(95 * Math.abs(Math.sin(i * 1.4)) + 30 * Math.sin(i * 0.45)),
    ),
    distanceKm: 0,
    targetDistanceKm: 160,
    timeLimitMinutes: 600,
    averageSpeedKmh: 22.5,
    startTime: "07:00",
    checkpoints: [
      {
        id: "cp-1",
        type: "split",
        name: "Split 1",
        distanceKm: 40,
        restDurationMinutes: 0,
      },
      {
        id: "cp-2",
        type: "rest",
        name: "Convenience Store",
        distanceKm: 75,
        restDurationMinutes: 20,
      },
      {
        id: "cp-3",
        type: "split",
        name: "Split 2",
        distanceKm: 120,
        restDurationMinutes: 0,
      },
      {
        id: "cp-finish",
        type: "finish",
        name: "Finish",
        distanceKm: 160,
        restDurationMinutes: 0,
      },
    ],
  });
  const notice = ref(
    "Demo route loaded. Import a GPX or TCX file to plan your own ride.",
  );
  const error = ref("");
  const line = computed(() =>
    route.value.coordinates.length >= 2
      ? lineString(route.value.coordinates)
      : null,
  );
  const distanceKm = computed(() =>
    line.value ? length(line.value, { units: "kilometers" }) : 0,
  );
  const rideMinutes = computed(() =>
    route.value.averageSpeedKmh > 0
      ? (distanceKm.value / route.value.averageSpeedKmh) * 60
      : 0,
  );
  const restMinutes = computed(() =>
    route.value.checkpoints.reduce(
      (sum, cp) => sum + cp.restDurationMinutes,
      0,
    ),
  );
  const totalMinutes = computed(() => rideMinutes.value + restMinutes.value);
  const onTime = computed(
    () => totalMinutes.value <= route.value.timeLimitMinutes,
  );
  const distanceWithinTarget = computed(
    () => distanceKm.value <= route.value.targetDistanceKm + 0.5,
  );
  const withinConstraints = computed(
    () => onTime.value && distanceWithinTarget.value,
  );
  const remainingMinutes = computed(
    () => route.value.timeLimitMinutes - totalMinutes.value,
  );

  function pointAt(km: number): Position {
    if (!line.value) return [0, 0];
    const bounded = Math.max(0, Math.min(km, distanceKm.value));
    return along(line.value, bounded, { units: "kilometers" }).geometry
      .coordinates as Position;
  }
  function normalizeCheckpoints() {
    route.value.checkpoints = route.value.checkpoints
      .map((cp) => ({
        ...cp,
        distanceKm: Math.max(0, Math.min(cp.distanceKm, distanceKm.value)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    route.value.distanceKm = distanceKm.value;
  }
  function addCheckpoint(
    type: "split" | "rest" | "control",
    km = distanceKm.value * 0.5,
  ) {
    const count =
      route.value.checkpoints.filter((c) => c.type === type).length + 1;
    route.value.checkpoints.push({
      id: crypto.randomUUID(),
      type,
      name:
        type === "rest"
          ? `Rest Stop ${count}`
          : type === "control"
            ? `Control ${count}`
            : `Split ${count}`,
      distanceKm: Math.max(0, Math.min(km, distanceKm.value)),
      restDurationMinutes: type === "rest" ? 15 : 0,
    });
    normalizeCheckpoints();
  }
  function removeCheckpoint(id: string) {
    route.value.checkpoints = route.value.checkpoints.filter(
      (c) => c.id !== id,
    );
  }
  function updateCheckpoint(cp: RouteCheckpoint) {
    const i = route.value.checkpoints.findIndex((c) => c.id === cp.id);
    if (i >= 0) route.value.checkpoints[i] = { ...cp };
    normalizeCheckpoints();
  }
  async function importFile(file: File) {
    error.value = "";
    try {
      const parsed = await parseRouteFile(file);
      if (parsed.coordinates.length < 2)
        throw new Error(
          "The file contains fewer than two usable track points.",
        );
      route.value.name = parsed.name;
      route.value.source = parsed.source;
      route.value.coordinates = parsed.coordinates;
      route.value.elevations = parsed.elevations;
      route.value.checkpoints = [
        {
          id: crypto.randomUUID(),
          type: "finish",
          name: "Finish",
          distanceKm: length(lineString(parsed.coordinates), {
            units: "kilometers",
          }),
          restDurationMinutes: 0,
        },
      ];
      route.value.targetDistanceKm = Number(
        length(lineString(parsed.coordinates), { units: "kilometers" }).toFixed(
          1,
        ),
      );
      normalizeCheckpoints();
      notice.value = `Imported ${file.name} · ${distanceKm.value.toFixed(1)} km. Original track geometry preserved.`;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Unable to import this route.";
    }
  }
  function setNotice(message: string) {
    notice.value = message;
  }
  return {
    route,
    notice,
    error,
    line,
    distanceKm,
    rideMinutes,
    restMinutes,
    totalMinutes,
    onTime,
    distanceWithinTarget,
    withinConstraints,
    remainingMinutes,
    pointAt,
    addCheckpoint,
    removeCheckpoint,
    updateCheckpoint,
    importFile,
    setNotice,
  };
});
