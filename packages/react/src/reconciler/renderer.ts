import { CliRenderer, CliRenderEvents, engine } from "@opentui/core"
import React, { type ReactNode } from "react"
import type { OpaqueRoot } from "react-reconciler"
import { AppContext } from "../components/app.js"
import { ErrorBoundary } from "../components/error-boundary.js"
import { _render, reconciler } from "./reconciler.js"

// flushSync was renamed to flushSyncFromReconciler in react-reconciler 0.32.0
// the types for react-reconciler are not up to date with the library
const _r = reconciler as typeof reconciler & { flushSyncFromReconciler?: typeof reconciler.flushSync }
const flushSync = _r.flushSyncFromReconciler ?? _r.flushSync
const { createPortal } = reconciler

export type Root = {
  render: (node: ReactNode) => void
  unmount: () => void
}

/**
 * Creates a root for rendering a React tree with the given CLI renderer.
 * @param renderer The CLI renderer to use
 * @returns A root object with a `render` method
 * @example
 * ```tsx
 * const renderer = await createCliRenderer()
 * createRoot(renderer).render(<App />)
 * ```
 */
export function createRoot(renderer: CliRenderer): Root {
  let container: OpaqueRoot | null = null
  let renderVersion = 0
  const appContext = { keyHandler: renderer.keyInput, renderer }

  const cleanup = () => {
    if (container) {
      renderer.off(CliRenderEvents.DESTROY, cleanup)
      reconciler.updateContainerSync(null, container, null, () => {})
      reconciler.flushSyncWork()
      container = null
    }
  }

  return {
    render: (node: ReactNode) => {
      if (renderer.isDestroyed) return
      engine.attach(renderer)
      const element = React.createElement(
        AppContext.Provider,
        { value: appContext },
        // Explicit renders retry failed trees without remounting healthy children.
        React.createElement(ErrorBoundary, { resetKey: ++renderVersion, children: node }),
      )
      if (container) {
        reconciler.updateContainer(element, container, null, () => {})
      } else {
        container = _render(element, renderer.root)
        renderer.once(CliRenderEvents.DESTROY, cleanup)
      }
    },

    unmount: cleanup,
  }
}

export { createPortal, flushSync }
