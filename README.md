# Quickstart Chrome Extension

A quickstart template for building Chrome extensions with modern tooling, AI-powered skills, and a great developer experience.


## Architecture overview

A Chrome extension has up to 5 execution contexts that communicate via message passing:

```
┌──────────────────────────────────────────────────────────┐
│ Extension Process                                        │
│  ┌─────────────────┐  ┌───────┐  ┌─────────┐  ┌──────┐ │
│  │ Service Worker   │  │ Popup │  │ Options │  │ Side │ │
│  │ (background)     │  │       │  │  Page   │  │Panel │ │
│  │ - No DOM         │  │ Full  │  │  Full   │  │ Full │ │
│  │ - Ephemeral      │  │ DOM   │  │  DOM    │  │ DOM  │ │
│  │ - All chrome.*   │  │ All   │  │  All    │  │ All  │ │
│  │   APIs           │  │ APIs  │  │  APIs   │  │ APIs │ │
│  └────────┬─────────┘  └───┬───┘  └────┬────┘  └──┬───┘ │
│           │ chrome.runtime.sendMessage / connect   │     │
└───────────┼────────────────┼───────────┼──────────┼──────┘
            │                │           │          │
    chrome.tabs.sendMessage  │           │          │
            │                │           │          │
┌───────────┼────────────────┼───────────┼──────────┼──────┐
│ Web Page  ▼                                              │
│  ┌──────────────────┐    ┌──────────────────┐            │
│  │ Content Script    │    │ Main World Script │            │
│  │ (isolated world)  │◄──►│ (page context)    │            │
│  │ - Shared DOM      │    │ - Shared DOM      │            │
│  │ - Own JS scope    │    │ - Page JS scope   │            │
│  │ - chrome.runtime  │    │ - No chrome.* API │            │
│  │ - chrome.storage  │    │ - Full page access│            │
│  │ - Subject to CSP  │    │ - Subject to CSP  │            │
│  │   (network only)  │    │   (fully)         │            │
│  └──────────────────┘    └──────────────────┘            │
│           ▲ window.postMessage                           │
│           │ (through shared DOM)                         │
└──────────────────────────────────────────────────────────┘
```

### Key architectural rules

1. **Service worker is ephemeral.** All state must be persisted to chrome.storage. All event listeners must be registered synchronously at the top level. Never use setTimeout/setInterval for anything beyond a few seconds.

2. **Content scripts run in the page's origin.** Network requests from content scripts are subject to the page's CSP and CORS. To bypass, relay through the service worker.

3. **Content scripts use an isolated JavaScript world.** They share the DOM with the page but
   not its JS scope (no access to page globals or variables in page scripts). Interop with
   page code uses `window.postMessage`, a main-world injection, or `scripting` with
   `world: "MAIN"` when appropriate.

4. **Messaging is the backbone.** Every cross-context interaction uses chrome.runtime messaging.
   The #1 bug: forgetting to `return true` from async message listeners.

5. **Popup is destroyed on blur.** Side panel persists. Choose based on interaction duration.

6. **Options page is another full extension UI surface.** Like the popup and side panel it has
   full DOM and `chrome.*` APIs, but opens as a normal tab from the extensions menu—plan
   lifecycle and settings sync (usually `chrome.storage`) the same way as other UIs.

## Getting started with CRXJS

### 1. Install skills

Install the two recommended skills:

```bash
# very good general purpose skills:
npx skills add https://github.com/pproenca/dot-skills --skill chrome-extension
npx skills add https://github.com/pproenca/dot-skills --skill chrome-extension-ui

# for communication between browser execution context:
npx skills add https://github.com/samber/cc-skills --skill chrome-extension
# for crxjs:
npx skills add https://github.com/samber/cc-skills --skill crxjs
```

### 2. Scaffold the project

Use your AI coding agent (Claude Code, Codex, Cursor, etc.) with the installed skills to scaffold and build your extension.

Choose a frontend framework like Svelte, React, etc.

## Recommended: use CRXJS

We strongly recommend using [CRXJS](https://crxjs.dev/vite-plugin) as the build tool for your Chrome extension. CRXJS is a Vite plugin that supercharges Chrome extension development:

- **Hot Module Replacement (HMR)** — See your changes instantly in the browser without manually reloading the extension. This alone saves a massive amount of time during development.
- **Vite-powered** — Enjoy Vite's blazing-fast build times, native ES modules, and rich plugin ecosystem.
- **Manifest-driven** — Write a standard `manifest.json` and CRXJS handles the rest. No boilerplate Webpack config, no custom loaders.
- **Framework-friendly** — Works seamlessly with React, Vue, Svelte, or vanilla JS/TS.
- **First-class TypeScript support** — Zero extra configuration needed.
- **Automatic permission handling** — CRXJS injects the necessary permissions for HMR during development and strips them in production builds.

### Quick setup with CRXJS + Vite

The fastest way to get started is with [create-crxjs](https://crxjs.dev/guide/installation/create-crxjs), the official scaffolding tool:

```bash
npx create-crxjs my-extension
```

The CLI will walk you through choosing a framework (React, Vue, Svelte, vanilla) and language (JS/TS). Then:

```bash
cd my-extension
npm install
npm run dev
```

Load the `dist` folder as an unpacked extension in Chrome — changes will hot-reload automatically.

## Loading the extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist` folder of your project

## Resources

- [Chrome Extensions documentation](https://developer.chrome.com/docs/extensions/)
- [CRXJS](https://crxjs.dev/)
- [Vite](https://vitejs.dev/)

## License

MIT
