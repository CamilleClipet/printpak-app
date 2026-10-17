# Print Pak → native apps with Capacitor

Goal: ship Print Pak on the App Store and Google Play with reliable Bluetooth
printing (including on iOS, where Web Bluetooth doesn't exist), while keeping the
web/PWA build on GitHub Pages. The approach: wrap the existing Vite + React app
in Capacitor and replace only the browser APIs that don't work, or work badly,
inside a native WebView.

If the result isn't good enough (performance, look and feel), a full React Native
port is still possible later. See the last section for how this plan keeps that
option open.

## What changes and what doesn't

| Area | Today (`app/src`) | In the Capacitor app | Effort |
|---|---|---|---|
| Engine, protocol, stores, UI, SCSS, skins | Web code | **Unchanged** | None |
| BLE transport (`printer/bluetooth.ts`) | `navigator.bluetooth` | `@capacitor-community/bluetooth-le` (`BleClient`). It also has a web implementation on top of Web Bluetooth, so **one transport can serve web and native** | Medium |
| Import (`services/pickFiles.ts`, `<input type=file>`) | File input | Works in Capacitor WebViews; optionally `@capacitor/camera` for a native picker | Low (test) |
| Camera viewfinder (`useCamera`, `getUserMedia`) | `getUserMedia` | Works in Android WebView and iOS WKWebView (14.3+) once the native camera permissions are declared | Low (test) |
| Video recording (`MediaRecorder` + `canvas.captureStream`) | Web | Supported in recent WebViews, but codecs differ (MP4 on iOS) | Low–medium (test) |
| Export / save (`<a download>` in `VideoModal`, PNG export, `ExportSheet`) | Browser download | `<a download>` does **nothing** in a WebView. Use `@capacitor/filesystem` + `@capacitor/share`, and a media plugin to save to Photos/Gallery | Medium |
| Storage (`services/storage.ts`, localStorage) | localStorage | Works, but iOS can clear WebView storage under storage pressure. Move presets/settings to `@capacitor/preferences` | Low |
| Settings links (`services/urlState.ts`) | URL query string | Deep links via `@capacitor/app` `appUrlOpen` (custom scheme + universal/app links) | Low |
| Lyrics (`services/lrclib.ts`, `fetch`) | fetch | Works if lrclib sends CORS headers for the app's origin (`capacitor://localhost` / `https://localhost`); otherwise turn on `CapacitorHttp` | Low (test) |
| PWA (vite-plugin-pwa, service worker, `base: '/printpak-app/'`) | GitHub Pages | Not wanted in the app: disable the SW, use `base: './'` for native builds | Low |

---

## Phase 0 — Prepare the web app (no behavior change)

Steps
1. Add a platform layer, `src/platform/`, with small interfaces and a web
   implementation of each, so components never call these browser APIs directly:
   - `printerTransport`: `requestDevice / connect / disconnect / write(bytes) / onNotify / onDisconnect`
   - `saveFile(blob, name)` and `shareFile(blob, name)`: today's download/share code moves here (from `VideoModal.tsx` and the PNG export path)
   - `storage`: get/set JSON, wraps today's `services/storage.ts`
2. Move the transport-independent parts of `printer/bluetooth.ts` into shared code:
   pacing (`PACE_MS`), handling of the printer's pause/resume notification
   (`51 78 AE … 0x10/0x00`), progress reporting (`sendJob`). Only the raw
   GATT calls stay in the transport.
3. Add a fake-transport Vitest suite for `sendJob`: pause/resume is respected,
   progress rises steadily to 1, a disconnect mid-job throws a clean error,
   and the byte stream equals `encodeJob` output.
4. Make the Vite config build-target aware, e.g. `vite build --mode native`:
   - `base: './'` (not `/printpak-app/`)
   - `VitePWA` disabled (or `disable: true`) and no service worker registration
   - keep the current behavior for the GitHub Pages build.

What to test
- `npm test`, `npm run lint`, `npm run build`: all green, and the GitHub Pages deploy is unchanged.
- Manual regression on the web app: import, camera, export PNG, video, print over Web Bluetooth in Chrome (desktop + Android).
- `npm run build -- --mode native`, then `npx vite preview` of that output: it loads with relative asset paths and registers no service worker.

## Phase 1 — Add Capacitor, first boot on devices

Steps
1. In `app/`: `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`,
   `npx cap init "Print Pak" <bundle id>`. Choose the bundle id / applicationId now:
   it can't change after the first store release. Set `webDir: 'dist'`.
2. `npx cap add ios` and `npx cap add android`, then commit the `ios/` and `android/` folders.
3. Script: `"cap:sync": "vite build --mode native && cap sync"`.
4. Live reload for development: `npx cap run android -l --external` / `npx cap run ios -l --external`
   (point `server.url` at the Vite dev server; it already allows external hosts).
5. Native shell: `@capacitor/status-bar` and `@capacitor/splash-screen`. Generate icons and
   splash screens from `public/icon*.png` with `@capacitor/assets`. Lock portrait
   orientation in Xcode / `AndroidManifest.xml`. Handle the Android back button with `@capacitor/app`.
6. Safe areas: the app already uses `viewport-fit=cover`. Check that `env(safe-area-inset-*)`
   is applied to the title bar and the fixed bottom bar.

What to test
- The app launches on a real iPhone, a recent Android phone and an older Android phone (Android 8–10), plus emulators.
- All panels, skins, sliders and the bottom bar render as in mobile Safari/Chrome, with no notch, home-indicator or status-bar overlap.
- Android back button: closes overlays/modals first, then exits.
- Responsiveness: slider scrubbing and preview speed feel the same as in the mobile browser (Android System WebView is Chrome; iOS is WebKit, the same engine as Safari).

## Phase 2 — Bluetooth printing (the main reason for this work)

Steps
1. `npm i @capacitor-community/bluetooth-le`, `npx cap sync`.
2. Implement the native `printerTransport` with `BleClient`:
   - `BleClient.initialize({ androidNeverForLocation: true })`
   - `requestDevice({ namePrefix: 'X6', services: [af30 UUID], optionalServices: [ae30 UUID] })`.
     The plugin shows its own device chooser on iOS and Android, which matches today's UX.
     Note: today's code filters by name prefix **or** service, so check which filter the cat printers actually match.
   - `connect(deviceId, onDisconnect)`, `writeWithoutResponse(deviceId, ae30, ae01, DataView)`,
     `startNotifications(deviceId, ae30, ae02, cb)`. The callback receives a `DataView`, so feed it to the shared pause handler.
   - Remember the last `deviceId` (storage) and offer a one-tap reconnect.
   - Optionally use the plugin's web implementation for the web build too, so there's a single code path.
3. Permissions:
   - iOS `Info.plist`: `NSBluetoothAlwaysUsageDescription`.
   - Android `AndroidManifest.xml`: `BLUETOOTH_SCAN` (`usesPermissionFlags="neverForLocation"`), `BLUETOOTH_CONNECT`,
     plus the legacy `BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE_LOCATION` with `android:maxSdkVersion="30"`.
   - Handle Bluetooth being off (`BleClient.isEnabled`, `requestEnable` on Android, an explanation on iOS) and permission denied (`openAppSettings`).
4. `printerStore`: `status: 'unsupported'` should now only happen on browsers without Web Bluetooth (iOS Safari web build), never in the apps.
5. Keep the screen on during a print job (`@capacitor-community/keep-awake`). Decide what happens when the app goes to the background mid-print.
   Simplest: warn and let the job fail cleanly. Real background printing on iOS would need the `bluetooth-central` background mode, which you then have to justify to App Review.
6. Flow control: keep `PACE_MS` writes. If rows get lost on iOS, switch to `write` (with response) every N packets
   or tune pacing. Check the negotiated MTU on Android and make sure no packet goes over it.

What to test (real printer, both platforms)
- First run: permission prompt → chooser → connect → print the calibration chart (`services/calibrationChart.ts`).
- Prints match the web/Chrome print of the same image (compare with the golden byte stream from the fake-transport test, and visually).
- Long strip (≥ 2,000 rows), a 10-frame batch, every darkness level, a few algorithms.
- Failure cases: printer off or out of range at chooser, connect, and mid-print; paper out; Bluetooth turned off mid-print; permission denied then granted from Settings; app backgrounded or screen locked mid-print; two printers nearby; reconnect after the printer goes to sleep.
- OS versions: Android 10, 12+ (new BLE permission model) and the latest; iOS current and current−1.

## Phase 3 — Files, camera, video, storage, links

Steps
1. **Export**: native `saveFile/shareFile` with `@capacitor/filesystem` (write the PNG/MP4 to cache)
   + `@capacitor/share` (share sheet). Add "Save to Photos" with a media plugin
   (e.g. `@capacitor-community/media`) plus `NSPhotoLibraryAddUsageDescription`.
   Update `ExportSheet` copy: the browser-specific save instructions don't apply in the app.
2. **Import**: test the existing `<input type=file multiple accept=image/*>`. If the Android picker
   or HEIC handling is poor, swap in `@capacitor/camera` `pickImages` behind the same `pickFiles()` interface.
3. **Camera**: add `NSCameraUsageDescription` (and `NSMicrophoneUsageDescription` if video records audio)
   and the Android `CAMERA` (and `RECORD_AUDIO`) permissions. Check that `getUserMedia` prompts properly.
   The OS-camera fallback (`fileCamRef` + `capture` input in `CameraOverlay`) should keep working.
4. **Video**: test `MediaRecorder` mime selection (`services/videoRecording.ts`) on both platforms, then save/share through the new path.
5. **Storage**: back `storage` with `@capacitor/preferences` on native, with a one-time copy of existing localStorage keys.
6. **Deep links**: register a custom scheme (e.g. `printpak://`) and, optionally, universal links / Android App Links
   on the GitHub Pages domain (needs `apple-app-site-association` and `assetlinks.json`).
   On `appUrlOpen`, decode with `urlState`. Make "share settings" produce a link that works in the app and on the web.
7. **Lyrics**: test `lrclib.ts` from inside the app. If CORS blocks it, enable `CapacitorHttp` in `capacitor.config.ts`.

What to test
- Export: the PNG has exactly the printer's width in pixels (no OS rescaling); it appears in Photos/Gallery; sharing to Messages, Files and Drive works; a multi-frame export saves every frame.
- Import: JPEG, HEIC (iPhone), PNG with transparency, 48 MP photos, EXIF rotation, multi-select.
- Camera: front/back, permission denied → fallback, 5-minute viewfinder session (heat, memory), 50 captures without memory growth.
- Video: records, plays back in `VideoModal`, saves, and plays in the Photos app.
- Presets and settings survive app kill, reboot and app update.
- Deep links on cold start and while the app is running.
- Airplane mode: everything except lyrics search works.

## Phase 4 — CI, release builds, beta

Steps
1. CI (GitHub Actions): keep the Pages workflow. Add jobs for lint + tests + `cap sync`, an Android release build
   (`./gradlew bundleRelease`) and an iOS build on a macOS runner.
   For signing and upload, use **fastlane**, or a hosted service such as Ionic Appflow or Codemagic.
2. Signing: Android upload keystore (enroll in Play App Signing). iOS distribution certificate +
   provisioning profile (or fastlane `match`). Store all secrets in GitHub secrets, never in the repo.
3. Versioning: one source of truth (e.g. `package.json` version → `versionName`/`CFBundleShortVersionString`; CI run number → build number).
4. Live updates are optional (Capgo / Appflow). Note that store rules only allow pushing web-asset changes this way, not changes to the app's purpose.
5. Beta: TestFlight for iOS, Play Console internal testing then **closed testing** for Android.
6. Crash reporting: Sentry with its Capacitor SDK (JS errors + native crashes).
7. Optional automated tests: run the existing web e2e (Playwright) against the web build; native UI automation
   (Appium/Maestro) is optional at this size. Keep the manual printer checklist from Phase 2.

What to test
- Release builds (not just debug): Android R8/minification doesn't break plugins; iOS build passes App Store Connect validation.
- Installs from TestFlight and the Play testing track on clean devices: first-run permissions, print, export, and an upgrade from the previous beta that keeps presets.
- Play Console pre-launch report (automatic Firebase Test Lab run): no crashes, no accessibility blockers.

## Phase 5 — Store submission

Admin
- Apple Developer Program (paid yearly) and Google Play Console (one-time fee).
- **Personal Play accounts created after Nov 2023 must run a closed test with at least 12 testers opted in for 14 consecutive days before production access.** Start it as soon as Phase 2 works.
- Privacy policy (can be a page on the GitHub Pages site): images are processed on the device; only lyrics search queries go to lrclib.net; no accounts, no tracking.
- Apple: App Privacy label ("Data Not Collected", unless you add Sentry, then declare crash data), `ITSAppUsesNonExemptEncryption = false`, age rating, screenshots for 6.9"/6.5" iPhone (and iPad if you don't restrict it to iPhone).
- Google: Data safety form, content rating, target API level requirement for the current year, feature graphic + phone screenshots, AAB upload.

App Review risk (iOS, Guideline 4.2 "minimum functionality"): Apple can reject apps that are
just a website in a wrapper. Print Pak is offline-first, has no web UI chrome, and uses native
Bluetooth, camera, share and Photos, which are the arguments to make in the review notes.
Also include:
- a short video of a real print, since reviewers won't have the printer;
- a note that the app is fully usable without a printer (PNG/video export).

Steps
1. Fill in the store listings → submit the iOS build for review → promote Android from closed testing to production with a staged rollout (e.g. 20% → 100%).
2. After launch, watch crash reports and Play vitals (ANRs).

What to test
- The production build from each store on a clean device, plus the first-run permission flow one last time.

---

## Order and rough sizing (one developer, part time)

| Phase | Size | Notes |
|---|---|---|
| 0 Platform layer, native build mode | S | Keeps the web app as-is |
| 1 Capacitor shell, first boot | S | |
| 2 Native Bluetooth printing | M | Start the Play 14-day closed test once this works |
| 3 Files, camera, video, storage, links | M | |
| 4 CI, signing, beta | S–M | |
| 5 Store submission | S work, but calendar time | App Review + Play closed test |

## Main risks

1. **iOS BLE write flow control**: write-without-response can drop packets if the queue fills up. Mitigation: shared pacing plus pause handling, a fallback to writes with response, long-strip tests.
2. **Saving files inside a WebView**: every `<a download>` / blob-URL path must go through the platform layer, or exports will silently do nothing.
3. **WebView performance on older Android phones** (live viewfinder dithering, the video recorder). Mitigation: test early in Phase 1. If it's too slow, this is the signal to revisit the React Native plan.
4. **App Review 4.2**: covered by the native features and the review notes above.

## Keeping the React Native option open

The Phase 0 platform layer (`printerTransport`, `saveFile/shareFile`, `storage`) and the engine's
existing `CanvasFactory` (`engine/canvas.ts`) are the same seams a React Native port would need.
If you migrate later, the engine, `printer/protocol.ts`, the shared `sendJob` logic and the stores
carry over. Only the UI and these platform adapters would be rewritten.
