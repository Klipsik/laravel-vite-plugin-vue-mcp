import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import type { RpcFunctions, VueMcpContext, VueMcpOptions } from './types'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import c from 'ansis'
import { join } from 'pathe'
import { normalizePath, searchForWorkspaceRoot } from 'vite'
import { createRPCServer } from 'vite-dev-rpc'
import { setupRoutes } from './connect'
import { createVueMcpContext } from './context'
import { resolveMcpJsonTargets, resolveServerName, updateIdeConfig } from './ide-configs'
import { createServerRpc } from './rpc'

function getVueMcpPath(): string {
  const pluginPath = normalizePath(path.dirname(fileURLToPath(import.meta.url)))
  return pluginPath.replace(/\/dist$/, '/\/src')
}
const vueMcpResourceSymbol = '?__vue-mcp-resource'

// Laravel app entry candidates, ordered by convention
const LARAVEL_ENTRY_CANDIDATES = [
  'resources/js/app.ts',
  'resources/ts/app.ts',
  'resources/js/app.jsx',
  'resources/js/app.tsx',
  'resources/js/app.js',
  'resources/ts/main.ts',
  'resources/ts/main.js',
  'resources/scripts/app.ts',
  'resources/scripts/app.js',
  'resources/js/ssr.ts',
  'resources/js/ssr.js',
]

function isLaravelProject(root: string): boolean {
  return existsSync(join(root, 'artisan'))
}

function isScriptEntry(file: string): boolean {
  return /\.(?:[cm]?[jt]sx?|vue)$/.test(file)
}

/**
 * `laravel-vite-plugin` exposes the app entry via `build.rollupOptions.input`,
 * this works for any custom entry (e.g. `resources/ts/main.ts`)
 */
function getEntryFromRollupInput(input: unknown, root: string): string | undefined {
  const entries = typeof input === 'string'
    ? [input]
    : Array.isArray(input)
      ? input.filter((entry): entry is string => typeof entry === 'string')
      : input && typeof input === 'object'
        ? Object.values(input as Record<string, unknown>).filter((entry): entry is string => typeof entry === 'string')
        : []

  return entries.find(entry => isScriptEntry(entry) && existsSync(join(root, entry)))
}

function detectLaravelEntry(resolvedConfig: ResolvedConfig): string | undefined {
  const root = searchForWorkspaceRoot(resolvedConfig.root)
  return getEntryFromRollupInput(resolvedConfig.build?.rollupOptions?.input, root)
    ?? LARAVEL_ENTRY_CANDIDATES.find(file => existsSync(join(root, file)))
}

export function VueMcp(options: VueMcpOptions = {}): Plugin {
  const {
    mcpPath = '/__mcp',
    printUrl = true,
    mcpServer = (vite: ViteDevServer, ctx: VueMcpContext) => import('./server').then(m => m.createMcpServerDefault(options, vite, ctx)),
  } = options

  let config: ResolvedConfig
  const vueMcpPath = getVueMcpPath()
  const vueMcpOptionsImportee = 'virtual:vue-mcp-options'
  const resolvedVueMcpOptions = `\0${vueMcpOptionsImportee}`

  const ctx = createVueMcpContext()

  // Resolved in `configResolved`, once the project root is known
  let appendTo: string | RegExp | undefined = options.appendTo
  let laravelEnabled = false

  return {
    name: 'laravel-vite-plugin-vue-mcp',
    enforce: 'pre',
    apply: 'serve',
    async configureServer(vite) {
      const rpc = createServerRpc(ctx)

      const rpcServer = createRPCServer<RpcFunctions, any>(
        'laravel-vite-plugin-vue-mcp',
        vite.ws,
        rpc,
        {
          timeout: -1,
        },
      )
      ctx.rpcServer = rpcServer
      ctx.rpc = rpc

      let mcp = await mcpServer(vite, ctx)
      mcp = await options.mcpServerSetup?.(mcp, vite) || mcp
      await setupRoutes(mcpPath, mcp, vite)

      const port = vite.config.server.port || 5173
      const root = searchForWorkspaceRoot(vite.config.root)

      const sseUrl = `http://${options.host || 'localhost'}:${port}${mcpPath}/sse`

      const updatedConfigs: string[] = []
      for (const target of resolveMcpJsonTargets(options)) {
        if (await updateIdeConfig(root, target, resolveServerName(options), sseUrl))
          updatedConfigs.push(target.file)
      }

      if (printUrl) {
        setTimeout(() => {
          // eslint-disable-next-line no-console
          console.log(`${c.yellow.bold`  ➜  MCP:     `}Server is running at ${sseUrl}`)
          if (updatedConfigs.length)
            // eslint-disable-next-line no-console
            console.log(`${c.yellow.bold`  ➜  MCP:     `}Updated ${updatedConfigs.join(', ')}`)
        }, 300)
      }
    },
    async resolveId(importee: string) {
      if (importee === vueMcpOptionsImportee) {
        return resolvedVueMcpOptions
      }
      else if (importee.startsWith('virtual:vue-mcp-path:')) {
        const resolved = importee.replace('virtual:vue-mcp-path:', `${vueMcpPath}/`)
        return `${resolved}${vueMcpResourceSymbol}`
      }
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig

      // Laravel projects are detected via the `artisan` file, no HTML entry exists
      laravelEnabled = options.laravel ?? isLaravelProject(searchForWorkspaceRoot(resolvedConfig.root))

      if (options.appendTo) {
        // Explicit `appendTo` always wins
        appendTo = options.appendTo
      }
      else if (laravelEnabled) {
        appendTo = detectLaravelEntry(resolvedConfig)
        if (!appendTo)
          console.warn(c.yellow.bold('  ➜  MCP:     '), 'Laravel project detected, but no entry file found. Set `appendTo` manually.')
      }
    },
    transform(code, id, _options) {
      if (_options?.ssr)
        return

      const [filename] = id.split('?', 2)

      if (appendTo
        && (
          (typeof appendTo === 'string' && filename.endsWith(appendTo))
          || (appendTo instanceof RegExp && appendTo.test(filename)))) {
        code = `import 'virtual:vue-mcp-path:overlay.js';\n${code}`
      }

      return code
    },
    transformIndexHtml(html) {
      // When the overlay is appended to a module entry (e.g. Laravel),
      // there is no HTML file to inject the script into
      if (appendTo)
        return

      return {
        html,
        tags: [
          {
            tag: 'script',
            injectTo: 'head-prepend',
            attrs: {
              type: 'module',
              src: `${config.base || '/'}@id/virtual:vue-mcp-path:overlay.js`,
            },
          },
        ],
      }
    },
  }
}
