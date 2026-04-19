import { useState } from "react";

export default function SwitchWithLoops() {
  const [mode, setMode] = useState<"idle" | "scan" | "match" | "skip" | "error" | "complete">("idle");
  const [index, setIndex] = useState(0);

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

    switch (type) { // TESTING "return bug"
      // Order of cases does not seem to affect the "return bug"

      case "fast":
        return; // This always breaks it, no diagram generated from this point on unless...
  
      case "slow":
        // setMode("skip"); // When any setMode is present, diagram for "mode" will continue to be generated correctly
        break;
        
      case "slow":
        // setIndex(0); // When any setIndex is present, diagram for "index" will continue to be generated correctly
        break;

      // If both setMode and setIndex are present, both diagrams will continue to be generated correctly even with the "return" 

      //...
      default:
        break;
    }

    // switch (type) {
    //   case "fast":
    //     setMode("match");
    //     break;

    //   case "slow":
    //     setMode("skip");
    //     return;

    //   case "broken":
    //     setMode("error");
    //     break;

    //   case "error":
    //     console.error("An error occurred while processing items");
    //     break;

    //   default:
    //     setMode("idle");
    // }

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

	if (Math.random() > 0.5) {
	  console.log("Random log");
	}

  setMode("complete");

	console.debug("Processing complete");
  }

  return <button onClick={() => processItems("fast", [1, 2, 0, 4])}>Process</button>;
}