import { useCallback, useState } from "react";

export default function SwitchWithLoops() {
  const [mode, setMode] = useState<"idle" | "scan" | "match" | "skip" | "error" | "complete">("idle");
  const [index, setIndex] = useState(0);

  setIndex(1);

  const func12 = useCallback((idk: string) => {
    console.debug(idk)

    if (mode == "complete") {
      setMode("idle");
    }
  }, [mode]);

  function processItems(type: string, items?: number[]) {
    setMode("scan");
    setIndex(0);

    if (!items) {
      console.warn("No items provided");
      return;
    }

	if (items.length === 0) {
	  console.log("No items to process", items.length);
	}
    switch (type) {
      case "something":
        console.log("Processing something");
      case "others":
      case "fast":
        setMode("match");
        break;

      case "slow":
        setMode("skip");
        return;

      case "broken":
        setMode("error");
        break;

      case "error":
        if (items.length > 100) {
          console.error("An error occurred while processing alot of items");
        }
        else {
          console.error("An error occurred while processing items");
        }
        break;

      default:
        setMode("idle");
    }

    var count = 2;
    while (count-- > 0) {
      for (let i = 0; i < items.length; i++) {
        if (i)
          console.debug(`Processed item ${i}: ${items[i]}`);
  
        setIndex(i);
  
        if (items[i] < 0) {
          setMode("error");
          break;
        }
  
        if (items[i] === 0) {
          setMode("skip");
          continue;
        }
  
        if (items[i] % 2 === 0) {
          setMode("match");
        }
      }
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

  setMode("complete");

	console.debug("Processing complete");
  }

  return <>
    <button onClick={() => processItems("fast", [1, 2, 0, 4])}>Process</button>
    <button onClick={() => func12("reset")}>Rst</button>
  </>;
}