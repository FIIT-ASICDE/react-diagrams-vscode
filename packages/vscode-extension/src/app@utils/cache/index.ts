export * from "./parsing-cache";

import { parseReactComponent } from "@react-diagrams/core";
import { ParsingCache } from "./parsing-cache";

export const componentStateCache = new ParsingCache(parseReactComponent);