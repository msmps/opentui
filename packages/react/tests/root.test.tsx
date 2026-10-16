import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import type { Renderable } from "@opentui/core"
import { createTestRenderer, ManualClock } from "@opentui/core/testing"
import { act, useEffect, useState } from "react"
import { createRoot, type Root } from "../src/reconciler/renderer.js"

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let previousActEnvironment: boolean | undefined
let setup: Awaited<ReturnType<typeof createTestRenderer>>
let root: Root
let originalChildren: Renderable[]

beforeEach(async () => {
  previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT
  environment.IS_REACT_ACT_ENVIRONMENT = true
  originalChildren = []
  setup = await createTestRenderer({ width: 20, height: 6, clock: new ManualClock() })
  root = createRoot(setup.renderer)
})

afterEach(async () => {
  try {
    await act(() => root.unmount())
    // A failing rerender regression can detach the first tree without destroying it.
    for (const child of originalChildren) if (!child.isDestroyed) child.destroyRecursively()
    await act(() => setup.dispose())
  } finally {
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  }
})

test.each(["unmount", "destroy"] as const)("rerenders preserve state and clean up effects on %s", async (teardown) => {
  const events: string[] = []
  let setCount!: (value: number) => void
  function Counter({ label }: { label: string }) {
    const [count, update] = useState(0)
    setCount = update
    useEffect(() => {
      events.push(`mount:${label}`)
      return () => {
        events.push(`cleanup:${label}`)
      }
    }, [])
    return (
      <text>
        {label}:{count}
      </text>
    )
  }

  await act(() => root.render(<Counter label="first" />))
  originalChildren = setup.renderer.root.getChildren()
  await act(() => setCount(7))
  await act(() => root.render(<Counter label="second" />))
  await setup.renderOnce()
  expect(setup.captureCharFrame()).toContain("second:7")
  expect(setup.renderer.root.getChildren()).toEqual(originalChildren)
  expect(events).toEqual(["mount:first"])

  await act(() => root.render(<Counter key="replacement" label="third" />))
  expect(events).toEqual(["mount:first", "cleanup:first", "mount:third"])
  await act(() => (teardown === "unmount" ? root.unmount() : setup.renderer.destroy()))
  if (teardown === "destroy") await setup.renderer.closed
  expect(events).toEqual(["mount:first", "cleanup:first", "mount:third", "cleanup:third"])
})

test("explicit renders retry the same element after an error", async () => {
  using errors = spyOn(console, "error").mockImplementation(() => {})
  let broken = true
  function App() {
    if (broken) throw new Error("root render failed")
    return <text>recovered</text>
  }
  const element = <App />
  await act(() => root.render(element))
  expect(errors).toHaveBeenCalled()
  broken = false
  await act(() => root.render(element))
  await setup.renderOnce()
  expect(setup.captureCharFrame()).toContain("recovered")
})
