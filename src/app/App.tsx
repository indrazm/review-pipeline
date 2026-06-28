import { useState } from "react";
import process from "node:process";
import { useWindowSize } from "ink";
import { FullscreenFrame } from "../components/FullscreenFrame.js";
import { DiffScopeMenu } from "../features/diff-scope/DiffScopeMenu.js";
import type { DiffScopeItem } from "../features/diff-scope/diffScopes.js";
import { MainMenu } from "../features/main-menu/MainMenu.js";
import {
  isRunModeItem,
  type MainMenuItem,
  type MenuItem,
} from "../features/main-menu/menuItems.js";
import { PipelineScreen } from "../features/pipeline/PipelineScreen.js";
import { ConnectProviderScreen } from "../features/provider/ConnectProviderScreen.js";
import { readProviderConfigStatus } from "../features/provider/providerConfig.js";
import { useExitKeys } from "./useExitKeys.js";

export function App() {
  const { columns, rows } = useWindowSize();
  const [isConnectProviderOpen, setIsConnectProviderOpen] = useState(false);
  const [providerConfigStatus, setProviderConfigStatus] = useState(
    readProviderConfigStatus,
  );
  const [selectedMode, setSelectedMode] = useState<MenuItem | undefined>();
  const [selectedDiffScope, setSelectedDiffScope] = useState<
    DiffScopeItem | undefined
  >();

  const isPipelineOpen =
    selectedMode !== undefined && selectedDiffScope !== undefined;
  const isProviderConnected = providerConfigStatus.status === "valid";

  useExitKeys({ enableQ: !isConnectProviderOpen });

  const handleMainMenuChoose = (item: MainMenuItem): void => {
    if (isRunModeItem(item)) {
      if (!isProviderConnected) {
        return;
      }

      setSelectedMode(item);
      return;
    }

    setSelectedDiffScope(undefined);
    setSelectedMode(undefined);
    setIsConnectProviderOpen(true);
  };
  const handleProviderConnected = (): void => {
    setProviderConfigStatus(readProviderConfigStatus());
    setSelectedDiffScope(undefined);
    setSelectedMode(undefined);
    setIsConnectProviderOpen(false);
  };

  return (
    <FullscreenFrame
      columns={columns}
      contentLayout={isPipelineOpen ? "fill" : "center"}
      rows={rows}
      footer={
        isPipelineOpen
          ? "q / Esc exit | made by indrazm"
          : isConnectProviderOpen
            ? "Enter continue | Esc exit | made by indrazm"
            : "Up/Down select | Enter choose | q / Esc exit | made by indrazm"
      }
    >
      {isConnectProviderOpen ? (
        <ConnectProviderScreen onConnected={handleProviderConnected} />
      ) : selectedMode === undefined ? (
        <MainMenu
          onChoose={handleMainMenuChoose}
          providerConfigStatus={providerConfigStatus}
        />
      ) : selectedDiffScope === undefined ? (
        <DiffScopeMenu mode={selectedMode} onChoose={setSelectedDiffScope} />
      ) : (
        <PipelineScreen
          cwd={process.cwd()}
          diffScope={selectedDiffScope}
          mode={selectedMode}
        />
      )}
    </FullscreenFrame>
  );
}
