import { useState } from "react";

export default function GuardClausesAndMultipleIfs() {
  const [status, setStatus] = useState<"start" | "validating" | "warning" | "processing" | "failed" | "success">("start");
  const [message, setMessage] = useState<string>("");

  const doBench = true

  function runTask(input: string, shouldWarn: boolean, shouldFail: boolean) {
    setStatus("validating");
    setMessage("");

    if (doBench)
      console.time("runTask");

    if (!input) {
      setMessage("Missing input");
      setStatus("failed");
      throw new Error("Input is required");
    }

    if (input.length < 3) {
      setMessage("Too short");
      setStatus("failed");
      throw new Error("Input is too short");
    }

    if (shouldWarn) {
      setStatus("warning");
      setMessage("Non-critical issue");
    }

    if (shouldFail) {
      setStatus("failed");
      throw new Error("Task failed");
    }

    setStatus("processing");

    if (input.startsWith("x")) {
      setMessage("Special path");
    }

    setStatus("success");

    if (doBench)
      console.timeEnd("runTask");
  }

  return <button onClick={() => runTask("abc", true, false)}>Run</button>;
}