/* Synthetic example generated for testing the diagram and models understanding of it */

import { useRef, useState } from "react";

export default function TryCatchFinallyNested(props: { logidyLogLog?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "retrying" | "success" | "error" | "cleanup">("idle");
  const [mode, setMode] = useState("idle");
  const errorCount = useRef(0);

  function handle(items: number[], lookup: Record<string, number>) {
		outer: for (const item of items) {
			if (item < 0) {
				setMode("error");
				break;
			}

			if (item === 0) {
				setMode("skip");
				continue outer;
			}

      for (const key in lookup) {
        if (lookup[key] > 10) {
          setMode(key);
          break outer;
        }
      }
  
			setMode("seen");
		}
	}

  async function loadData(shouldThrow: boolean, shouldRetry: boolean, logidyLogLog = props.logidyLogLog) {
    setState("loading");

	if (logidyLogLog) {
	  console.log("Log log log");
	}

    try {
      if (shouldThrow) {
        throw new Error("Primary failure");
      }

      setState("success");
    } catch (err) {
      errorCount.current += 1;
      setState("error");

      if (shouldRetry) {
        setState("retrying");

        do {
          try {
            if (Math.random() > 0.5) {
              throw new Error("Retry failure");
            }
    
            setState("success");
          } catch {
            setState("error");
          }
        }
        while (state == 'error' && errorCount.current < 3);
      }
    } finally {
      setState('cleanup');
      errorCount.current = 0;
    }
  }

  if (state == "success") {
    return <button onClick={() => handle([1, 0, -1], { a: 1, b: 11 })}>Run</button>;
  }
  return <button onClick={() => loadData(true, true)}>Load</button>;
}