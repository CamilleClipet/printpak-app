# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Native apps (Capacitor)

Capacitor 8 targets iOS and Android. Run `npm run cap:sync` to build the native web bundle (relative asset paths, no service worker) and sync it to both native projects. Open the projects with `npm run cap:ios` (Xcode) or `npm run cap:android` (Android Studio), then select a simulator/device and run the app. Alternatively use `npx cap run ios` or `npx cap run android` to build and deploy from the CLI. The iOS project uses Swift Package Manager (no CocoaPods install step). Android builds require JDK 21; for example, point `JAVA_HOME` at Android Studio's bundled JBR.

For live reload, start the Vite server and native runner together with `npm run dev -- --host 0.0.0.0` in one terminal and `npm run cap:live:ios` or `npm run cap:live:android` in another. The helper detects a LAN IPv4 address and invokes Capacitor's `cap run --live-reload --https`; override the detected address with `CAP_SERVER_HOST`. Keep the device and computer on the same network and trust/accept Vite's development certificate on the device if prompted. Live reload is development-only and is not checked into the Capacitor config.
