import { useState } from "react";

export default function TryCatchFinallyNested() {
  const [state, setState] = useState<"idle" | "loading" | "retrying" | "success" | "error" | "cleanup">("idle");
  const [errorCount, setErrorCount] = useState(0);

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
      setErrorCount(prev => prev + 1);
      setState("error");

      if (shouldRetry) {
        setState("retrying");

        try {
          if (Math.random() > 0.5) {
            throw new Error("Retry failure");
          }

          setState("success");
        } catch {
          setState("error");
        }
      }
    } finally {
      do {
        setState("cleanup");
      }
      while (Math.random() > 0.5);
    }
  }

  return <button onClick={() => loadData(true, true)}>Load</button>;
}