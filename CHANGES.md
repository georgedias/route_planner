# Endurance Route Planner — Application Settings update

## Files in this update

Copy these files into the matching locations in your project, replacing the existing files where applicable:

- `apps/web/src/App.vue` — adds the Application Settings screen and navigation, preserves the map while Settings is open, resizes it when returning to Route Planner, and shows a pointer cursor on the Route Planner and Settings navigation items.
- `apps/web/src/stores/routeStore.ts` — uses application preferences for the initial demo route and as fallbacks when imported files lack planner settings.
- `apps/web/src/stores/settingsStore.ts` — new browser-local settings store.

No changes are required to `packages/shared/src/route.ts` or `apps/web/src/config/appConfig.ts`.

## Defaults

- Distance unit: miles
- Default average speed: 20 km/h (shown as 12.43 mph in Miles mode)
- Speed planning: Overall Average Speed
- Clock format: 12-hour

The speed preference is stored canonically in km/h. Changing the selected display unit converts the displayed speed without changing the underlying physical speed.

## Persistence and scope

Application preferences are saved in browser localStorage under `endurance-route-planner:app-settings:v1`. Changing application defaults does not mutate the currently loaded route. The defaults are used by the initial route and as fallbacks for imported files that do not contain the corresponding planner metadata.

This is browser-local persistence only; it does not add hosted account/database persistence.

## Apply and verify

1. Make a backup or commit your current project.
2. Copy the three files above into their matching paths.
3. From the project root, run:

   ```cmd
   npm run format
   npm run typecheck
   npm run build
   ```

4. Start the web app with `npm run dev:web` and test switching repeatedly between Route Planner and Settings. Confirm the map remains visible on return and the pointer cursor appears only over Route Planner and Settings. Also test saving across refresh, unit conversion, reset, and GPX/TCX imports with and without planner metadata.

The source files were prepared from the project files available in this conversation. The project build/typecheck has not been run here because the full local repository and its installed dependencies were not available in this workspace.
