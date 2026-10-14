import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import c from 'ansis';
import { join } from 'pathe';
import { searchForWorkspaceRoot, normalizePath } from 'vite';
import { createRPCServer } from 'vite-dev-rpc';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import DEBUG from 'debug';
import { createHooks } from 'hookable';
import fs from 'node:fs/promises';

const debug = DEBUG("vite:mcp:server");
async function setupRoutes(base, server, vite) {
  const transports = /* @__PURE__ */ new Map();
  vite.middlewares.use(`${base}/sse`, async (req, res) => {
    const transport = new SSEServerTransport(`${base}/messages`, res);
    transports.set(transport.sessionId, transport);
    debug("SSE Connected %s", transport.sessionId);
    res.on("close", () => {
      transports.delete(transport.sessionId);
    });
    await server.connect(transport);
  });
  vite.middlewares.use(`${base}/messages`, async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }
    const query = new URLSearchParams(req.url?.split("?").pop() || "");
    const clientId = query.get("sessionId");
    if (!clientId || typeof clientId !== "string") {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }
    const transport = transports.get(clientId);
    if (!transport) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
    debug("Message from %s", clientId);
    await transport.handlePostMessage(req, res);
  });
}

function createVueMcpContext() {
  return {
    hooks: createHooks(),
    rpc: null,
    rpcServer: null
  };
}

const IDE_CONFIGS = {
  cursor: {
    file: ".cursor/mcp.json",
    path: ["mcpServers"],
    schema: void 0,
    entry: (url) => ({ url })
  },
  opencode: {
    file: "opencode.json",
    path: ["mcp"],
    schema: "https://opencode.ai/config.json",
    entry: (url) => ({ type: "remote", url })
  },
  kilo: {
    file: "kilo.json",
    path: ["mcp"],
    schema: "https://app.kilo.ai/config.json",
    entry: (url) => ({ type: "remote", url, enabled: true })
  }
};
const IDE_NAMES = Object.keys(IDE_CONFIGS);
function parseIdeList(value) {
  const list = typeof value === "string" ? value.split(/[|,\s]+/) : Array.isArray(value) ? value.map((item) => String(item)) : void 0;
  if (!list)
    return void 0;
  const ides = [];
  for (const item of list) {
    const ide = item.trim().toLowerCase();
    if (!ide)
      continue;
    if (IDE_NAMES.includes(ide)) {
      if (!ides.includes(ide))
        ides.push(ide);
    } else {
      console.warn(c.yellow.bold("  \u279C  MCP:     "), `Unknown IDE "${item}", supported: ${IDE_NAMES.join(", ")}`);
    }
  }
  return ides;
}
function resolveMcpJsonTargets(options) {
  const { updateMcpJson, updateCursorMcpJson } = options;
  if (updateMcpJson !== void 0) {
    if (updateMcpJson === true)
      return IDE_NAMES.map((ide2) => ({ ide: ide2, ...IDE_CONFIGS[ide2], requireDir: false, createFile: false }));
    const value = typeof updateMcpJson === "string" || Array.isArray(updateMcpJson) ? { ide: updateMcpJson } : updateMcpJson;
    if (value === false)
      return [];
    const parsed = value ? parseIdeList(value.ide) : IDE_NAMES;
    return (parsed?.length ? parsed : IDE_NAMES).map((ide2) => ({ ide: ide2, ...IDE_CONFIGS[ide2], requireDir: false, createFile: true }));
  }
  const cursor = typeof updateCursorMcpJson === "boolean" ? { enabled: updateCursorMcpJson } : updateCursorMcpJson;
  if (cursor?.enabled === false)
    return [];
  const ide = "cursor";
  return [{
    ide,
    ...IDE_CONFIGS[ide],
    // previous behavior: only when the `.cursor` folder already exists
    requireDir: true,
    createFile: true
  }];
}
function resolveServerName(options) {
  const { updateMcpJson, updateCursorMcpJson } = options;
  if (typeof updateMcpJson === "object" && updateMcpJson?.serverName)
    return updateMcpJson.serverName;
  const cursor = typeof updateCursorMcpJson === "boolean" ? void 0 : updateCursorMcpJson;
  return cursor?.serverName || "vue-mcp";
}
async function updateIdeConfig(root, target, serverName, sseUrl) {
  const file = join(root, target.file);
  const dir = path.dirname(file);
  if (target.requireDir && !existsSync(dir))
    return false;
  const fileExists = existsSync(file);
  if (!fileExists && !target.createFile)
    return false;
  if (!fileExists && !existsSync(dir))
    await fs.mkdir(dir, { recursive: true });
  let config = {};
  if (fileExists) {
    try {
      config = JSON.parse(await fs.readFile(file, "utf-8") || "{}");
    } catch {
      console.warn(c.yellow.bold("  \u279C  MCP:     "), `Failed to parse ${target.file}, skipping`);
      return false;
    }
  }
  if (!config.$schema && target.schema)
    config.$schema = target.schema;
  let node = config;
  for (const key of target.path.slice(0, -1)) {
    node[key] ??= {};
    node = node[key];
  }
  const mapKey = target.path[target.path.length - 1];
  node[mapKey] ??= {};
  node[mapKey][serverName] = target.entry(sseUrl);
  await fs.writeFile(file, `${JSON.stringify(config, null, 2)}
`);
  return true;
}

function createServerRpc(ctx) {
  return {
    // component tree
    getInspectorTree: (_) => ({}),
    onInspectorTreeUpdated: (event, data) => {
      ctx.hooks.callHook(event, data);
    },
    // component state
    getInspectorState: (_) => ({}),
    onInspectorStateUpdated: (event, data) => {
      ctx.hooks.callHook(event, data);
    },
    // router info
    getRouterInfo: (_) => ({}),
    onRouterInfoUpdated: (event, data) => {
      ctx.hooks.callHook(event, data);
    },
    // pinia tree
    getPiniaTree: (_) => ({}),
    onPiniaTreeUpdated: (event, data) => {
      ctx.hooks.callHook(event, data);
    },
    // pinia state
    getPiniaState: (_) => ({}),
    onPiniaInfoUpdated: (event, data) => {
      ctx.hooks.callHook(event, data);
    }
  };
}

function getVueMcpPath() {
  const pluginPath = normalizePath(path.dirname(fileURLToPath(import.meta.url)));
  return pluginPath.replace(/\/dist$/, "//src");
}
const vueMcpResourceSymbol = "?__vue-mcp-resource";
const LARAVEL_ENTRY_CANDIDATES = [
  "resources/js/app.ts",
  "resources/ts/app.ts",
  "resources/js/app.jsx",
  "resources/js/app.tsx",
  "resources/js/app.js",
  "resources/ts/main.ts",
  "resources/ts/main.js",
  "resources/scripts/app.ts",
  "resources/scripts/app.js",
  "resources/js/ssr.ts",
  "resources/js/ssr.js"
];
function isLaravelProject(root) {
  return existsSync(join(root, "artisan"));
}
function isScriptEntry(file) {
  return /\.(?:[cm]?[jt]sx?|vue)$/.test(file);
}
function getEntryFromRollupInput(input, root) {
  const entries = typeof input === "string" ? [input] : Array.isArray(input) ? input.filter((entry) => typeof entry === "string") : input && typeof input === "object" ? Object.values(input).filter((entry) => typeof entry === "string") : [];
  return entries.find((entry) => isScriptEntry(entry) && existsSync(join(root, entry)));
}
function detectLaravelEntry(resolvedConfig) {
  const root = searchForWorkspaceRoot(resolvedConfig.root);
  return getEntryFromRollupInput(resolvedConfig.build?.rollupOptions?.input, root) ?? LARAVEL_ENTRY_CANDIDATES.find((file) => existsSync(join(root, file)));
}
function VueMcp(options = {}) {
  const {
    mcpPath = "/__mcp",
    printUrl = true,
    mcpServer = (vite, ctx2) => import('./chunks/server.mjs').then((m) => m.createMcpServerDefault(options, vite, ctx2))
  } = options;
  let config;
  const vueMcpPath = getVueMcpPath();
  const vueMcpOptionsImportee = "virtual:vue-mcp-options";
  const resolvedVueMcpOptions = `\0${vueMcpOptionsImportee}`;
  const ctx = createVueMcpContext();
  let appendTo = options.appendTo;
  let laravelEnabled = false;
  return {
    name: "laravel-vite-plugin-vue-mcp",
    enforce: "pre",
    apply: "serve",
    async configureServer(vite) {
      const rpc = createServerRpc(ctx);
      const rpcServer = createRPCServer(
        "laravel-vite-plugin-vue-mcp",
        vite.ws,
        rpc,
        {
          timeout: -1
        }
      );
      ctx.rpcServer = rpcServer;
      ctx.rpc = rpc;
      let mcp = await mcpServer(vite, ctx);
      mcp = await options.mcpServerSetup?.(mcp, vite) || mcp;
      await setupRoutes(mcpPath, mcp, vite);
      const port = vite.config.server.port || 5173;
      const root = searchForWorkspaceRoot(vite.config.root);
      const sseUrl = `http://${options.host || "localhost"}:${port}${mcpPath}/sse`;
      const updatedConfigs = [];
      for (const target of resolveMcpJsonTargets(options)) {
        if (await updateIdeConfig(root, target, resolveServerName(options), sseUrl))
          updatedConfigs.push(target.file);
      }
      if (printUrl) {
        setTimeout(() => {
          console.log(`${c.yellow.bold`  ➜  MCP:     `}Server is running at ${sseUrl}`);
          if (updatedConfigs.length)
            console.log(`${c.yellow.bold`  ➜  MCP:     `}Updated ${updatedConfigs.join(", ")}`);
        }, 300);
      }
    },
    async resolveId(importee) {
      if (importee === vueMcpOptionsImportee) {
        return resolvedVueMcpOptions;
      } else if (importee.startsWith("virtual:vue-mcp-path:")) {
        const resolved = importee.replace("virtual:vue-mcp-path:", `${vueMcpPath}/`);
        return `${resolved}${vueMcpResourceSymbol}`;
      }
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
      laravelEnabled = options.laravel ?? isLaravelProject(searchForWorkspaceRoot(resolvedConfig.root));
      if (options.appendTo) {
        appendTo = options.appendTo;
      } else if (laravelEnabled) {
        appendTo = detectLaravelEntry(resolvedConfig);
        if (!appendTo)
          console.warn(c.yellow.bold("  \u279C  MCP:     "), "Laravel project detected, but no entry file found. Set `appendTo` manually.");
      }
    },
    transform(code, id, _options) {
      if (_options?.ssr)
        return;
      const [filename] = id.split("?", 2);
      if (appendTo && (typeof appendTo === "string" && filename.endsWith(appendTo) || appendTo instanceof RegExp && appendTo.test(filename))) {
        code = `import 'virtual:vue-mcp-path:overlay.js';
${code}`;
      }
      return code;
    },
    transformIndexHtml(html) {
      if (appendTo)
        return;
      return {
        html,
        tags: [
          {
            tag: "script",
            injectTo: "head-prepend",
            attrs: {
              type: "module",
              src: `${config.base || "/"}@id/virtual:vue-mcp-path:overlay.js`
            }
          }
        ]
      };
    }
  };
}

export { VueMcp };
