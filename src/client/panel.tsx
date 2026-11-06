/**
 * The configuration panel: the only React in the package, and the only place
 * the user can move a row between groups.
 *
 * It renders through a PORTAL into `document.body`, because a slot cell lives
 * inside the sidebar's flex column — an inline dialog there would be clipped by
 * the very overflow this plugin introduces.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GroupSpec, NavEntry, SectionSpec } from './config.js'
import type { SectionName, SidebarGroupsStore } from './store.js'

export interface GroupPanelProps {
  store: SidebarGroupsStore
  /** Live navigation entries (registry order, labels resolved). */
  entries(): NavEntry[]
  /** Live workspace section labels read off the DOM. */
  workspaces(): string[]
  /**
   * One plain-text line describing the adapter's state. It exists because the
   * interesting failures (React not painted yet, drawer mode, the 56px rail)
   * are invisible in the UI: the plugin looks installed and does nothing.
   */
  diagnostics(): string
  onClose(): void
}

const OVERLAY = {
  position: 'fixed',
  inset: '0',
  zIndex: '2147483000',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, .38)',
} as const

const CARD = {
  display: 'flex',
  flexDirection: 'column',
  width: 'min(520px, calc(100vw - 32px))',
  maxHeight: 'min(78vh, 720px)',
  overflow: 'hidden',
  borderRadius: '14px',
  background: 'var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, #fff))',
  color: 'var(--dsw-alias-text-primary, inherit)',
  boxShadow: '0 24px 64px rgba(0, 0, 0, .32)',
  border: '1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,.24))',
  font: 'inherit',
  fontSize: '13px',
} as const

const ROW = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 6px',
  borderRadius: '8px',
} as const

const CLICK = {
  cursor: 'pointer',
  border: '1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,.28))',
  background: 'transparent',
  color: 'inherit',
  borderRadius: '6px',
  padding: '1px 6px',
  font: 'inherit',
  lineHeight: '18px',
} as const

/** Store subscription without pulling in an external state library. */
function useStore(store: SidebarGroupsStore) {
  const [state, setState] = useState(() => store.get())
  useEffect(() => store.subscribe(setState), [store])
  return state
}

function GroupRow(props: {
  name: SectionName
  group: GroupSpec
  index: number
  total: number
  store: SidebarGroupsStore
  /** React list key. */
  key?: string
}) {
  const { name, group, index, total, store } = props
  return (
    <div style={{ ...ROW, marginTop: '6px', fontWeight: 600 }}>
      <button
        type="button"
        style={CLICK}
        title={group.collapsed ? '展开' : '折叠'}
        aria-expanded={group.collapsed ? 'false' : 'true'}
        onClick={() => store.setGroupCollapsed(name, group.id, !group.collapsed)}
      >
        {group.collapsed ? '▸' : '▾'}
      </button>
      <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.label}</span>
      <button type="button" style={CLICK} title="上移" disabled={index === 0} onClick={() => store.moveGroup(name, group.id, -1)}>↑</button>
      <button type="button" style={CLICK} title="下移" disabled={index === total - 1} onClick={() => store.moveGroup(name, group.id, 1)}>↓</button>
      <button
        type="button"
        style={CLICK}
        title={total <= 1 ? '至少保留一个分组' : '删除分组'}
        disabled={total <= 1}
        onClick={() => store.removeGroup(name, group.id)}
      >✕</button>
    </div>
  )
}

function ItemRow(props: {
  name: SectionName
  spec: SectionSpec
  groupId: string
  itemId: string
  index: number
  total: number
  label: string
  store: SidebarGroupsStore
  /** React list key. */
  key?: string
}) {
  const { name, spec, groupId, itemId, index, total, label, store } = props
  return (
    <div style={{ ...ROW, paddingLeft: '26px' }}>
      <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <button type="button" style={CLICK} title="上移" disabled={index === 0} onClick={() => store.moveItem(name, itemId, -1)}>↑</button>
      <button type="button" style={CLICK} title="下移" disabled={index === total - 1} onClick={() => store.moveItem(name, itemId, 1)}>↓</button>
      <select
        style={{ ...CLICK, maxWidth: '128px' }}
        value={groupId}
        title="移到分组"
        onChange={(event: { currentTarget: { value: string } }) => store.assign(name, itemId, event.currentTarget.value)}
      >
        {spec.groups.map(group => (
          <option key={group.id} value={group.id}>{group.label}</option>
        ))}
      </select>
    </div>
  )
}

function Section(props: {
  name: SectionName
  title: string
  hint: string
  ids: string[]
  labels: Map<string, string>
  spec: SectionSpec
  store: SidebarGroupsStore
}) {
  const { name, title, hint, ids, labels, spec, store } = props
  return (
    <section style={{ padding: '10px 14px', borderTop: '1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,.18))' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <strong style={{ fontSize: '13px' }}>{title}</strong>
        <span style={{ opacity: .6, fontSize: '11px' }}>{hint}</span>
        <span style={{ flex: '1 1 auto' }} />
        <button type="button" style={CLICK} onClick={() => store.addGroup(name, name === 'nav' ? '新分组' : '新工作区分组')}>+ 分组</button>
      </div>
      {ids.length === 0 ? <p style={{ opacity: .6, margin: '8px 0 0' }}>还没有可分组的内容。</p> : null}
      {spec.groups.map((group, groupIndex) => {
        const items = group.items.filter(id => ids.includes(id))
        return (
          <div key={group.id}>
            <GroupRow name={name} group={group} index={groupIndex} total={spec.groups.length} store={store} />
            {group.collapsed ? null : items.map((itemId, index) => (
              <ItemRow
                key={itemId}
                name={name}
                spec={spec}
                groupId={group.id}
                itemId={itemId}
                index={index}
                total={items.length}
                label={labels.get(itemId) ?? itemId}
                store={store}
              />
            ))}
          </div>
        )
      })}
    </section>
  )
}

export function GroupPanel(props: GroupPanelProps) {
  const { store, entries, workspaces, diagnostics, onClose } = props
  const state = useStore(store)
  const navEntries = entries()
  const navIds = navEntries.map(entry => entry.id)
  const navLabels = new Map(navEntries.map(entry => [entry.id, entry.label] as const))
  const workspaceIds = workspaces()
  const workspaceLabels = new Map(workspaceIds.map(id => [id, id] as const))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    const doc = (globalThis as { document?: Document }).document
    doc?.addEventListener('keydown', onKey)
    return () => doc?.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={OVERLAY} onPointerDown={(event: { target: unknown; currentTarget: unknown }) => { if (event.target === event.currentTarget) onClose() }}>
      <div style={CARD} role="dialog" aria-modal="true" aria-label="侧栏分组">
        <header style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px' }}>
          <strong style={{ fontSize: '14px' }}>侧栏分组</strong>
          <span style={{ opacity: .6, fontSize: '11px' }}>改动立即生效，无需刷新</span>
          <span style={{ flex: '1 1 auto' }} />
          <button type="button" style={CLICK} onClick={onClose} title="关闭">✕</button>
        </header>
        <div style={{ overflowY: 'auto' }}>
          <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={state.scrolling}
                onChange={(event: { currentTarget: { checked: boolean } }) => store.setScrolling(event.currentTarget.checked)}
              />
              整列滚动（顶部/底部固定）
            </label>
          </div>
          <Section
            name="nav"
            title="导航项"
            hint="顶层分组不显示标题"
            ids={navIds}
            labels={navLabels}
            spec={state.nav}
            store={store}
          />
          <Section
            name="workspaces"
            title="工作区"
            hint="不足两项时自动不显示分组头"
            ids={workspaceIds}
            labels={workspaceLabels}
            spec={state.workspaces}
            store={store}
          />
        </div>
        <div
          style={{
            padding: '6px 14px 0',
            fontSize: '10.5px',
            lineHeight: '15px',
            opacity: .62,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            wordBreak: 'break-all',
          }}
          title={diagnostics()}
        >
          {diagnostics()}
        </div>
        <footer style={{ display: 'flex', gap: '8px', padding: '10px 14px', borderTop: '1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,.18))' }}>
          <button type="button" style={CLICK} onClick={() => store.reset(navEntries)}>恢复默认</button>
          <span style={{ flex: '1 1 auto' }} />
          <button type="button" style={CLICK} onClick={onClose}>完成</button>
        </footer>
      </div>
    </div>
  )
}

/** Portal wrapper: nothing renders until the user asks for the panel. */
export function GroupPanelPortal(props: GroupPanelProps) {
  const doc = (globalThis as { document?: Document }).document
  if (doc === undefined || doc.body === null || doc.body === undefined) return null
  return createPortal(<GroupPanel {...props} />, doc.body) as never
}
