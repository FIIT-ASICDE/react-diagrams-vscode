export * from "./parsing-cache";

import { parseReactComponent } from "@react-diagrams/core/app@state-diagram";
import { ParsingCache } from "./parsing-cache";

export const componentStateCache = new ParsingCache(parseReactComponent);