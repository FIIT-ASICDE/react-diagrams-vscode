import type { WebviewApi } from "vscode-webview";

/**
 * A utility wrapper around the VS Code API.
 */
export class VSCodeAPIWrapper<T> {
	private readonly vsCodeApi: WebviewApi<T> | undefined;

	constructor(
		private readonly storageKey: string,
	) {
		if (typeof acquireVsCodeApi === "function") {
			this.vsCodeApi = acquireVsCodeApi();
		}

		// window.addEventListener("message", this.vscodeMessageListener);
	}

	/**
	 * Post a message (i.e. send arbitrary data) to the owner of the webview.
	 *
	 * @remarks When running webview code inside a web browser, postMessage will instead
	 * log the given message to the console.
	 *
	 * @param message Abitrary data (must be JSON serializable) to send to the extension context.
	 */
	public postMessage(type: string, data?) {
		const message = { type, data };
		if (this.vsCodeApi)
			return this.vsCodeApi.postMessage(message);
		
		console.warn("Unable to post message, no acquireVsCodeApi", message);
	}

	/**
	 * Get the persistent state stored for this webview.
	 *
	 * @remarks When running webview source code inside a web browser, getState will retrieve state
	 * from local storage (https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
	 *
	 * @return The current state or `undefined` if no state has been set.
	 */
	public getState(){
		if (this.vsCodeApi)
			return this.vsCodeApi.getState();

		const state = localStorage.getItem(this.storageKey);
		return state ? JSON.parse(state) : undefined;
	}

	/**
	 * Set the persistent state stored for this webview.
	 *
	 * @remarks When running webview source code inside a web browser, setState will set the given
	 * state using local storage (https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
	 *
	 * @param newState New persisted state. This must be a JSON serializable object. Can be retrieved
	 * using {@link getState}.
	 *
	 * @return The new state.
	 */
	public setState(newState: T): T {
		if (this.vsCodeApi)
			return this.vsCodeApi.setState(newState);

		localStorage.setItem(this.storageKey, JSON.stringify(newState));
		return newState;
	}
}