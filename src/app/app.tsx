import { useState } from "react";
import process from "node:process";
import { useWindowSize } from "ink";
import { FullscreenFrame } from "../components/fullscreen-frame.js";
import {
  DiffScopeMenu,
  type DiffScopeItem,
} from "../modules/diff-scope/index.js";
import {
  MainMenu,
  isRunModeItem,
  type MainMenuItem,
  type MenuItem,
} from "../modules/main-menu/index.js";
import { PipelineScreen } from "../modules/pipeline/index.js";
import {
  ConnectProviderScreen,
  readProviderConfigStatus,
} from "../modules/provider/index.js";
import { useExitKeys } from "./use-exit-keys.js";

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
          ? "q / Esc exit | made by anvia - https://anvia.dev"
          : isConnectProviderOpen
            ? "Enter continue | Esc exit | made by anvia - https://anvia.dev"
            : "Up/Down select | Enter choose | q / Esc exit | made by anvia - https://anvia.dev"
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
