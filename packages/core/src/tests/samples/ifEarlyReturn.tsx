import { useEffect, useState } from "react";

export default function IfElseWithEarlyReturn() {
	const [state1, setState1] = useState<number>(0);
	const [tstUnused, setTstUnused] = useState<string>("");

	const arr = [1, 2, 3, 4, 5];

	let smting = true;

	useEffect(() => {
		if (arr.length && state1 == 0) {
			setState1(arr[0]);
		}
	}, []);

	// ...

	function dontCare() {
		if (arr[0])
			return "1";

		if (arr[1])
		{
			return "2";
		}
	}

	function func01(num = 1) {
		setState1(0x01);

		if (typeof num != "number")
			return;

		setState1(num);
	}

	function doSomething() {
		setState1(0);

		if (arr[0] == 1)
			return

		if (arr[1] == 2)
		{
			setState1(2);
			if (smting)
				console.debug("Something");
		}

		if (arr[0] == 3)
			setState1(3);

		for (let i = 0; i < arr.length; i++) {
			let lowest = i;
			for (let j = i + 1; j < arr.length; j++)
				if (arr[lowest] > arr[j])
					lowest = j;

			if (i !== lowest)
				[arr[i],arr[lowest]] = [arr[lowest], arr[i]];
		}

		if (arr.length > 5)
			setState1(arr.length);
	}

	// ...
}