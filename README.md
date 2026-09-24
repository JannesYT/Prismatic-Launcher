# Prismatic

A Minecraft launcher in the spirit of Prism Launcher / MultiMC, with an interface
built on Apple's Liquid Glass design language — and a switch to turn the glass off
without losing a single animation.

## What you need

| | |
|---|---|
| **Editor** | [Visual Studio Code](https://code.visualstudio.com) |
| **Runtime** | [Node.js](https://nodejs.org) 20 or newer |
| **Language** | TypeScript — for the UI *and* the backend |
| **Framework** | Electron 44 + React 18 + Vite 7 |
| **To actually play** | Java. The launcher downloads a matching one per instance if you don't have it. |

Nothing else. No Rust, no C++ compiler, no Visual Studio build tools.

## Running it

```bash
npm install
```

Two ways to run:

```bash
npm run dev
```

Starts the real launcher: Electron window, working backend, live reload.

```bash
npm run dev:ui
```

Starts **only** the interface at `http://localhost:5199`, in a normal browser, backed by
mock data (`src/renderer/src/lib/mock.ts`). Much faster for design work — no Electron
restart on every save. This is how the screenshots were taken.

To produce an installer:

```bash
npm run pack:win
```

Output lands in `dist/`. `pack:mac` and `pack:linux` also exist.

## Why this stack

Prism Launcher is C++ with Qt. Qt cannot render Liquid Glass — there is no backdrop
blur, no refraction, no way to composite a translucent control over live content
without writing your own compositor. You would spend months fighting the toolkit.

Electron is a browser, so `backdrop-filter`, SVG displacement maps and spring
animations are free. More importantly, `backgroundMaterial: 'acrylic'` gives the window
**real Windows 11 blur**, which means glass surfaces sample your actual desktop
wallpaper rather than just the launcher's own background. That is the difference between
glass and a grey rectangle.

The cost is a ~90 MB installer instead of Prism's ~15 MB. Tauri would cut that to ~10 MB
but needs a Rust toolchain and the MSVC build tools — several GB of setup — and splits
the project across two languages.

SwiftUI has the genuine `glassEffect()` API, but it is macOS-only.

### A note on versions

The package is ESM (`"type": "module"`), because electron-vite 5 emits `.mjs`. That
means no `__dirname` — use `import.meta.dirname` in the main process and in the Vite
configs.

Vite is pinned to `^7`, not 8, and this is deliberate: `electron-vite@5` declares
`vite: ^5 || ^6 || ^7`, and `@vitejs/plugin-react@4` caps at 7 as well. Vite 8 satisfies
neither, so `npm audit fix --force` will happily install a tree that cannot build. If
you ever see `No electron app entry file found` or a peer-dependency conflict mentioning
vite, check that Vite is still on 7.

## The glass system

`src/renderer/src/styles/glass.css` is the heart of it. Three materials:

| `data-glass` | Material |
|---|---|
| `liquid` | Backdrop blur, SVG refraction, specular rim, floating shadow |
| `tinted` | Flat translucent fill. No blur, no refraction. |
| `solid` | Fully opaque. Cheapest to render. |

**The rule the whole design rests on:** `data-glass` changes what a surface is *made
of*. It never changes how a surface *moves*. Every transition, spring and morph is
defined outside the material blocks.

You can verify this on the slider. Grab the knob in each style and the knob goes from
26px to 34.3125px over 260ms on `cubic-bezier(0.34, 1.56, 0.64, 1)` — identical in all
three. Only the fill differs:

- **liquid** → `blur(18px) saturate(2.3)` over `rgba(255,255,255,0.5)`
- **tinted** → accent tint at 18% with a 2px accent ring, no backdrop filter
- **solid** → opaque accent

### Where the design rules came from

Straight out of [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass):

- *"For controls like sliders and toggles, the knob transforms into Liquid Glass during
  interaction."* → `.slider[data-dragging='true'] .slider__knob`
- *"Key navigation elements like tab bars float in this Liquid Glass layer."* → the tab
  bar is absolutely positioned above the content, not docked in a chrome strip.
- `tabBarMinimizeBehavior(.onScrollDown)` → the bar shrinks to a pill when you scroll
  down and springs back when you scroll up. Switchable in Settings.
- *"Scroll views offer a scroll edge effect… by obscuring content that scrolls beneath
  them."* → `.scroll-edge`, a masked blur strip at each edge of every scroll container.
- *"Avoid overcrowding or layering Liquid Glass elements on top of each other."* →
  `.glass .glass` automatically drops to a plain fill, so glass never doubles up.
- `Tab(role: .search)` is pinned to the trailing end → Discover sits last, after a
  fixed spacer.
- Sections use title-style capitalisation, larger row heights and concentric corner
  radii (a child's radius is its parent's minus the inset).
- Reduce Transparency, Reduce Motion and Increase Contrast are all honoured, and each
  can be set independently of the OS.

Reduce Motion sets `--motion: 0.001` rather than deleting transitions, so state changes
still *apply* — they just arrive instantly.

## Layout

```
src/
├── main/                  Electron main process (Node)
│   ├── index.ts           Window creation, acrylic/vibrancy, CSP
│   ├── ipc.ts             Every channel the UI can call
│   └── core/
│       ├── mojang.ts      Version manifests, rule evaluation, asset planning
│       ├── net.ts         Parallel downloader, SHA-1 verification, mirrors
│       ├── launch.ts      Classpath, argument templating, process, log parsing
│       ├── java.ts        Runtime detection + Adoptium auto-download
│       ├── auth.ts        Microsoft device code → Xbox Live → XSTS → Minecraft
│       ├── loaders.ts     Fabric, Quilt, Forge, NeoForge
│       ├── content.ts     Modrinth + CurseForge search and installs
│       ├── packs.ts       .mrpack / CurseForge / MultiMC import and export
│       ├── instances.ts   Instance CRUD, worlds, screenshots, servers
│       └── tasks.ts       Cancellable background jobs
├── preload/               contextBridge — the only path between the two
├── renderer/src/          React UI
│   ├── styles/            tokens.css, glass.css, app.css
│   ├── components/        Glass, GlassSlider, BottomTabBar, Sheet, Scroller…
│   └── views/             Instances, Discover, Accounts, Tasks, Settings, detail
└── shared/types.ts        The contract between both sides
```

## Features

**Instances** — groups, favourites, per-instance overrides for memory, Java path, JVM
args, window size and custom commands; duplicate, export, import; play time tracking;
notes.

**Versions** — every Minecraft release, snapshot and historical build; Fabric, Quilt,
Forge and NeoForge, each with its own version picker.

**Content** — search Modrinth and CurseForge for mods, modpacks, resource packs and
shaders; dependency resolution; enable/disable without deleting; update checking.

**Packs** — import `.mrpack`, CurseForge zips and MultiMC/Prism instances; export as
either format.

**Accounts** — Microsoft sign-in via device code (the launcher never touches your
password), plus offline accounts with correct deterministic UUIDs.

**Java** — scans the usual install locations, warns about 32-bit and version mismatches,
and downloads a matching Temurin runtime when one is missing.

**Launching** — parallel verified downloads, native extraction, legacy asset handling,
Quick Play, pre-launch/wrapper/post-exit commands, live log streaming with level
colouring and human-readable exit-code explanations.

## Before first use

Two integrations need a key of your own, both free, both in **Settings → Integrations**:

- **Microsoft accounts** work out of the box. Prismatic ships its own Azure application
  ID, approved by Mojang for the Java game service API, in `core/settings.ts`.

  That ID is a public identifier, not a secret: the OAuth device code flow has no client
  secret, and possessing the ID grants nothing on its own — every sign-in still happens
  on Microsoft's own page. Publishing it in source is normal and is what every
  third-party launcher does.

  **If you fork this and use your own registration**, you must get it approved first.
  Since 2023 Mojang manually allowlists every new app ID before it may call the Java
  game service API, as an anti-phishing measure; launchers predating the policy were
  grandfathered in. Apply at [aka.ms/mce-reviewappid](https://aka.ms/mce-reviewappid).
  Until yours is approved, sign-in fails at the last step with:

  ```
  POST .../authentication/login_with_xbox -> 403
  "errorMessage": "Invalid app registration, see https://aka.ms/AppRegInfo"
  ```

  The failure comes *after* Microsoft and Xbox Live both succeed, so it reads like a
  token problem when it is really a registration one. Offline accounts work throughout.
- **CurseForge.** Get a key at console.curseforge.com. Modrinth needs nothing.

## Status

The interface is complete and verified in the browser: every view renders, the three
materials behave as described, and the animation-parity claim above was measured, not
assumed.

The Electron app boots: the main process starts, the window loads, and the data tree
(`instances`, `libraries`, `assets`, `java`, `versions`, `natives`) is created under
`%APPDATA%/prismatic-launcher` with no errors on stderr.

What has **not** happened yet is a run against live Mojang, Microsoft or Modrinth
services — no version has been downloaded and no game has been launched. Expect to debug
the first real launch. The parts most likely to need work are, in order:

1. **Forge/NeoForge processors** (`loaders.ts`). Running an installer's binary-patcher
   chain is the fiddliest part of any launcher. Fabric and Quilt are simple by
   comparison — they publish a ready-made profile with nothing to execute.
2. **Microsoft auth** (`auth.ts`). The XSTS error codes are handled, but the flow can
   only really be validated against a live account.
3. **Legacy versions** (pre-1.13). The argument format and asset layout differ, and the
   handling here is written from the spec rather than tested.

## A note on archive safety

Modpacks are arbitrary zip files from the internet, so every destination path derived
from an archive entry goes through `safeJoin` in `core/paths.ts`. Without it, an entry
named `../../../../Windows/System32/evil.dll` would let a pack write anywhere the
launcher can ("zip slip"). `safeJoin` strips drive letters and leading slashes, resolves
the result, and refuses anything landing outside the target folder. `adm-zip` is pinned
to 0.6.1 or newer, which fixes a related symlink-following flaw in 0.5.x.

If you add a new extraction path, route it through `safeJoin`. Never pass an entry name
to `join()` directly.

Not affiliated with Mojang or Microsoft.
