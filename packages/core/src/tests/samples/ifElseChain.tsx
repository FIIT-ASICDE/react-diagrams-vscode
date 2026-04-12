import { useState } from "react";

function doSomething() {
  if (Date.now() % 2 === 0) {
    console.log("Even");
  } else {
    console.log("Odd");
  }
}

export default function IfElseChainComplex() {
  const [phase, setPhase] = useState<"idle" | "checking" | "small" | "medium" | "large" | "done">("idle");
  const [count, setCount] = useState(0);

  const cond = phase === "idle";

  const init = () => {
    if (cond) {
      console.log("Init");
    }

    setPhase("checking");
    return "idk";
  };

  function handleProcess(value: number) {
    setCount(value);

    if (value < 0) {
      setPhase("idle");
    } else if (value === 0) {
      setPhase("small");
    } else if (value < 10) {
      setPhase("medium");
    } else {
      setPhase("large");
    }

	doSomething();
    setPhase("done");
  }

  init();
  return <button onClick={() => handleProcess(count + 1)}>Run</button>;
}