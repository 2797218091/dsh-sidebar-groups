/**
 * The two kinds of module this package uses but does not depend on at build
 * time, declared by hand so devDependencies can stay exactly "tsdown +
 * typescript".
 *
 *  1. react / react-dom / react/jsx-runtime are PLATFORM SEED modules
 *     (DOM-CONTRACT.md section H.1): always present in the browser host, never
 *     installed here.
 *  2. node:fs / node:os / node:path exist at runtime; only their types would
 *     come from @types/node, which this package deliberately does not install.
 *     Only the handful of members the host half calls is declared.
 */

declare namespace JSX {
  type Element = unknown
  interface ElementChildrenAttribute { children: Record<string, unknown> }
  interface IntrinsicElements { [name: string]: Record<string, unknown> }
}

declare module 'react' {
  export type ReactNode = unknown
  export interface ReactElement { readonly __element?: true }
  export interface MutableRefObject<T> { current: T }
  export function createElement(type: unknown, props?: unknown, ...children: unknown[]): ReactElement
  export function useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void]
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T
  export function useRef<T>(initial: T): MutableRefObject<T>
  export function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]): T
  export const Fragment: unknown
  const React: { createElement: typeof createElement; Fragment: unknown }
  export default React
}

declare module 'react-dom' {
  import type { ReactNode } from 'react'
  export function createPortal(children: ReactNode, container: unknown, key?: string | null): ReactNode
}

declare module 'react/jsx-runtime' {
  export const Fragment: unknown
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown
  export namespace JSX {
    type Element = unknown
    interface ElementChildrenAttribute { children: Record<string, unknown> }
    interface IntrinsicElements { [name: string]: Record<string, unknown> }
  }
}

declare module 'node:fs' {
  export function existsSync(candidate: string): boolean
  export function readFileSync(candidate: string, encoding: 'utf8'): string
  export function renameSync(from: string, to: string): void
}

declare module 'node:os' {
  export function homedir(): string
}

declare module 'node:path' {
  export function join(...parts: string[]): string
}
