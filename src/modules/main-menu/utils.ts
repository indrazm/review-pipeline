import { CONNECT_PROVIDER_ITEM } from "./service.js";
import type { MainMenuItem, MenuItem } from "./types.js";

export function isRunModeItem(item: MainMenuItem): item is MenuItem {
  return item.id !== CONNECT_PROVIDER_ITEM.id;
}

