import { Box, Text, useInput } from "ink";
import { ReviewThisLogo } from "../../components/review-this-logo.js";
import type { ProviderConfigStatus } from "../provider/types.js";
import { useMenuNavigation } from "./hooks.js";
import { CONNECT_PROVIDER_ITEM, MENU_ITEMS, RUN_MODE_ITEMS } from "./service.js";
import type { MainMenuItem, MenuItem } from "./types.js";
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
          Pick a run mode, then choose the review target. review-this
        </Text>
        <Text dimColor wrap="truncate">
          can also inspect a diff before choosing the agent pipeline.
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

type RunModeMenuProps = {
  readonly onBack: () => void;
  readonly onChoose: (item: MenuItem) => void;
  readonly onConnectProvider: () => void;
  readonly providerConfigStatus: ProviderConfigStatus;
  readonly targetLabel: string;
};

export function RunModeMenu({
  onBack,
  onChoose,
  onConnectProvider,
  providerConfigStatus,
  targetLabel,
}: RunModeMenuProps) {
  const hasProviderConfig = providerConfigStatus.status === "valid";
  const itemCount = hasProviderConfig
    ? RUN_MODE_ITEMS.length
    : RUN_MODE_ITEMS.length + 1;
  const { selectedIndex } = useMenuNavigation({
    isItemDisabled: (index) => index < RUN_MODE_ITEMS.length && !hasProviderConfig,
    itemCount,
    onChoose: (index) => {
      if (index < RUN_MODE_ITEMS.length) {
        onChoose(RUN_MODE_ITEMS[index]);
        return;
      }

      onConnectProvider();
    },
  });

  useInput((input) => {
    if (input === "b") {
      onBack();
    }
  });

  return (
    <Box flexDirection="column" width={62} gap={1}>
      <ReviewThisLogo />

      <Box flexDirection="column">
        <Text bold wrap="truncate">
          Choose run mode
        </Text>
        <Text dimColor wrap="truncate">
          Target: {targetLabel}
        </Text>
        <ProviderStatusLine providerConfigStatus={providerConfigStatus} />
      </Box>

      <Box flexDirection="column" gap={1}>
        {Array.from({ length: itemCount }, (_, index) => {
          const item =
            index < RUN_MODE_ITEMS.length
              ? RUN_MODE_ITEMS[index]
              : CONNECT_PROVIDER_ITEM;
          const isSelected = selectedIndex === index;
          const isDisabled = index < RUN_MODE_ITEMS.length && !hasProviderConfig;

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
