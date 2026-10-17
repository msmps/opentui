import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { createTestRenderer, ManualClock } from "@opentui/core/testing"
import { useEffect, useState } from "react"
import { createRoot, flushSync, type Root } from "../src/reconciler/renderer.js"

let setup: Awaited<ReturnType<typeof createTestRenderer>>
let root: Root

beforeEach(async () => {
  setup = await createTestRenderer({ width: 20, height: 6, clock: new ManualClock() })
  root = createRoot(setup.renderer)
})

afterEach(() => setup.dispose())

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

  flushSync(() => root.render(<Counter label="first" />))
  flushSync(() => setCount(7))
  flushSync(() => root.render(<Counter label="second" />))
  await setup.renderOnce()
  expect(setup.captureCharFrame()).toContain("second:7")
  expect(events).toEqual(["mount:first"])

  flushSync(() => root.render(<Counter key="replacement" label="third" />))
  expect(events).toEqual(["mount:first", "cleanup:first", "mount:third"])
  if (teardown === "unmount") root.unmount()
  else setup.renderer.destroy()
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
  flushSync(() => root.render(element))
  expect(errors).toHaveBeenCalled()
  broken = false
  flushSync(() => root.render(element))
  await setup.renderOnce()
  expect(setup.captureCharFrame()).toContain("recovered")
})
