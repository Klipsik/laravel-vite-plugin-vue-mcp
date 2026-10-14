import type { IdeName, McpIdeConfig, VueMcpOptions } from './types'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import c from 'ansis'
import { join } from 'pathe'

export const IDE_CONFIGS: Record<IdeName, McpIdeConfig> = {
  cursor: {
    file: '.cursor/mcp.json',
    path: ['mcpServers'],
    schema: undefined,
    entry: url => ({ url }),
  },
  opencode: {
    file: 'opencode.json',
    path: ['mcp'],
    schema: 'https://opencode.ai/config.json',
    entry: url => ({ type: 'remote', url }),
  },
  kilo: {
    file: 'kilo.json',
    path: ['mcp'],
    schema: 'https://app.kilo.ai/config.json',
    entry: url => ({ type: 'remote', url, enabled: true }),
  },
}

export interface McpJsonTarget extends McpIdeConfig {
  ide: IdeName
  /** the config folder must already exist, e.g. `.cursor` */
  requireDir: boolean
  /** create the config file when it does not exist */
  createFile: boolean
}

const IDE_NAMES = Object.keys(IDE_CONFIGS) as IdeName[]

export function parseIdeList(value: unknown): IdeName[] | undefined {
  const list = typeof value === 'string'
    ? value.split(/[|,\s]+/)
    : Array.isArray(value)
      ? value.map(item => String(item))
      : undefined

  if (!list)
    return undefined

  const ides: IdeName[] = []
  for (const item of list) {
    const ide = item.trim().toLowerCase() as IdeName
    if (!ide)
      continue
    if (IDE_NAMES.includes(ide)) {
      if (!ides.includes(ide))
        ides.push(ide)
    }
    else {
      console.warn(c.yellow.bold('  ➜  MCP:     '), `Unknown IDE "${item}", supported: ${IDE_NAMES.join(', ')}`)
    }
  }

  return ides
}

/**
 * Resolve which IDE config files should be updated and in which mode:
 * - `requireDir`: only update when the config folder already exists
 * - `createFile`: create the file when missing
 */
export function resolveMcpJsonTargets(options: VueMcpOptions): McpJsonTarget[] {
  const { updateMcpJson, updateCursorMcpJson } = options

  // New option
  if (updateMcpJson !== undefined) {
    if (updateMcpJson === true)
      return IDE_NAMES.map(ide => ({ ide, ...IDE_CONFIGS[ide], requireDir: false, createFile: false }))

    const value = typeof updateMcpJson === 'string' || Array.isArray(updateMcpJson) ? { ide: updateMcpJson } : updateMcpJson
    if (value === false)
      return []

    const parsed = value ? parseIdeList(value.ide) : IDE_NAMES
    return (parsed?.length ? parsed : IDE_NAMES).map(ide => ({ ide, ...IDE_CONFIGS[ide], requireDir: false, createFile: true }))
  }

  // Legacy `updateCursorMcpJson` option, kept for backward compatibility
  const cursor = typeof updateCursorMcpJson === 'boolean'
    ? { enabled: updateCursorMcpJson }
    : updateCursorMcpJson

  if (cursor?.enabled === false)
    return []

  const ide: IdeName = 'cursor'

  return [{
    ide,
    ...IDE_CONFIGS[ide],
    // previous behavior: only when the `.cursor` folder already exists
    requireDir: true,
    createFile: true,
  }]
}

export function resolveServerName(options: VueMcpOptions): string {
  const { updateMcpJson, updateCursorMcpJson } = options
  if (typeof updateMcpJson === 'object' && updateMcpJson?.serverName)
    return updateMcpJson.serverName

  const cursor = typeof updateCursorMcpJson === 'boolean' ? undefined : updateCursorMcpJson
  return cursor?.serverName || 'vue-mcp'
}

export async function updateIdeConfig(
  root: string,
  target: McpJsonTarget,
  serverName: string,
  sseUrl: string,
): Promise<boolean> {
  const file = join(root, target.file)
  const dir = path.dirname(file)

  if (target.requireDir && !existsSync(dir))
    return false

  const fileExists = existsSync(file)
  if (!fileExists && !target.createFile)
    return false

  if (!fileExists && !existsSync(dir))
    await fs.mkdir(dir, { recursive: true })

  let config: Record<string, any> = {}
  if (fileExists) {
    try {
      config = JSON.parse(await fs.readFile(file, 'utf-8') || '{}')
    }
    catch {
      console.warn(c.yellow.bold('  ➜  MCP:     '), `Failed to parse ${target.file}, skipping`)
      return false
    }
  }

  if (!config.$schema && target.schema)
    config.$schema = target.schema

  // walk to the mcp servers map, e.g. `mcp` or `mcpServers`
  let node = config
  for (const key of target.path.slice(0, -1)) {
    node[key] ??= {}
    node = node[key]
  }
  const mapKey = target.path[target.path.length - 1]
  node[mapKey] ??= {}
  node[mapKey][serverName] = target.entry(sseUrl)

  await fs.writeFile(file, `${JSON.stringify(config, null, 2)}\n`)
  return true
}
