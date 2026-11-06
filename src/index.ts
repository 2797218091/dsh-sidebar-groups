/**
 * dsh-sidebar-groups - host half.
 *
 * Two jobs, both of them plumbing the client half cannot do for itself:
 *
 *  1. **Storage.** A browser plugin cannot write the loader entry config
 *     (DOM-CONTRACT.md G.1). The state therefore lives in the `settings`
 *     namespace whose name IS this package's loader entry id, and the client
 *     reads and writes it through this plugin's own fenced routes.
 *  2. **One-time migration.** An earlier standalone config file, if it exists,
 *     is imported once - never over a value the user has already produced
 *     through the panel.
 *
 * No static inject: a service this deployment lacks must leave the plugin
 * idle, not pending (the web boot treats a non-active entry as fatal). Every
 * service is taken through dynamic ctx.inject.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { normalizeState, type SidebarGroupsState } from './client/config.js'

/** Entry id == settings namespace (see cordis.patch.yml). */
export const NAMESPACE = 'sidebar-groups'
export const PACKAGE_NAME = 'dsh-sidebar-groups'
export const name = PACKAGE_NAME

const ROUTE_PREFIX = '/sidebar-groups/api'
const LEGACY_FILE = 'sidebar-groups.json'

/**
 * The loader reads THIS export as the entry's config schema, and dsh-settings
 * reads it again to build the plugin's form. Both only care about volatile
 * fields (DOM-CONTRACT.md G.4), and .extra('volatile', true) is used rather
 * than the volatile() shorthand because only the host's copy of schemastery
 * defines that convenience method.
 *
 * `state` holds the whole document as one opaque value: the shape belongs to
 * ./client/config.ts, and a schema mirroring it field by field would have to be
 * kept in step with it by hand.
 */
export const Config = Schema.object({
  state: Schema.any()
    .default(null)
    .description('侧栏分组与滚动的完整状态（由插件自己的面板写入；null 表示尚未配置）')
    .extra('volatile', true),
  legacyImported: Schema.boolean()
    .default(false)
    .description('旧的独立配置文件是否已经一次性回迁')
    .extra('volatile', true),
})

export interface SettingsDescriptor {
  ns: string
  value?: unknown
  revision?: number
  user?: unknown
}

export interface SettingsService {
  configure?: (options: { auto: boolean }, fiber: unknown) => unknown
  describe: (options?: { redactSecrets?: boolean }) => SettingsDescriptor[]
  update: (ns: string, patch: Record<string, unknown>, expectedRevision?: number) => Promise<unknown>
}

export interface LoaderEntry {
  options?: { id?: unknown; name?: unknown }
  fiber?: unknown
  disabled?: boolean
}

export interface HostContext {
  inject?: (deps: string[], callback: (ready: HostContext) => unknown) => unknown
  effect?: (callback: () => unknown, label?: string) => unknown
  loader?: { entries?: () => LoaderEntry[] }
  fiber?: unknown
  logger?: { warn?: (message: string) => void; info?: (message: string) => void }
  profileContext?: { home?: string }
  connection?: { requestRejection?: (request: unknown) => unknown }
  webServer?: { register: (route: unknown) => () => void }
  settings?: SettingsService
}

interface HostRequest {
  method?: string
  url?: string
  on?: (event: string, listener: (chunk?: unknown) => void) => void
}

interface HostResponse {
  statusCode?: number
  setHeader?: (key: string, value: string) => void
  writeHead?: (status: number, headers?: Record<string, string>) => void
  end?: (body?: string) => void
}

function writeJson(response: HostResponse, status: number, payload: unknown): void {
  try {
    const body = JSON.stringify(payload)
    response.writeHead?.(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end?.(body)
  } catch { /* a closed socket is not worth logging */ }
}

function readBody(request: HostRequest): Promise<string> {
  return new Promise(resolve => {
    if (typeof request.on !== 'function') { resolve(''); return }
    let data = ''
    request.on('data', chunk => { data += String(chunk ?? '') })
    request.on('end', () => resolve(data))
    request.on('error', () => resolve(data))
  })
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch { return null }
}

/**
 * This package's own loader entry id, which is also the settings namespace.
 * `entry.fiber === ctx.fiber` is the only reliable self-identification when a
 * bundle mounts the same package under a different id (DOM-CONTRACT.md G.3).
 */
export function ownEntryId(ctx: HostContext): string | undefined {
  const entries = ctx.loader?.entries?.()
  if (!Array.isArray(entries)) return undefined
  let fallback: string | undefined
  for (const entry of entries) {
    const id = entry.options?.id
    if (entry.options?.name !== PACKAGE_NAME) continue
    if (typeof id !== 'string' || id === '') continue
    if (entry.fiber === ctx.fiber) return id
    if (entry.disabled !== true && fallback === undefined) fallback = id
  }
  return fallback
}

function describeValue(
  settings: SettingsService,
  ns: string,
): { descriptor?: SettingsDescriptor; state: SidebarGroupsState | null } {
  let descriptors: SettingsDescriptor[] = []
  try { descriptors = settings.describe({ redactSecrets: true }) } catch { return { state: null } }
  const descriptor = Array.isArray(descriptors) ? descriptors.find(candidate => candidate?.ns === ns) : undefined
  const value = descriptor?.value as { state?: unknown } | undefined
  const raw = value === null || value === undefined ? undefined : value.state
  if (raw === undefined || raw === null) return { descriptor, state: null }
  return { descriptor, state: normalizeState(raw) }
}

/** Where a pre-0.1.0 release kept its own JSON, before the settings namespace. */
function legacyPath(ctx: HostContext): string {
  const home = ctx.profileContext?.home
  return typeof home === 'string' && home !== ''
    ? path.join(home, LEGACY_FILE)
    : path.join(os.homedir(), '.dsh', LEGACY_FILE)
}

/**
 * Import the old standalone file exactly once, and never over a value the user
 * has since written through the panel.
 */
export function importLegacy(
  ctx: HostContext,
  settings: SettingsService,
  ns: string,
): 'no-file' | 'already-configured' | 'imported' | 'failed' {
  const file = legacyPath(ctx)
  let exists = false
  try { exists = fs.existsSync(file) } catch { return 'no-file' }
  if (!exists) return 'no-file'
  const current = describeValue(settings, ns)
  if (current.state !== null) return 'already-configured'
  try {
    const parsed = safeParse(fs.readFileSync(file, 'utf8'))
    if (parsed === null) return 'failed'
    const state = normalizeState(parsed.state ?? parsed)
    void settings.update(ns, { state, legacyImported: true }, current.descriptor?.revision)
    try { fs.renameSync(file, file + '.imported') } catch { /* the import still stands */ }
    return 'imported'
  } catch { return 'failed' }
}

/**
 * Mount both halves. Total function: a deployment without settings or
 * webServer keeps its stock sidebar and logs nothing scary.
 */
export function apply(ctx: HostContext, config?: { state?: unknown }): void {
  void config // the loader validates it against Config; the client is the reader
  if (ctx === undefined || ctx === null || typeof ctx !== 'object') return
  let settings: SettingsService | undefined
  const nsOf = (): string => ownEntryId(ctx) ?? NAMESPACE

  if (typeof ctx.inject !== 'function') return

  try {
    ctx.inject(['settings'], ready => {
      const service = ready.settings
      if (service === undefined || typeof service.describe !== 'function') return
      settings = service
      const ns = nsOf()
      try { service.configure?.({ auto: true }, ctx.fiber) } catch { /* policy is optional */ }
      // Rows must finish activating before describe() can see this one, so the
      // migration gets one deferred attempt rather than running inline.
      const timer = setTimeout(() => {
        try {
          const outcome = importLegacy(ctx, service, ns)
          if (outcome === 'imported') ctx.logger?.info?.(PACKAGE_NAME + ': imported the legacy ' + LEGACY_FILE)
        } catch { /* migration is best effort */ }
      }, 2000)
      try { ctx.effect?.(() => () => { clearTimeout(timer) }, PACKAGE_NAME + ': legacy import timer') } catch { /* host without effect */ }
    })
  } catch { /* host without dynamic injection */ }

  try {
    ctx.inject(['webServer'], ready => {
      const server = ready.webServer
      if (server === undefined || typeof server.register !== 'function') return
      const handler = async (request: HostRequest, response: HostResponse): Promise<void> => {
        try {
          const rejected = ctx.connection?.requestRejection?.(request)
          if (rejected !== undefined) { writeJson(response, 403, { ok: false, error: 'forbidden' }); return }
          const pathname = new URL(String(request.url ?? '/'), 'http://dsh.internal').pathname
          const prefix = ROUTE_PREFIX + '/'
          const method = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ''
          const service = settings
          if (service === undefined) {
            writeJson(response, 503, { ok: false, error: 'settings-service-missing' })
            return
          }
          const ns = nsOf()
          if (method === 'state') {
            const view = describeValue(service, ns)
            writeJson(response, 200, { ok: true, state: view.state, revision: view.descriptor?.revision })
            return
          }
          if (method === 'update') {
            if (String(request.method ?? 'GET').toUpperCase() !== 'POST') {
              writeJson(response, 405, { ok: false, error: 'method' })
              return
            }
            const body = safeParse(await readBody(request))
            if (body === null || !('state' in body)) {
              writeJson(response, 400, { ok: false, error: 'bad-request' })
              return
            }
            const state = normalizeState(body.state)
            const view = describeValue(service, ns)
            try {
              await service.update(ns, { state, legacyImported: true }, view.descriptor?.revision)
            } catch (error) {
              // A concurrent writer won the revision race: report it instead of
              // silently overwriting someone else's document.
              writeJson(response, 409, {
                ok: false,
                error: 'conflict',
                message: error instanceof Error ? error.message : String(error),
              })
              return
            }
            writeJson(response, 200, { ok: true, state })
            return
          }
          writeJson(response, 404, { ok: false, error: 'not-found' })
        } catch (error) {
          writeJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
      try {
        ctx.effect?.(() => server.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }), PACKAGE_NAME + ': routes')
      } catch { /* host refused the route */ }
    })
  } catch { /* host without dynamic injection */ }
}
