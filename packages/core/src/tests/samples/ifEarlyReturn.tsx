import { useState } from "react";

export default function IfElseWithEarlyReturn() {
	const [state1, setState1] = useState<number>(0);

	const arr = [1, 2, 3, 4, 5];

	function doSomething() {
		setState1(0);

		if (condition1)
			return

		if (condition2)
		{
			setState1(2);
			if (smting)
				console.debug("Something");
		}

		if (condition3)
			setState1(3);

		for (let i = 0; i < arr.length; i++) {
			let lowest = i;
			for (let j = i + 1; j < arr.length; j++)
				if (arr[lowest] > arr[j])
					lowest = j;

			if (i !== lowest)
				[arr[i],arr[lowest]] = [arr[lowest], arr[i]];
		}

		setState1(arr.length);
	}

	// ...
}