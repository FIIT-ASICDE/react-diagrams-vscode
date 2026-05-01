import { useRef, useState } from "react";

export default function TryCatchFinallyNested() {
  const [state, setState] = useState<"idle" | "loading" | "retrying" | "success" | "error" | "cleanup">("idle");
  const errorCount = useRef(0);

  async function loadData(shouldThrow: boolean, shouldRetry: boolean, logidyLogLog = false) {
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

  return <button onClick={() => loadData(true, true)}>Load</button>;
}