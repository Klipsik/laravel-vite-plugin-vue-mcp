'use strict';

const node_fs = require('node:fs');
const path = require('node:path');
const node_url = require('node:url');
const c = require('ansis');
const pathe = require('pathe');
const vite = require('vite');
const viteDevRpc = require('vite-dev-rpc');
const sse_js = require('@modelcontextprotocol/sdk/server/sse.js');
const DEBUG = require('debug');
const hookable = require('hookable');
const fs = require('node:fs/promises');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
function _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e.default : e; }

const path__default = /*#__PURE__*/_interopDefaultCompat(path);
const c__default = /*#__PURE__*/_interopDefaultCompat(c);
const DEBUG__default = /*#__PURE__*/_interopDefaultCompat(DEBUG);
const fs__default = /*#__PURE__*/_interopDefaultCompat(fs);

const debug = DEBUG__default("vite:mcp:server");
async function setupRoutes(base, server, vite) {
  const transports = /* @__PURE__ */ new Map();
  vite.middlewares.use(`${base}/sse`, async (req, res) => {
    const transport = new sse_js.SSEServerTransport(`${base}/messages`, res);
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
    hooks: hookable.createHooks(),
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
      console.warn(c__default.yellow.bold("  \u279C  MCP:     "), `Unknown IDE "${item}", supported: ${IDE_NAMES.join(", ")}`);
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
  const file = pathe.join(root, target.file);
  const dir = path__default.dirname(file);
  if (target.requireDir && !node_fs.existsSync(dir))
    return false;
  const fileExists = node_fs.existsSync(file);
  if (!fileExists && !target.createFile)
    return false;
  if (!fileExists && !node_fs.existsSync(dir))
    await fs__default.mkdir(dir, { recursive: true });
  let config = {};
  if (fileExists) {
    try {
      config = JSON.parse(await fs__default.readFile(file, "utf-8") || "{}");
    } catch {
      console.warn(c__default.yellow.bold("  \u279C  MCP:     "), `Failed to parse ${target.file}, skipping`);
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
  await fs__default.writeFile(file, `${JSON.stringify(config, null, 2)}
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
  const pluginPath = vite.normalizePath(path__default.dirname(node_url.fileURLToPath((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href)))));
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
  return node_fs.existsSync(pathe.join(root, "artisan"));
}
function isScriptEntry(file) {
  return /\.(?:[cm]?[jt]sx?|vue)$/.test(file);
}
function getEntryFromRollupInput(input, root) {
  const entries = typeof input === "string" ? [input] : Array.isArray(input) ? input.filter((entry) => typeof entry === "string") : input && typeof input === "object" ? Object.values(input).filter((entry) => typeof entry === "string") : [];
  return entries.find((entry) => isScriptEntry(entry) && node_fs.existsSync(pathe.join(root, entry)));
}
function detectLaravelEntry(resolvedConfig) {
  const root = vite.searchForWorkspaceRoot(resolvedConfig.root);
  return getEntryFromRollupInput(resolvedConfig.build?.rollupOptions?.input, root) ?? LARAVEL_ENTRY_CANDIDATES.find((file) => node_fs.existsSync(pathe.join(root, file)));
}
function VueMcp(options = {}) {
  const {
    mcpPath = "/__mcp",
    printUrl = true,
    mcpServer = (vite, ctx2) => import('./chunks/server.cjs').then((m) => m.createMcpServerDefault(options, vite, ctx2))
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
    async configureServer(vite$1) {
      const rpc = createServerRpc(ctx);
      const rpcServer = viteDevRpc.createRPCServer(
        "laravel-vite-plugin-vue-mcp",
        vite$1.ws,
        rpc,
        {
          timeout: -1
        }
      );
      ctx.rpcServer = rpcServer;
      ctx.rpc = rpc;
      let mcp = await mcpServer(vite$1, ctx);
      mcp = await options.mcpServerSetup?.(mcp, vite$1) || mcp;
      await setupRoutes(mcpPath, mcp, vite$1);
      const port = vite$1.config.server.port || 5173;
      const root = vite.searchForWorkspaceRoot(vite$1.config.root);
      const sseUrl = `http://${options.host || "localhost"}:${port}${mcpPath}/sse`;
      const updatedConfigs = [];
      for (const target of resolveMcpJsonTargets(options)) {
        if (await updateIdeConfig(root, target, resolveServerName(options), sseUrl))
          updatedConfigs.push(target.file);
      }
      if (printUrl) {
        setTimeout(() => {
          console.log(`${c__default.yellow.bold`  ➜  MCP:     `}Server is running at ${sseUrl}`);
          if (updatedConfigs.length)
            console.log(`${c__default.yellow.bold`  ➜  MCP:     `}Updated ${updatedConfigs.join(", ")}`);
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
      laravelEnabled = options.laravel ?? isLaravelProject(vite.searchForWorkspaceRoot(resolvedConfig.root));
      if (options.appendTo) {
        appendTo = options.appendTo;
      } else if (laravelEnabled) {
        appendTo = detectLaravelEntry(resolvedConfig);
        if (!appendTo)
          console.warn(c__default.yellow.bold("  \u279C  MCP:     "), "Laravel project detected, but no entry file found. Set `appendTo` manually.");
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

exports.VueMcp = VueMcp;
