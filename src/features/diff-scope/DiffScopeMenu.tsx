import { Box, Text } from "ink";
import { DIFF_SCOPE_ITEMS, type DiffScopeItem } from "./diffScopes.js";
import type { MenuItem } from "../main-menu/menuItems.js";
import { useMenuNavigation } from "../main-menu/useMenuNavigation.js";

type DiffScopeMenuProps = {
  readonly mode: MenuItem;
  readonly onChoose: (item: DiffScopeItem) => void;
};

export function DiffScopeMenu({ mode, onChoose }: DiffScopeMenuProps) {
  const { selectedIndex } = useMenuNavigation({
    itemCount: DIFF_SCOPE_ITEMS.length,
    onChoose: (index) => {
      onChoose(DIFF_SCOPE_ITEMS[index]);
    },
  });

  return (
    <Box flexDirection="column" width={52} gap={1}>
      <Box flexDirection="column">
        <Text bold wrap="truncate">
          {mode.label}
        </Text>
        <Text dimColor wrap="truncate">
          Choose diff scope
        </Text>
      </Box>

      <Box flexDirection="column" gap={1}>
        {DIFF_SCOPE_ITEMS.map((item, index) => {
          const isSelected = selectedIndex === index;

          return (
            <Box key={item.id} flexDirection="column">
              <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                {isSelected ? "> " : "  "}
                {index + 1}. {item.label}
              </Text>
              <Text dimColor wrap="truncate">
                {"     "}
                {item.description}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box height={1} />
    </Box>
  );
}
