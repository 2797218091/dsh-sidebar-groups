/**
 * No-browser smoke test.
 *
 * It loads the SHIPPED artifact (lib/client.js) the way the host does - a
 * window.__ModuleLoader__.load(...) capture, then the factory with a stubbed
 * require - and drives it against a hand-built fake DOM. Nothing here needs a
 * browser, a DSH process or a network, so it runs anywhere Node runs.
 *
 * Covered (the task's acceptance list):
 *   a) apply() with no slots service does not throw
 *   b) with slots, the sidebar.footer.action cell id is registered
 *   c) the DOM adapter mounts on an empty document silently (no throw)
 *   d) mounting twice leaves exactly one copy of our nodes
 *   e) teardown removes our nodes and restores the hidden original ones
 *   f) the default nav preset puts three ids on top and folds the rest
 *   g) package.json / .gitignore / bundle-shape assertions
 *   h) the host half: Config volatility, ownEntryId, and the two JSON routes
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_ID = 'dsh-sidebar-groups'

let checks = 0
let failures = 0
function ok(name, run) {
  checks += 1
  try { run(); console.log('  ok   ' + name) } catch (error) {
    failures += 1
    console.log('  FAIL ' + name + ' :: ' + (error && error.message ? error.message : String(error)))
  }
}
function assert(condition, message) { if (!condition) throw new Error(message) }
function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')')
  }
}

// -- fake DOM ---------------------------------------------------------------

function makeStyle() {
  const map = new Map()
  return {
    setProperty(name, value) { map.set(name, String(value)) },
    getPropertyValue(name) { return map.get(name) === undefined ? '' : map.get(name) },
  }
}

function makeElement(tagName, attrs) {
  const attributes = new Map()
  const kids = []
  const node = {
    tagName: String(tagName).toUpperCase(),
    offsetHeight: 0,
    isConnected: true,
    style: makeStyle(),
    parentElement: null,
    parentNode: null,
    listeners: [],
    appendChild(child) {
      const existing = kids.indexOf(child)
      if (existing >= 0) kids.splice(existing, 1)
      kids.push(child)
      child.parentElement = node
      child.parentNode = node
      return child
    },
    insertBefore(child, reference) {
      const already = kids.indexOf(child)
      if (already >= 0) kids.splice(already, 1)
      const index = reference === null || reference === undefined ? -1 : kids.indexOf(reference)
      if (index < 0) kids.push(child)
      else kids.splice(index, 0, child)
      child.parentElement = node
      child.parentNode = node
      return child
    },
    removeChild(child) {
      const index = kids.indexOf(child)
      if (index >= 0) kids.splice(index, 1)
      child.parentElement = null
      child.parentNode = null
      return child
    },
    setAttribute(name, value) { attributes.set(name, String(value)) },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null },
    hasAttribute(name) { return attributes.has(name) },
    removeAttribute(name) { attributes.delete(name) },
    addEventListener(type, handler) { node.listeners.push({ type, handler }) },
    removeEventListener() {},
    click() { node.clicks = (node.clicks === undefined ? 0 : node.clicks) + 1 },
    cloneNode() { return makeElement(tagName, Object.fromEntries(attributes)) },
    contains(other) {
      let cursor = other
      while (cursor !== null && cursor !== undefined) {
        if (cursor === node) return true
        cursor = cursor.parentElement
      }
      return false
    },
  }
  let text = ''
  Object.defineProperty(node, 'textContent', {
    // Setting textContent in a real DOM replaces every child; the adapter
    // relies on that to clear its own container between renders.
    get: () => (kids.length === 0 ? text : text),
    set: value => { text = String(value); if (text === '') { kids.length = 0 } },
  })
  Object.defineProperty(node, 'children', { get: () => kids })
  Object.defineProperty(node, 'className', {
    get: () => (attributes.has('class') ? attributes.get('class') : ''),
    set: value => attributes.set('class', String(value)),
  })
  for (const name of Object.keys(attrs || {})) attributes.set(name, String(attrs[name]))
  return node
}

/** Only the selector shapes the adapter actually uses. */
function matches(node, selector) {
  const attribute = /^\[([a-zA-Z0-9_-]+)(?:(\*?=)"([^"]*)")?\]$/.exec(selector)
  if (attribute !== null) {
    const name = attribute[1]
    const operator = attribute[2]
    const value = attribute[3]
    if (!node.hasAttribute(name)) return false
    if (operator === undefined) return true
    const actual = String(node.getAttribute(name))
    return operator === '*=' ? actual.includes(value) : actual === value
  }
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(selector)) return node.tagName === selector.toUpperCase()
  throw new Error('unsupported selector: ' + selector)
}

function* descend(node) {
  const kids = node.children
  for (let index = 0; index < kids.length; index += 1) {
    yield kids[index]
    yield* descend(kids[index])
  }
}

function makeDocument(html) {
  return {
    documentElement: html,
    head: null,
    body: null,
    createElement: tag => makeElement(tag),
    addEventListener() {},
    removeEventListener() {},
    querySelector(selector) {
      for (const node of descend(html)) if (matches(node, selector)) return node
      return null
    },
    querySelectorAll(selector) {
      const found = []
      for (const node of descend(html)) if (matches(node, selector)) found.push(node)
      return found
    },
  }
}

const LABELS = ['插件', '插件市场', '自动化任务', '上下文洞察', '任务看板', '智能体', '演示文稿']

function makeSidebar() {
  const html = makeElement('html')
  const head = makeElement('head')
  const body = makeElement('body')
  html.appendChild(head)
  html.appendChild(body)
  const root = makeElement('div', { class: 'wtg9ga_root' })
  const logo = makeElement('div', { class: 'wtg9ga_logoRow', 'data-window-drag': '' })
  const toggle = makeElement('button', { 'data-sidebar-toggle': '', 'aria-label': '收起侧栏' })
  logo.appendChild(toggle)
  const newSession = makeElement('button', { class: 'wtg9ga_newSession' })
  const nav = makeElement('nav', { 'aria-label': '全局面板' })
  const rows = LABELS.map(label => {
    const row = makeElement('button', { class: 'wtg9ga_panelRow', 'aria-label': label })
    row.appendChild(makeElement('span', { class: 'wtg9ga_panelGlyph' }))
    row.appendChild(makeElement('span', { class: 'wtg9ga_panelTitle' }))
    nav.appendChild(row)
    return row
  })
  const region = makeElement('div', { class: 'wtg9ga_regionArea' })
  const tree = makeElement('div', { class: 'GAkraW_list', role: 'tree' })
  for (const name of ['项目 A', '项目 B']) {
    const section = makeElement('div', { class: 'GAkraW_groupSection' })
    const title = makeElement('div', { class: 'GAkraW_sectionLabel' })
    title.textContent = name
    section.appendChild(title)
    tree.appendChild(section)
  }
  region.appendChild(tree)
  const foot = makeElement('div', { class: 'wtg9ga_footArea' })
  for (const kid of [logo, newSession, nav, region, foot]) root.appendChild(kid)
  body.appendChild(root)
  const doc = makeDocument(html)
  doc.head = head
  doc.body = body
  return { doc, html, head, body, root, nav, rows, tree, region, foot, toggle }
}

// -- load the shipped bundle the way the host does --------------------------

function loadBundle() {
  const source = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
  let captured = null
  const window = { __ModuleLoader__: { load(definition) { captured = definition } } }
  const boot = new Function('window', source)
  boot(window)
  assert(captured !== null && typeof captured === 'object', 'lib/client.js never called window.__ModuleLoader__.load')
  equal(captured.id, PLUGIN_ID, 'loader id')
  const require = spec => {
    if (spec === 'react') {
      return {
        createElement: () => null,
        Fragment: 'fragment',
        useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
        useEffect() {},
        useMemo: factory => factory(),
        useRef: value => ({ current: value }),
        useCallback: callback => callback,
        default: { createElement: () => null },
      }
    }
    if (spec === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null, Fragment: 'fragment' }
    if (spec === 'react-dom') return { createPortal: () => null }
    throw new Error('unexpected require in the smoke environment: ' + spec)
  }
  const exports = captured.factory(require)
  return { exports, definition: captured, source }
}

// -- the assertions ---------------------------------------------------------

console.log('dsh-sidebar-groups smoke test')
console.log('')
console.log('a) apply() tolerates a host without the slots service')
const bundle = loadBundle()
ok('the bundle exports apply()', () => equal(typeof bundle.exports.apply, 'function', 'apply export'))
ok('apply() does not throw when the injected context has no services', () => {
  bundle.exports.apply({ inject(dependencies, callback) { callback({}) } })
})
ok('apply() does not throw with no injection surface at all', () => {
  bundle.exports.apply({})
})

console.log('')
console.log('b) the footer action cell is registered under a stable id')
const registrations = []
const slotEntries = LABELS.map((label, index) => ({ options: { id: 'panel-' + index, order: index * 10, label: () => label } }))
const subscriptions = []
const slots = {
  inject(name, register) { assert(name === 'sidebar.footer.action', 'unexpected slot name ' + name); register(); return undefined },
  register(options, component) { registrations.push({ options, component }); return options },
  entriesOfSlot(name) { return name === 'sidebar.panellist' ? slotEntries : [] },
  subscribe(name) { subscriptions.push(name); return () => {} },
}
const context = {
  inject(dependencies, callback) {
    if (dependencies.includes('slots')) callback({ slots, effect: () => () => {} })
    else callback({})
  },
  effect: () => () => {},
}
ok('apply() registers sidebar.footer.action / dsh-sidebar-groups-open', () => {
  bundle.exports.apply(context)
  const hit = registrations.find(entry => entry.options.name === 'sidebar.footer.action' && entry.options.id === 'dsh-sidebar-groups-open')
  assert(hit !== undefined, 'no registration for sidebar.footer.action / dsh-sidebar-groups-open')
  equal(typeof hit.component, 'function', 'the cell must be a component function')
})
ok('apply() subscribes to sidebar.panellist so labels stay live', () => {
  assert(subscriptions.includes('sidebar.panellist'), 'missing panellist subscription, got ' + JSON.stringify(subscriptions))
})

console.log('')
console.log('c) the DOM adapter is silent on an empty document')
const noopHooks = {
  state: () => bundle.exports.defaultState(),
  entries: () => [],
  setNavCollapsed() {},
  setWorkspaceCollapsed() {},
}
ok('mount() on a document without any sidebar returns false and does not throw', () => {
  const doc = { querySelector: () => null, querySelectorAll: () => [], createElement: tag => makeElement(tag) }
  const adapter = new bundle.exports.DomAdapter({ doc, win: {} }, noopHooks)
  equal(adapter.mount(), false, 'mount return value')
})
ok('mount() with no document at all returns false', () => {
  const adapter = new bundle.exports.DomAdapter({ doc: null, win: {} }, noopHooks)
  equal(adapter.mount(), false, 'mount return value')
})

console.log('')
console.log('d) mounting twice leaves exactly one copy of our nodes')
const sidebar = makeSidebar()
const entries = slotEntries.map(entry => ({ id: entry.options.id, order: entry.options.order, label: entry.options.label() }))
let state = bundle.exports.defaultState()
state = { ...state, nav: bundle.exports.resolveDefaultNavGroups(entries) }
const hooks = {
  state: () => state,
  entries: () => entries,
  setNavCollapsed(groupId, collapsed) {
    state = { ...state, nav: { groups: state.nav.groups.map(group => group.id === groupId ? { ...group, collapsed } : group) } }
  },
  setWorkspaceCollapsed() {},
}
const adapter = new bundle.exports.DomAdapter({ doc: sidebar.doc, win: {} }, hooks)
ok('mount() finds the sidebar and mounts', () => equal(adapter.mount(), true, 'mount return value'))
ok('a second mount() adds no second copy', () => {
  adapter.mount()
  equal(sidebar.doc.querySelectorAll('[data-sg-style]').length, 1, 'style elements')
  equal(sidebar.doc.querySelectorAll('[data-sg-nav]').length, 1, 'nav containers')
})
ok('the whole column became the scroll container', () => {
  equal(sidebar.root.style.getPropertyValue('overflow-y'), 'auto', 'root overflow-y')
  equal(sidebar.root.style.getPropertyValue('scrollbar-gutter'), 'stable', 'root scrollbar-gutter (moved off the inner list)')
  equal(sidebar.root.style.getPropertyValue('overscroll-behavior'), 'contain', 'root overscroll-behavior')
  equal(sidebar.tree.style.getPropertyValue('overflow-y'), 'visible', 'inner tree must stop scrolling')
})
ok('the bottom area and the top blocks are pinned', () => {
  equal(sidebar.foot.style.getPropertyValue('position'), 'sticky', 'foot position')
  equal(sidebar.foot.style.getPropertyValue('bottom'), '0px', 'foot bottom')
})
ok('grouped original rows are hidden, not removed', () => {
  const hidden = sidebar.rows.filter(row => row.style.getPropertyValue('display') === 'none')
  equal(hidden.length, sidebar.rows.length, 'hidden row count')
  equal(sidebar.nav.children.filter(child => child.tagName === 'BUTTON').length, sidebar.rows.length, 'framework rows still in the nav')
})
ok('our own rows carry the framework glyph and mirror the label', () => {
  const box = sidebar.doc.querySelector('[data-sg-nav]')
  const ourRows = box.children.filter(child => child.hasAttribute('data-sg-nav-item'))
  equal(ourRows.length, 3, 'top-level group renders exactly the preset ids')
  equal(ourRows[0].getAttribute('aria-label'), '插件', 'first row label')
  const glyph = ourRows[0].children.find(child => child.className === 'dsh-sg-glyph')
  assert(glyph !== undefined && glyph.children.length === 1, 'cloned glyph missing')
})
ok('clicking one of our rows drives the original button', () => {
  const box = sidebar.doc.querySelector('[data-sg-nav]')
  const ourRows = box.children.filter(child => child.hasAttribute('data-sg-nav-item'))
  const click = ourRows[0].listeners.find(listener => listener.type === 'click')
  assert(click !== undefined, 'no click listener on our row')
  click.handler({ preventDefault() {}, stopPropagation() {} })
  equal(sidebar.rows[0].clicks, 1, 'original button click count')
})
ok('the active row is mirrored from aria-current', () => {
  sidebar.rows[0].setAttribute('aria-current', 'page')
  adapter.refresh()
  const box = sidebar.doc.querySelector('[data-sg-nav]')
  const ourRows = box.children.filter(child => child.hasAttribute('data-sg-nav-item'))
  equal(ourRows[0].getAttribute('aria-current'), 'page', 'mirrored aria-current')
  assert(String(ourRows[0].getAttribute('class')).includes('dsh-sg-active'), 'mirrored active class')
})

console.log('')
console.log('e) teardown restores everything')
ok('teardown removes our nodes and un-hides the framework rows', () => {
  adapter.teardown()
  equal(sidebar.doc.querySelectorAll('[data-sg-style]').length, 0, 'style elements left behind')
  equal(sidebar.doc.querySelectorAll('[data-sg-nav]').length, 0, 'nav containers left behind')
  equal(sidebar.doc.querySelectorAll('[data-sg-ws]').length, 0, 'workspace containers left behind')
  const stillHidden = sidebar.rows.filter(row => row.style.getPropertyValue('display') === 'none')
  equal(stillHidden.length, 0, 'rows still hidden after teardown')
  equal(sidebar.root.style.getPropertyValue('overflow-y'), '', 'root overflow-y restored')
  equal(sidebar.foot.style.getPropertyValue('position'), '', 'foot position restored')
})

console.log('')
console.log('f) the default preset')
ok('three ids stay on top and everything else folds into a collapsed group', () => {
  const preset = bundle.exports.resolveDefaultNavGroups(entries)
  equal(preset.groups.length, 2, 'group count')
  equal(preset.groups[0].showHeader, false, 'the top group has no header')
  equal(preset.groups[0].items.join(','), 'panel-0,panel-1,panel-4', 'top group items')
  equal(preset.groups[1].collapsed, true, 'the folded group starts collapsed')
  equal(preset.groups[1].items.length, entries.length - 3, 'folded group item count')
})
ok('label matching survives a different language', () => {
  const english = [
    { id: 'a', order: 0, label: 'Plugins' },
    { id: 'b', order: 1, label: 'Plugin Market' },
    { id: 'c', order: 2, label: 'Automations' },
    { id: 'd', order: 3, label: 'Context' },
    { id: 'e', order: 4, label: 'Task Board' },
  ]
  equal(bundle.exports.resolveDefaultNavGroups(english).groups[0].items.join(','), 'a,b,e', 'english top group')
})
ok('with no recognisable label the registry order decides', () => {
  const unknown = [0, 1, 2, 3, 4, 5].map(index => ({ id: 'x' + index, order: index, label: 'panel ' + index }))
  equal(bundle.exports.resolveDefaultNavGroups(unknown).groups[0].items.join(','), 'x0,x1,x4', 'positional fallback')
})

ok('workspace groups hide whole sections and render no headers for a single group', () => {
  const work = makeSidebar()
  let workState = bundle.exports.defaultState()
  workState = { ...workState, workspaces: { groups: [{ id: 'ws-all', label: '工作区', collapsed: false, showHeader: false, items: [] }] } }
  const wsAdapter = new bundle.exports.DomAdapter({ doc: work.doc, win: {} }, {
    state: () => workState,
    entries: () => [],
    setNavCollapsed() {},
    setWorkspaceCollapsed(groupId, collapsed) {
      workState = { ...workState, workspaces: { groups: workState.workspaces.groups.map(group => group.id === groupId ? { ...group, collapsed } : group) } }
    },
  })
  equal(wsAdapter.mount(), true, 'mount')
  equal(work.doc.querySelectorAll('[data-sg-ws]').length, 0, 'no fold bar while there is one group')
  equal(work.doc.querySelectorAll('[data-sg-ws-group]').length, 0, 'no workspace group headers')
  equal(wsAdapter.getWorkspaces().length, 2, 'workspace sections discovered')
  const sections = work.tree.children.filter(child => String(child.className).includes('groupSection'))
  equal(sections.length, 2, 'sections untouched')
  wsAdapter.teardown()

  // Two populated groups: headers appear, and folding a group hides its section.
  const folded = makeSidebar()
  let foldedState = bundle.exports.defaultState()
  foldedState = { ...foldedState, workspaces: { groups: [
    { id: 'ws-a', label: '项目', collapsed: false, showHeader: true, items: ['项目 A'] },
    { id: 'ws-b', label: '归档', collapsed: true, showHeader: true, items: ['项目 B'] },
  ] } }
  const foldedAdapter = new bundle.exports.DomAdapter({ doc: folded.doc, win: {} }, {
    state: () => foldedState,
    entries: () => [],
    setNavCollapsed() {},
    setWorkspaceCollapsed() {},
  })
  equal(foldedAdapter.mount(), true, 'mount with two workspace groups')
  equal(folded.doc.querySelectorAll('[data-sg-ws-group]').length, 2, 'one fold control per populated group')
  const foldedSections = folded.tree.children.filter(child => String(child.className).includes('groupSection'))
  equal(foldedSections[0].style.getPropertyValue('display'), '', 'the open group keeps its section visible')
  equal(foldedSections[1].style.getPropertyValue('display'), 'none', 'the folded group hides its section')
  foldedAdapter.teardown()
})

console.log('')
console.log('g) package / bundle shape')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
ok('package.json: identity and entry points', () => {
  equal(pkg.type, 'module', 'type')
  equal(pkg.main, './lib/index.js', 'main')
  equal(pkg.exports['.'].default, './lib/index.js', 'exports["."].default')
  equal(pkg.exports['.'].types, './lib/types/index.d.ts', 'exports["."].types')
  equal(pkg.exports['./client'].default, './lib/client.js', 'exports["./client"].default')
  equal(pkg.exports['./client'].types, './lib/types/client/index.d.ts', 'exports["./client"].types')
  equal(pkg.exports['./package.json'], './package.json', 'exports["./package.json"]')
  equal(pkg.exports['./cordis.patch.yml'], './cordis.patch.yml', 'exports["./cordis.patch.yml"]')
})
ok('package.json: the dsh block (bundle + client)', () => {
  equal(pkg.dsh.bundle.patch, './cordis.patch.yml', 'dsh.bundle.patch')
  equal(pkg.dsh.client.platform, 'web', 'dsh.client.platform')
  equal(JSON.stringify(pkg.dsh.client.inject), JSON.stringify(['@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-sidebar']), 'dsh.client.inject')
  equal(pkg.dsh.engines.dsh, '>=0.2.1-rc.1', 'dsh.engines.dsh')
})
ok('package.json: metadata, engines and the no-build-on-install rule', () => {
  const keywords = pkg.keywords || []
  for (const keyword of ['dsh', 'dsh-plugin', 'deepseek-harness', 'cordis', 'sidebar']) {
    assert(keywords.includes(keyword), 'missing keyword ' + keyword)
  }
  assert(String(pkg.repository.url).includes('github.com/2797218091/dsh-sidebar-groups'), 'repository url')
  assert(String(pkg.homepage).includes('github.com/2797218091/dsh-sidebar-groups'), 'homepage')
  assert(String(pkg.bugs.url).includes('github.com/2797218091/dsh-sidebar-groups'), 'bugs url')
  equal(pkg.license, 'MIT', 'license')
  equal(pkg.engines.node, '>=20', 'engines.node')
  assert(pkg.scripts.prepare === undefined, 'package.json must not declare prepare')
  assert(pkg.scripts.postinstall === undefined, 'package.json must not declare postinstall')
  equal(Object.keys(pkg.devDependencies || {}).sort().join(','), 'tsdown,typescript', 'devDependencies')
})
ok('.gitignore does not ignore lib/', () => {
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n').map(line => line.trim())
  const offenders = ignore.filter(line => line !== '' && !line.startsWith('#') && /(^|\/)lib\/?$/.test(line))
  equal(offenders.length, 0, 'offending .gitignore lines: ' + JSON.stringify(offenders))
})
ok('the build artifacts are present', () => {
  for (const relative of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts']) {
    assert(existsSync(join(ROOT, relative)), 'missing artifact ' + relative)
  }
})
ok('lib/client.js starts with the ModuleLoader wrapper for this id', () => {
  const firstLine = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8').split('\n')[0]
  equal(firstLine, 'window.__ModuleLoader__.load({ id: "dsh-sidebar-groups", factory: (require) => {', 'first line')
})
ok('the client entry declares no static inject', () => {
  const source = readFileSync(join(ROOT, 'src', 'client', 'index.ts'), 'utf8')
  assert(!/export\s+const\s+inject\b/.test(source), 'src/client/index.ts exports a static inject')
})
ok('the host half exports Config with volatile fields', () => {
  const source = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8')
  assert(/export const Config = Schema\.object\(/.test(source), 'Config is not a schemastery object')
  assert(source.includes(".extra('volatile', true)"), 'no extra volatile field')
  assert(!/\.volatile\(\)/.test(source), 'must not call .volatile()')
})

console.log('')
console.log('h) the host half')
let host = null
try { host = await import('../lib/index.js') } catch (error) {
  console.log('  skip (host dependencies not installed: ' + (error && error.message) + ')')
}
if (host !== null) {
  ok('Config is a schemastery object with both fields volatile', () => {
    equal(typeof host.Config, 'function', 'Schema is callable')
    equal(host.Config.type, 'object', 'Config.type')
    equal(host.Config.dict.state.meta.volatile, true, 'state.meta.volatile')
    equal(host.Config.dict.legacyImported.meta.volatile, true, 'legacyImported.meta.volatile')
  })
  ok('ownEntryId finds this package row by name and fiber', () => {
    const fiber = { id: 'f' }
    const ctx = { fiber, loader: { entries: () => [
      { options: { id: 'other', name: 'other-plugin' }, fiber: {} },
      { options: { id: 'sidebar-groups', name: 'PLUGIN' }, fiber },
    ] } }
    ctx.loader.entries = () => [
      { options: { id: 'other', name: 'other-plugin' }, fiber: {} },
      { options: { id: 'sidebar-groups', name: 'dsh-sidebar-groups' }, fiber },
    ]
    equal(host.ownEntryId(ctx), 'sidebar-groups', 'entry id (== settings namespace)')
  })
  ok('the routes read and write the namespace with an optimistic revision', () => {
    const updates = []
    const settings = {
      describe: () => [{ ns: 'sidebar-groups', revision: 7, value: { state: null } }],
      update: async (ns, patch, revision) => { updates.push({ ns, patch, revision }) },
    }
    const routes = []
    let handler = null
    host.apply({
      fiber: { id: 'f' },
      loader: { entries: () => [{ options: { id: 'sidebar-groups', name: 'dsh-sidebar-groups' }, fiber: { id: 'f' } }] },
      effect: callback => callback(),
      inject(dependencies, callback) {
        if (dependencies.includes('webServer')) callback({ webServer: { register(route) { routes.push(route); handler = route.handler; return () => {} } } })
        else callback({ settings })
      },
    }, {})
    equal(routes.length, 1, 'registered routes')
    equal(routes[0].path, '/sidebar-groups/api', 'route path')
    const call = (method, url, body) => new Promise(resolve => {
      const request = {
        method,
        url,
        on(event, listener) {
          if (event === 'data' && body !== undefined) listener(JSON.stringify(body))
          if (event === 'end') listener()
        },
      }
      const response = {
        writeHead(status) { this.status = status },
        end(text) { resolve({ status: this.status, body: JSON.parse(text) }) },
      }
      handler(request, response)
    })
    return (async () => {
      const read = await call('GET', '/sidebar-groups/api/state')
      equal(read.status, 200, 'GET status')
      equal(read.body.state, null, 'GET with nothing stored yet')
      const written = await call('POST', '/sidebar-groups/api/update', {
        state: { nav: { groups: [{ id: 'top', label: 'top', collapsed: false, showHeader: false, items: ['a'] }] } },
      })
      equal(written.status, 200, 'POST status')
      equal(updates.length, 1, 'settings.update call count')
      equal(updates[0].ns, 'sidebar-groups', 'namespace')
      equal(updates[0].revision, 7, 'expected revision')
      equal(updates[0].patch.state.scrolling, true, 'missing fields filled with defaults')
      equal(updates[0].patch.state.nav.groups[0].items[0], 'a', 'round-tripped item')
      equal((await call('GET', '/sidebar-groups/api/nope')).status, 404, 'unknown method status')
      equal((await call('POST', '/sidebar-groups/api/update', { nope: 1 })).status, 400, 'bad body status')
    })()
  })
}

console.log('')
console.log(String(checks - failures) + ' passed, ' + failures + ' failed, ' + checks + ' total')
if (failures > 0) process.exitCode = 1
