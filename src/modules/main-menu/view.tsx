import { Box, Text } from "ink";
import { ReviewThisLogo } from "../../components/review-this-logo.js";
import type { ProviderConfigStatus } from "../provider/types.js";
import { useMenuNavigation } from "./hooks.js";
import { MENU_ITEMS } from "./service.js";
import type { MainMenuItem } from "./types.js";
import { isRunModeItem } from "./utils.js";

type MainMenuProps = {
  readonly onChoose: (item: MainMenuItem) => void;
  readonly providerConfigStatus: ProviderConfigStatus;
};

export function MainMenu({ onChoose, providerConfigStatus }: MainMenuProps) {
  const hasProviderConfig = providerConfigStatus.status === "valid";
  const { selectedIndex } = useMenuNavigation({
    isItemDisabled: (index) =>
      isRunModeItem(MENU_ITEMS[index]) && !hasProviderConfig,
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
        <ProviderStatusLine providerConfigStatus={providerConfigStatus} />
      </Box>

      <Box flexDirection="column" gap={1}>
        {MENU_ITEMS.map((item, index) => {
          const isSelected = selectedIndex === index;
          const isDisabled = isRunModeItem(item) && !hasProviderConfig;

          return (
            <Box key={item.id} flexDirection="column">
              <Text
                color={isSelected ? "cyan" : undefined}
                bold={isSelected}
                dimColor={isDisabled}
              >
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

type ProviderStatusLineProps = {
  readonly providerConfigStatus: ProviderConfigStatus;
};

function ProviderStatusLine({
  providerConfigStatus,
}: ProviderStatusLineProps) {
  if (providerConfigStatus.status === "valid") {
    return (
      <Text dimColor wrap="truncate">
        Provider connected: {providerConfigStatus.config.type} /{" "}
        {providerConfigStatus.config.model}
      </Text>
    );
  }

  if (providerConfigStatus.status === "invalid") {
    return (
      <Text color="yellow" wrap="truncate">
        Provider config invalid. Connect provider to replace it.
      </Text>
    );
  }

  return (
    <Text color="yellow" wrap="truncate">
      Connect provider first to enable review modes.
    </Text>
  );
}
