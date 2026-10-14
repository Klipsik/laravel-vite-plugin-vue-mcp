import { ViteDevServer, Plugin } from 'vite';
import { Awaitable } from '@antfu/utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';

interface UpdateMcpJsonOptions {
    /**
     * The IDE(s) to update, one or several separated by `,` or `|`.
     * Supported: `cursor` (`.cursor/mcp.json`), `opencode` (`opencode.json`),
     * `kilo` (`kilo.json`).
     *
     * Missing folders/config files are created.
     *
     * @default all known IDEs
     */
    ide?: string | string[];
    /**
     * The name of the MCP server entry, default is `vue-mcp`
     */
    serverName?: string;
}
interface VueMcpOptions {
    /**
     * The host to listen on, default is `localhost`
     */
    host?: string;
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
    laravel?: boolean;
    /**
     * Print the MCP server URL in the console
     *
     * @default true
     */
    printUrl?: boolean;
    /**
     * The MCP server info. Ingored when `mcpServer` is provided
     */
    mcpServerInfo?: Implementation;
    /**
     * Custom MCP server, when this is provided, the built-in MCP tools will be ignored
     */
    mcpServer?: (viteServer: ViteDevServer) => Awaitable<McpServer>;
    /**
     * Setup the MCP server, this is called when the MCP server is created
     * You may also return a new MCP server to replace the default one
     */
    mcpServerSetup?: (server: McpServer, viteServer: ViteDevServer) => Awaitable<void | McpServer>;
    /**
     * The path to the MCP server, default is `/__mcp`
     */
    mcpPath?: string;
    /**
     * Update the MCP server address in your IDE config files:
     * - `cursor`: `.cursor/mcp.json`
     * - `opencode`: `opencode.json`
     * - `kilo`: `kilo.json`
     *
     * Pass the IDE(s) as a string separated by `,` or `|` (e.g. `'cursor,kilo'`),
     * `true` to update all existing config files, or an object for more options.
     *
     * @default undefined
     */
    updateMcpJson?: boolean | string | string[] | UpdateMcpJsonOptions;
    /**
     * Update the address of the MCP server in the cursor config file `.cursor/mcp.json`,
     * if `.cursor` folder exists.
     *
     * @deprecated use `updateMcpJson` instead
     * @default true
     */
    updateCursorMcpJson?: boolean | {
        enabled: boolean;
        /**
         * The name of the MCP server, default is `vue-mcp`
         */
        serverName?: string;
    };
    /**
     * append an import to the module id ending with `appendTo` instead of adding a script into body
     * useful for projects that do not use html file as an entry
     *
     * WARNING: only set this if you know exactly what it does.
     * @default ''
     */
    appendTo?: string | RegExp;
}

declare function VueMcp(options?: VueMcpOptions): Plugin;

export { VueMcp };
