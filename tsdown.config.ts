import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-sidebar-groups'

/**
 * Everything the platform seed table provides. These stay require calls in the
 * bundle; the host's ModuleLoader resolves them from the seed, so they must
 * never be inlined. See _work/DOM-CONTRACT.md section H.
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
]

/**
 * tsdown's banner printer reflows the wrapper onto several lines. That is
 * harmless, but the one thing a reviewer checks first is whether this file is a
 * ModuleLoader bundle for this id, so the opening line is put back together
 * after the write. It is a no-op when the shape changes.
 */
function compactBanner(outDir: string): void {
  const file = join(outDir, 'client.js')
  const opener = 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(PLUGIN_ID) + ', factory: (require) => {'
  let source: string
  try { source = readFileSync(file, 'utf8') } catch { return }
  if (source.startsWith(opener)) return
  const pattern = new RegExp(
    '^window\\.__ModuleLoader__\\.load\\(\\{\\s*id:\\s*"' + PLUGIN_ID + '",\\s*factory:\\s*\\(require\\)\\s*=>\\s*\\{',
  )
  if (!pattern.test(source)) {
    console.log('dsh-sidebar-groups: unexpected banner shape, left untouched')
    return
  }
  writeFileSync(file, source.replace(pattern, opener), 'utf8')
}

/**
 * Browser half. The output is wrapped in window.__ModuleLoader__.load(...)
 * because that is the only shape dsh-client-modules can materialize: the file is
 * fetched, evaluated as a classic script, and the loader keeps the factory to
 * run against a module table.
 */
const clientBundle: UserConfig = {
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: false,
  clean: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner:
      'window.__ModuleLoader__.load({ id: ' + JSON.stringify(PLUGIN_ID) + ', factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    codeSplitting: false,
  },
  hooks: {
    'build:done': () => { compactBanner('lib') },
  },
} as UserConfig

/**
 * Host half: plain ESM for Node. @deepseek-ai/schemastery stays external and is
 * resolved from the profile's own node_modules, exactly like every other host
 * plugin; the node: builtins stay external by default.
 */
const hostBundle: UserConfig = {
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  dts: false,
  sourcemap: false,
  clean: false,
  deps: {
    neverBundle: ['@deepseek-ai/schemastery'],
    alwaysBundle: (id: string) => id !== '@deepseek-ai/schemastery',
  },
  outputOptions: {
    entryFileNames: 'index.js',
    codeSplitting: false,
  },
} as UserConfig

export default [hostBundle, clientBundle] satisfies UserConfig[]
