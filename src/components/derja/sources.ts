import { createContext } from "react";
import type { WordSource } from "../../lib/derja";

/**
 * The derja words of the page being drawn (Phase 17). A screen that shows a profile provides them
 * once, already narrowed to the terms that stand in its texts; every DerjaText below reads them.
 * Without a provider there are none, and a text is drawn as it is.
 */
export const DerjaSources = createContext<WordSource[]>([]);
