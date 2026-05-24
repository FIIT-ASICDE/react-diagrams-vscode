export * from "./parsing-cache";

import { parseReactComponent } from "@react-diagrams/core";
import { ParsingImageCache } from "./parsing-cache";

export const componentStateCache = new ParsingImageCache(parseReactComponent);