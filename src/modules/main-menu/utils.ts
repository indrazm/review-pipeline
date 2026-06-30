import { CONNECT_PROVIDER_ITEM, INSPECT_DIFF_ITEM } from "./service.js";
import type { MainMenuItem, MenuItem } from "./types.js";

export function isRunModeItem(item: MainMenuItem): item is MenuItem {
  return item.id !== CONNECT_PROVIDER_ITEM.id && item.id !== INSPECT_DIFF_ITEM.id;
}

export function isInspectDiffItem(
  item: MainMenuItem,
): item is typeof INSPECT_DIFF_ITEM {
  return item.id === INSPECT_DIFF_ITEM.id;
}
