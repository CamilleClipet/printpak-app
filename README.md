# printpak

Printpak turns a photo (or a live camera shot) into a dithered black-and-white
image sized for a small thermal receipt printer, and lets you print/export it.
You pick a dithering algorithm (Floyd–Steinberg, Atkinson, Bayer, halftone,
ASCII/glyph art, a Game Boy Camera look, etc.), tune white point/contrast/glitch
effects, then export a PNG (or a batch of them stitched into one strip) ready
to send to the printer.

It's built as an installable PWA — "Add to Home Screen" on iOS/Android — and
is also packaged as native iOS/Android apps (see "Native apps" below). There
is no backend, and no image ever leaves the device: everything is computed
on the device.

## Project layout

```
archive/    the original single-file implementation (index.html + sw.js +
            manifest.json), kept for reference — no longer deployed
app/        the current app: a Vite + React + TypeScript rewrite
  src/
    engine/       pure dithering/image-processing functions, unit-tested
    components/   UI (React components + CSS Modules, one per component)
    state/        Zustand stores (tone/style settings, device/paper prefs,
                   the photo batch, presets, undo/redo, UI flags…)
    hooks/        camera, import, export, live preview, etc.
    services/     framework-free helpers (export pipeline, calibration
                   chart, URL-encoded settings links, storage…)
  ROADMAP.md  the gap-closing plan this rewrite has been following
```

Everything you'll actually work on day to day lives under `app/`.

## Prerequisites

You need [Node.js](https://nodejs.org/) (which comes with `npm`). If you
don't have it yet:

- **macOS**: `brew install node` (install [Homebrew](https://brew.sh) first if
  you don't have it), or download an installer from
  [nodejs.org](https://nodejs.org/).
- **Windows/Linux**: download an installer from
  [nodejs.org](https://nodejs.org/) — pick the current **LTS** version.

Check it worked:

```sh
node --version   # v20 or newer
npm --version
```

You'll also want [Git](https://git-scm.com/) to clone the repo, and a code
editor ([VS Code](https://code.visualstudio.com/) is a good default).

## Setting up the project

```sh
git clone git@github.com:CamilleClipet/printpak-app.git
cd printpak-app/app
npm install
```

`npm install` reads `app/package.json` and downloads every dependency (React,
Vite, TypeScript, etc.) into `app/node_modules/` — this can take a minute the
first time.

## Developing

From inside `app/`:

```sh
npm run dev
```

This starts a local dev server (usually at `http://localhost:5173/`) with hot
reload — edit a file under `src/` and the browser updates instantly. Leave
this running while you work.

A few things to know:

- **Camera access needs HTTPS (or `localhost`).** Testing on your own machine
  in a browser at `localhost` works fine. To test the camera (or anything
  else) on a *phone*, you need HTTPS there too — see "Testing on a phone"
  below.
- **Run the tests**: `npx vitest run` (or `npx vitest` to watch and re-run on
  change). These cover the dithering engine — the pure math, not the UI.
- **Type-check + production build locally**: `npm run build`. This is the
  same build the deploy workflow runs; useful to catch TypeScript errors
  before pushing.
- **Preview a production build**: `npm run build && npm run preview` — serves
  the actual built output, closer to what users will get than the dev server.

## Testing on a phone

Camera and video-recording features can't be exercised on a desktop browser
alone — you'll want to load the dev server on an actual phone at some point.
The dev server already has a self-signed HTTPS certificate configured
(`@vitejs/plugin-basic-ssl` in `app/vite.config.ts`), so the simplest way is
over your local Wi-Fi, no external service needed:

1. Make sure your phone and computer are on the **same Wi-Fi network**.
2. From `app/`, run:
   ```sh
   npm run dev -- --host
   ```
3. Vite prints several `Network:` URLs, one per network interface on your
   computer — pick the one for your actual Wi-Fi adapter (commonly named
   `en0` on macOS). Ignore any `bridge*`/`utun*`/VPN-looking addresses; your
   phone can't reach those.
4. Open that `https://<lan-ip>:5173/` URL on your phone. The browser will
   warn about the self-signed certificate — this is expected (there's no
   real certificate authority behind it), tap through it once: "Advanced →
   Proceed" (Android/Chrome) or "Show Details → visit this website" (iOS
   Safari).

If your phone can't reach your computer over Wi-Fi (e.g. client-isolated
guest networks, or you're not on the same network at all), a tunnel is the
fallback — `npx cloudflared tunnel --url https://localhost:5173 --no-tls-verify` or
`npx localtunnel --port 5173`, no signup needed for either. Use the address cloudflared prints in your terminal a few seconds after it starts. It's in a box like this:
Your quick Tunnel has been created! Visit it at:
https://some-random-words.trycloudflare.com

This adds a third-party relay in the middle, though, so it's less reliable than the
same-Wi-Fi method above (it's also the reason the dev server has
`server.allowedHosts: true` in `vite.config.ts` — otherwise Vite rejects
requests carrying a tunnel's hostname).

## Native apps (iOS and Android)

The same code is also packaged as an iOS and an Android app with
[Capacitor](https://capacitorjs.com/). The native projects live in
`app/ios/` and `app/android/`. Inside the apps, printing uses native
Bluetooth, so Bluefy isn't needed. Plan and known issues:
`MOBILE_MIGRATION.md`.

### One-time setup

- **iOS**: install **Xcode** from the Mac App Store, open it once and accept
  the extra components it offers to install. In **Xcode → Settings →
  Accounts**, add your Apple ID. A free account is enough to run the app on
  your own iPhone.
- **Android**: install [Android Studio](https://developer.android.com/studio).
  On first launch, let the setup wizard install the Android SDK. Android
  builds need **JDK 21**: Android Studio ships one (its "JBR"). Add this
  line to `~/.zshrc`, then open a new terminal:
  ```sh
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  ```

### The loop: build, sync, run

The native apps don't use the dev server: they contain a copy of the built
web app. **After every change under `src/`**, from `app/`:

```sh
npm run cap:sync
```

This builds the web app for the native apps (`npm run build:native`) and
copies it into both native projects. Then run the app from Xcode or Android
Studio (see below). Skipping this step means the phone runs the previous
version.

`cap:sync` writes the native build into `app/dist/`. Run `npm run build`
afterwards if you want `dist/` to contain the website build again (with
the service worker), for example before `npm run preview`.

### Testing with Xcode (iPhone or simulator)

1. From `app/`, run `npm run cap:sync`, then `npm run cap:ios`.
   Xcode opens `ios/App/App.xcodeproj`. The project uses Swift Package
   Manager, so there is no `.xcworkspace` and no `pod install`.
2. Wait until the status box in the middle of the toolbar no longer says
   "Resolving Package Graph…" or "Fetching…".
3. **First time only, signing:** in the left sidebar click **App** (blue
   icon) → target **App** → **Signing & Capabilities**. Tick "Automatically
   manage signing" and pick your **Team** (your Apple ID).
4. In the device menu at the top ("App > …"), pick your iPhone (plugged in
   by USB, or on the same Wi-Fi once paired) or a simulator such as
   "iPhone 16".
5. Press **▶** (⌘R).
6. **First time on a real iPhone:**
   - If Xcode asks for it, turn on **Settings → Privacy & Security →
     Developer Mode** on the iPhone. The iPhone restarts.
   - With a free account, the first launch is blocked until you trust
     yourself as a developer: **Settings → General → VPN & Device
     Management** → your Apple ID → **Trust**. Then press ▶ again.
   - Allow Bluetooth and Camera when the app asks.

The simulator has no Bluetooth and no camera. Use it for layout only, and
a real iPhone for printing and the camera. Apps signed with a free account
stop opening after 7 days. Press ▶ again to reinstall.

**Console logs (Web Inspector):** on the iPhone, turn on **Settings → Apps
→ Safari → Advanced → Web Inspector**. On the Mac, in Safari, turn on
**Settings → Advanced → Show features for web developers**. While the app
runs, choose **Develop → *your iPhone* → localhost** in Safari to get the
console, network and elements panels. The bottom panel in Xcode shows
native logs and crash reasons.

**If the build fails with package or "missing module" errors**, typically
after `npm install`/`npm ci`: in Xcode, choose **File → Packages → Reset
Package Caches**, then **Product → Clean Build Folder** (⇧⌘K), then ▶.
If that's not enough, quit Xcode and run
`rm -rf ~/Library/Developer/Xcode/DerivedData/App-*`, then
`npm run cap:sync && npm run cap:ios`.

**"No signing certificate" / "0 valid identities":** in **Xcode → Settings
→ Accounts**, select your Apple ID → **Manage Certificates…** → **+** →
**Apple Development**.

### Testing with Android Studio (emulator or phone)

1. From `app/`, run `npm run cap:sync`, then `npm run cap:android`.
   Android Studio opens the `android/` folder.
2. Wait for the **Gradle sync** to finish (progress bar at the bottom right).
   The first time it downloads a lot and can take several minutes.
3. **First time only, emulator:** open **Device Manager** (phone icon on the
   right side bar, or **Tools → Device Manager**) → **+** → **Create Virtual
   Device**. Pick for example **Pixel 8a**, choose a recent system image
   (download it), then **Finish**.
4. In the device menu at the top, pick the emulator (or a real phone), then
   press **▶ Run 'app'**.

You can also skip the IDE: `npx cap run android` builds and asks which
device to install on.

The emulator has no Bluetooth, and its camera shows a fake 3D scene. It's
fine for layout, import, export and the back button, but printing needs a
real Android phone.

**Real Android phone:** on the phone, open **Settings → About phone** and
tap **Build number** 7 times to unlock developer options. Then turn on
**Settings → System → Developer options → USB debugging**. Plug it in,
accept the "Allow USB debugging?" prompt, and it appears in the device menu.

**Console logs:** with the app running, open `chrome://inspect` in Chrome
on the Mac and click **inspect** under the app's WebView. Android Studio's
**Logcat** tab (bottom) shows native logs and crashes.

**If Gradle complains about the Java version**, check that `JAVA_HOME`
points to Android Studio's JDK (see one-time setup), or set
`org.gradle.java.home` to the same path in `~/.gradle/gradle.properties`.
To check a build from the terminal: `cd android && ./gradlew assembleDebug`.

### Live reload (optional)

To see changes on the device without running `cap:sync` each time, run
these in two terminals from `app/`:

```sh
npm run dev -- --host 0.0.0.0
npm run cap:live:ios      # or: npm run cap:live:android
```

The app then loads from the dev server on your Mac over Wi-Fi, so the
phone and the Mac must be on the same network. Accept the development
certificate if the phone asks. If the wrong network address is detected,
set it yourself: `CAP_SERVER_HOST=192.168.1.20 npm run cap:live:ios`.
Run `npm run cap:sync` and ▶ afterwards to go back to a normal build, which
doesn't need the Mac.

## Deploying

The live site is <https://camilleclipet.github.io/printpak-app/> (GitHub Pages).

Deployment is automatic: pushing to `main` (with changes under `app/`)
triggers `.github/workflows/deploy.yml`, which installs dependencies, runs
the test suite, builds the app, and publishes `app/dist` to GitHub Pages.
You don't need to build or deploy anything by hand — just merge your PR into
`main` and the workflow does the rest. You can also trigger it manually from
the **Actions** tab on GitHub ("Deploy to GitHub Pages" → *Run workflow*).

If you ever need to reproduce exactly what the workflow does, locally:

```sh
cd app
npm ci        # like `npm install`, but exact/reproducible from the lockfile
npx vitest run
npm run build # outputs to app/dist/
```

## Printing

With a compatible thermall paper printer ([example](https://www.amazon.fr/eSynic-Imprimante-85%C3%9783%C3%9740mm-Impression-Autocollante/dp/B0FXWDRT99?th=1)): if you're on iOs, open the app url in [Bluefy app](https://bluefy.app/) - on Android it works as is. The native iOS/Android apps print directly, no extra app needed. Connect to the printer, pick the darkness, and print.

### One-time repo setup (already done, noted for reference)

For the workflow to be allowed to publish, the repo's **Settings → Pages**
must have "Build and deployment" → **Source** set to **"GitHub Actions"**
(not "Deploy from a branch"). If Pages ever starts serving a stale/blank
page after a deploy, that setting is the first thing to check.

## Why a rewrite?

The `archive/` folder holds the original implementation: one 114 KB
`index.html` with no build tooling, all CSS/DOM/JS inline. It worked, but was
hard to maintain and test. `app/` is a from-scratch rewrite in React +
TypeScript that keeps the same visual language and feature set (see
`app/ROADMAP.md` for the point-by-point porting plan) while making the
codebase something you can actually navigate, type-check, and unit-test.
