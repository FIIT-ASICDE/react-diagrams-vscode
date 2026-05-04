import React, { useCallback, useEffect, useState } from "react";

// Refactored version of SwitchWithLoops that minimizes rapid in-loop
// `setMode` calls and yields between outer iterations so React can flush
// updates. Kept behavior intent but made updates deterministic.
export default function SwitchWithLoopsRefactor() {
  const [mode, setMode] = useState<"idle" | "scan" | "match" | "skip" | "error" | "complete">("idle");
  const [index, setIndex] = useState(0);

  // Run once on mount to mirror the original sample's intent to set index to 1,
  // but avoid calling state setters during render.
  useEffect(() => {
    setIndex(1);
  }, []);

  const func12 = useCallback((idk: string) => {
    console.debug(idk);

    // preserve original behavior: if already complete, reset to idle
    if (mode === "complete") {
      setMode("idle");
    }
  }, [mode]);

  // processItems is async so we can yield to the event loop between heavy
  // iterations and let React apply state changes.
  async function processItems(type: string, items?: number[]) {
    // mark scan immediately
    setMode("scan");
    setIndex(0);

    if (!items) {
      console.warn("No items provided");
      return;
    }

    if (items.length === 0) {
      console.log("No items to process", items.length);
    }

    // Decide initial branch outcome without mutating mode repeatedly.
    let localMode: typeof mode = "idle";

    switch (type) {
      case "something":
        console.log("Processing something");
      // fallthrough
      case "others":
      case "fast":
        localMode = "match";
        break;

      case "slow":
        // short-circuit: keep behavior of immediately skipping
        setMode("skip");
        return;

      case "broken":
        localMode = "error";
        break;

      case "error":
        if (items.length > 100) {
          console.error("An error occurred while processing a lot of items");
        } else {
          console.error("An error occurred while processing items");
        }
        localMode = "error";
        break;

      default:
        localMode = "idle";
    }

    // Apply chosen branch mode once.
    setMode(localMode);

    // Outer loop preserved, but we yield between outer iterations to avoid
    // blocking and to let React coalesce fewer state changes.
    let count = 2;
    outer: while (count-- > 0) {
      // Track previous mode locally so we only call setMode when it meaningfully changes
      // (reduces rapid repeated state updates).
      let prevLocalMode = localMode;

      for (let i = 0; i < items.length; i++) {
        if (i) console.debug(`Processed item ${i}: ${items[i]}`);

        // update index occasionally (every iteration here to preserve intent,
        // could be throttled if noisier)
        setIndex(i);

        const v = items[i];
        if (v < 0) {
          localMode = "error";
          // apply immediately and break out of both loops to match original break
          if (localMode !== prevLocalMode) setMode(localMode);
          prevLocalMode = localMode;
          break outer;
        }

        if (v === 0) {
          localMode = "skip";
          if (localMode !== prevLocalMode) setMode(localMode);
          prevLocalMode = localMode;
          // continue inner loop
          continue;
        }

        if (v % 2 === 0) {
          localMode = "match";
          if (localMode !== prevLocalMode) setMode(localMode);
          prevLocalMode = localMode;
        }
      }

      // yield to the event loop so React can flush state updates and keep UI responsive
      // especially useful in environments with concurrent rendering.
      // Small microtask yield is sufficient here.
      await Promise.resolve();
    }

    switch (type) {
      case "fast":
        console.log("Finished processing items quickly");
        break;
      default:
        console.log("Finished");
    }

    if (Math.random() > 0.5) {
      console.log("Random log");
    }

    // finalize
    setMode("complete");
    console.debug("Processing complete");
  }

  return <>
    <button onClick={() => void processItems("fast", [1, 2, 0, 4])}>Process (refactor)</button>
    <button onClick={() => func12("reset")}>Rst</button>
  </>;
}
