import { useState } from "react";

export default function SwitchWithLoops() {
  const [mode, setMode] = useState<"idle" | "scan" | "match" | "skip" | "error" | "complete">("idle");
  const [index, setIndex] = useState(0);

  function processItems(kind: string, items: number[]) {
    setMode("scan");
    setIndex(0);

	if (items.length === 0) {
	  console.log("No items to process", items.length);
	}

    switch (kind) {
      case "fast":
        setMode("match");
        break;

      case "slow":
        setMode("skip");
        break;

      case "broken":
        setMode("error");
        return;

      default:
        setMode("idle");
    }

    // for (let i = 0; i < items.length; i++) {
    //   setIndex(i);

    //   if (items[i] < 0) {
    //     setMode("error");
    //     break;
    //   }

    //   if (items[i] === 0) {
    //     setMode("skip");
    //     continue;
    //   }

    //   if (items[i] % 2 === 0) {
    //     setMode("match");
    //   }
    // }

	if (Math.random() > 0.5) {
	  console.log("Random log");
	}

  setMode("complete");

	console.debug("Processing complete");
  }

  return <button onClick={() => processItems("fast", [1, 2, 0, 4])}>Process</button>;
}