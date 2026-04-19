import * as vscode from "vscode";
export async function selectModelByType(modelType: string): Promise<vscode.LanguageModelChat | undefined> {
    const normalized = modelType.trim();

    if (!normalized || normalized === "copilot") {
        const [defaultModel] = await vscode.lm.selectChatModels({ vendor: "copilot" });
        return defaultModel;
    }

    if (normalized.includes(":")) {
        const [vendorPart, familyPart] = normalized.split(":", 2);
        const vendor = vendorPart?.trim();
        const family = familyPart?.trim();

        if (vendor && family) {
            const [exactModel] = await vscode.lm.selectChatModels({ vendor, family });
            if (exactModel)
                return exactModel;
        }
    }

    const [familyModel] = await vscode.lm.selectChatModels({ vendor: "copilot", family: normalized });
    if (familyModel)
        return familyModel;

    const [fallbackModel] = await vscode.lm.selectChatModels({ vendor: "copilot" });
    return fallbackModel;
}

export const MODEL_TYPE = "copilot";
