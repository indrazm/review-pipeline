import type { MENU_ITEMS, RUN_MODE_ITEMS } from "./service.js";

export type MenuItem = (typeof RUN_MODE_ITEMS)[number];
export type MainMenuItem = (typeof MENU_ITEMS)[number];

