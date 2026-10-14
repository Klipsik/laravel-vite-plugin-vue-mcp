# laravel-vite-plugin-vue-mcp

> **This is a fork of [vite-plugin-vue-mcp](https://github.com/webfansplz/vite-plugin-vue-mcp) by [Arlo (@webfansplz)](https://github.com/webfansplz)**, adapted and published for the **Laravel** standard (Blade + [`laravel-vite-plugin`](https://github.com/laravel/vite-plugin) + Inertia/Vue). All credits for the original idea and implementation go to the author.

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

Vite plugin that enables an MCP server for your **Laravel + Vue** app to provide information about the component tree, state, routes, and pinia tree and state.

Unlike plain SPA setups, a Laravel app has no `index.html` entry — the plugin detects Laravel projects (via the `artisan` file) and automatically attaches the MCP overlay to your **JS entry point** (`resources/ts/main.ts`, `resources/js/app.js`, or whatever is set in `laravel-vite-plugin`'s `input`).

## Installation 📦

```bash
# npm / yarn / pnpm from GitHub
pnpm add -D github:Klipsik/laravel-vite-plugin-vue-mcp

# or npm shorthand
npm install -D Klipsik/laravel-vite-plugin-vue-mcp
```

## Usage 🔨

```ts
// vite.config.ts (Laravel project root)
import vue from '@vitejs/plugin-vue'
import laravel from 'laravel-vite-plugin'
import { VueMcp } from 'laravel-vite-plugin-vue-mcp'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    laravel({
      input: ['resources/ts/main.ts'],
      refresh: true,
    }),
    VueMcp(), // overlay is appended to `resources/ts/main.ts` automatically
  ],
})
```

Then the MCP server will be available at `http://localhost:[port]/__mcp/sse` (the URL follows your Vite dev server port, whatever it is).

By default the plugin registers the MCP server in your IDE configs — `.cursor/mcp.json` (when the folder exists), or explicitly in `opencode.json` / `kilo.json` via the `updateMcpJson` option:

```ts
VueMcp({
  updateMcpJson: 'cursor|opencode|kilo',
})
```

### IDE configs

Besides Cursor, the plugin can register the MCP server in other IDE config files.
Use `updateMcpJson` with one or several IDEs (separated by `,` or `|`) — missing
folders and files are created, existing entries are preserved:

```ts
VueMcp({
  updateMcpJson: 'cursor|opencode|kilo',
  // or: updateMcpJson: { ide: ['cursor', 'kilo'], serverName: 'laravel-mcp' },
})
```

Supported config files:

| IDE       | File                  | Server entry                              |
| --------- | --------------------- | ----------------------------------------- |
| `cursor`  | `.cursor/mcp.json`    | `{ "url": "..." }` in `mcpServers`        |
| `opencode`| `opencode.json`       | `{ "type": "remote", "url": "..." }` in `mcp` |
| `kilo`    | `kilo.json`           | `{ "type": "remote", "url": "...", "enabled": true }` in `mcp` |

`updateMcpJson: true` updates all config files that already exist (does not create them),
`updateMcpJson: false` disables writing entirely. The legacy `updateCursorMcpJson` option
still works and is equivalent to `updateMcpJson: 'cursor'` with the additional requirement
that the `.cursor` folder already exists.

### Laravel (Inertia/vue-router + Vue)

Laravel projects have no `index.html` entry (Blade + `laravel-vite-plugin`), so the plugin
automatically appends the overlay script to your JS entry instead of injecting it into HTML.
Laravel projects are auto-detected via the `artisan` file in the project root.

```ts
// vite.config.ts (Laravel project root)
import vue from '@vitejs/plugin-vue'
import laravel from 'laravel-vite-plugin'
import { VueMcp } from 'laravel-vite-plugin-vue-mcp'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    laravel({
      input: ['resources/ts/main.ts'],
      refresh: true,
    }),
    VueMcp(), // overlay is appended to the `input` entry automatically
  ],
})
```

The entry is detected from `build.rollupOptions.input` (set by `laravel-vite-plugin`,
e.g. `resources/ts/main.ts`) or the common Laravel conventions. If your entry differs,
point `appendTo` at it:

```ts
VueMcp({
  // module id ending to append the overlay import to
  appendTo: 'resources/js/app.ts',
})
```

Laravel + Inertia apps do not use vue-router, so `get-router-info` returns `null` there;
all other tools (component tree/state, pinia) work the same.

You can disable Laravel mode explicitly with `VueMcp({ laravel: false })`.

### Options

```ts
export interface VueMcpOptions {
  /**
   * The host to listen on, default is `localhost`
   */
  host?: string

  /**
   * Print the MCP server URL in the console
   *
   * @default true
   */
  printUrl?: boolean

  /**
   * The MCP server info. Ingored when `mcpServer` is provided
   */
  mcpServerInfo?: McpServerInfo

  /**
   * Custom MCP server, when this is provided, the built-in MCP tools will be ignored
   */
  mcpServer?: (viteServer: ViteDevServer) => Awaitable<McpServer>

  /**
   * Setup the MCP server, this is called when the MCP server is created
   * You may also return a new MCP server to replace the default one
   */
  mcpServerSetup?: (server: McpServer, viteServer: ViteDevServer) => Awaitable<void | McpServer>

  /**
   * The path to the MCP server, default is `/__mcp`
   */
  mcpPath?: string

  /**
   * Update the MCP server address in your IDE config files:
   * - `cursor`: `.cursor/mcp.json`
   * - `opencode`: `opencode.json`
   * - `kilo`: `kilo.json`
   *
   * Pass the IDE(s) as a string separated by `,` or `|` (e.g. `'cursor,kilo'`),
   * `true` to update all existing config files, or an object for more options.
   * Missing folders/config files are created.
   *
   * @default undefined
   */
  updateMcpJson?: boolean | string | string[] | {
    /**
     * The IDE(s) to update, one or several separated by `,` or `|`
     * Supported: `cursor`, `opencode`, `kilo`
     *
     * @default all known IDEs
     */
    ide?: string | string[]

    /**
     * The name of the MCP server entry, default is `vue-mcp`
     */
    serverName?: string
  }

  /**
   * Update the address of the MCP server in the cursor config file `.cursor/mcp.json`,
   * if `.cursor` folder exists.
   *
   * @deprecated use `updateMcpJson` instead
   * @default true
   */
  updateCursorMcpJson?: boolean | {
    enabled: boolean
    /**
     * The name of the MCP server, default is `vue-mcp`
     */
    serverName?: string
  }

  /**
   * append an import to the module id ending with `appendTo` instead of adding a script into body
   * useful for projects that do not use html file as an entry
   *
   * WARNING: only set this if you know exactly what it does.
   * @default ''
   */
  appendTo?: string | RegExp

  /**
   * Laravel integration, auto-detected via the presence of an `artisan` file.
   *
   * Laravel projects have no `index.html` entry (Blade + `laravel-vite-plugin`),
   * so the overlay script is appended to your JS entry instead of being injected
   * into an HTML file (see `appendTo`).
   *
   * The entry is detected from `build.rollupOptions.input` (set by
   * `laravel-vite-plugin`) or common Laravel conventions. Override it with
   * `appendTo`, or disable with `false`.
   *
   * @default 'auto'
   */
  laravel?: boolean
}
```

## Features/Tools ✨

### Get Component Tree

`get-component-tree`: Get the Vue component tree.

![component-tree](./screenshots/component-tree.gif)

### Get Component State

`get-component-state`: Get the state of a component (input: `componentName`).

![component-state](./screenshots/component-state.gif)

### Edit Component State

`edit-component-state`: Edit the state of a component (input: `componentName`, `path`, `value`, `valueType`).

![edit-component-state](./screenshots/edit-component-state.gif)

### Highlight Component

`highlight-component`: Highlight a component (input: `componentName`).

![highlight-component](./screenshots/highlight-component.gif)

### Get Routes

`get-router-info`: Get the Vue router info of the application.

![route-tree](./screenshots/router-info.gif)

### Get Pinia Tree

`get-pinia-tree`: Get the Pinia tree of the application.

![pinia-tree](./screenshots/pinia-tree.gif)

### Get Pinia State

`get-pinia-state`: Get the Pinia state of the application (input: `storeName`).

![pinia-state](./screenshots/pinia-state.gif)

## Architecture ⚡️

![architecture](./screenshots/architecture.png)

## Notice 💡

**Please ensure the application is running in your browser before using the features.**

## Credits 💖

This project is a fork of [vite-plugin-vue-mcp](https://github.com/webfansplz/vite-plugin-vue-mcp) by [Arlo (@webfansplz)](https://github.com/webfansplz), which is in turn inspired by [vite-plugin-mcp](https://github.com/antfu/nuxt-mcp/tree/main/packages/vite-plugin-mcp). Thanks to [@antfu](https://github.com/antfu) and [@webfansplz](https://github.com/webfansplz) for the great work.

## License 📖

[MIT](./LICENSE) License © [Arlo](https://github.com/webfansplz)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/badge/npm-v1.0.0-1fa669?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://github.com/Klipsik/laravel-vite-plugin-vue-mcp
[npm-downloads-src]: https://img.shields.io/github/stars/Klipsik/laravel-vite-plugin-vue-mcp?style=flat&colorA=080f12&colorB=1fa669&label=stars
[npm-downloads-href]: https://github.com/Klipsik/laravel-vite-plugin-vue-mcp/stargazers
[bundle-src]: https://img.shields.io/badge/dynamic/json?style=flat&colorA=080f12&colorB=1fa669&label=minzip&query=%24.dist.uncompressedSize&url=https%3A%2F%2Funpkg.com%2Flaravel-vite-plugin-vue-mcp%40latest%2Fpackage.json
[bundle-href]: https://github.com/Klipsik/laravel-vite-plugin-vue-mcp
[license-src]: https://img.shields.io/github/license/Klipsik/laravel-vite-plugin-vue-mcp.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/Klipsik/laravel-vite-plugin-vue-mcp/blob/main/LICENSE
