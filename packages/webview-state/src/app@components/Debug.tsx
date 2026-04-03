import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

type DebugProps = {
	value: unknown;
};

export default function Debug({ value }: DebugProps) {
	return (
		<div className="h-full overflow-auto p-3 text-sm w-full">
			{/* <div className="mb-2 text-(--vscode-foreground)">Debug payload</div> */}
			<JsonView src={value} />

			<VSCodeButton onClick={() => {
				console.log(value);
			}}>
				Log
			</VSCodeButton>
		</div>
	);
}
