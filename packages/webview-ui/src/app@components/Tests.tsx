
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

export default function Tests() {
	return (
		<div>
			<h2 className="mb-2 text-base text-(--vscode-foreground)">Testss</h2>
			<VSCodeButton onClick={() => {
				
			}}>
				Run Tests
			</VSCodeButton>
		</div>
	);
}