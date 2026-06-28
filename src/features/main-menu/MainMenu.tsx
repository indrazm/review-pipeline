import { Box, Text } from "ink";
import { ReviewThisLogo } from "../../components/ReviewThisLogo.js";
import { MENU_ITEMS, type MenuItem } from "./menuItems.js";
import { useMenuNavigation } from "./useMenuNavigation.js";

type MainMenuProps = {
  readonly onChoose: (item: MenuItem) => void;
};

export function MainMenu({ onChoose }: MainMenuProps) {
  const { selectedIndex } = useMenuNavigation({
    itemCount: MENU_ITEMS.length,
    onChoose: (index) => {
      onChoose(MENU_ITEMS[index]);
    },
  });

  return (
    <Box flexDirection="column" width={62} gap={1}>
      <ReviewThisLogo />

      <Box flexDirection="column">
        <Text dimColor wrap="truncate">
          Pick a run mode, then choose the git diff scope. review-this
        </Text>
        <Text dimColor wrap="truncate">
          reads that diff and runs the matching local agent pipeline.
        </Text>
      </Box>

      <Box flexDirection="column" gap={1}>
        {MENU_ITEMS.map((item, index) => {
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
