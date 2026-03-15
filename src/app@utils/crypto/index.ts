import crypto from "crypto";

export function getNonce(size = 11) {
	return crypto.randomBytes(size).toString("hex");
}