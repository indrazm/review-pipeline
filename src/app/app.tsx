import { useState } from "react";
import process from "node:process";
import { useWindowSize } from "ink";
import { FullscreenFrame } from "../components/fullscreen-frame.js";
import {
  MainMenu,
  RunModeMenu,
  isInspectDiffItem,
  isRunModeItem,
  type MainMenuItem,
  type MenuItem,
} from "../modules/main-menu/index.js";
import { PipelineScreen } from "../modules/pipeline/index.js";
import {
  ConnectProviderScreen,
  readProviderConfigStatus,
} from "../modules/provider/index.js";
import {
  ReviewTargetMenu,
  type ReviewTarget,
} from "../modules/review-target/index.js";
import { useExitKeys } from "./use-exit-keys.js";

type ProviderReturnTarget = "main" | "inspect-run-mode";

export function App() {
  const { columns, rows } = useWindowSize();
  const [isConnectProviderOpen, setIsConnectProviderOpen] = useState(false);
  const [isInspectFlow, setIsInspectFlow] = useState(false);
  const [providerReturnTarget, setProviderReturnTarget] =
    useState<ProviderReturnTarget>("main");
  const [providerConfigStatus, setProviderConfigStatus] = useState(
    readProviderConfigStatus,
  );
  const [selectedMode, setSelectedMode] = useState<MenuItem | undefined>();
  const [selectedReviewTarget, setSelectedReviewTarget] = useState<
    ReviewTarget | undefined
  >();
  const [reviewTargetFooter, setReviewTargetFooter] = useState<
    string | undefined
  >();

  const isPipelineOpen =
    selectedMode !== undefined && selectedReviewTarget !== undefined;
  const isInspectRunModeOpen =
    isInspectFlow && selectedReviewTarget !== undefined && selectedMode === undefined;
  const isReviewTargetOpen =
    !isConnectProviderOpen &&
    !isPipelineOpen &&
    (isInspectFlow || selectedMode !== undefined);
  const isProviderConnected = providerConfigStatus.status === "valid";

  useExitKeys({ enableQ: !isConnectProviderOpen });

  const handleMainMenuChoose = (item: MainMenuItem): void => {
    if (isRunModeItem(item)) {
      if (!isProviderConnected) {
        return;
      }

      setIsInspectFlow(false);
      setSelectedReviewTarget(undefined);
      setSelectedMode(item);
      return;
    }

    if (isInspectDiffItem(item)) {
      setIsInspectFlow(true);
      setSelectedMode(undefined);
      setSelectedReviewTarget(undefined);
      return;
    }

    setIsInspectFlow(false);
    setSelectedReviewTarget(undefined);
    setSelectedMode(undefined);
    setProviderReturnTarget("main");
    setIsConnectProviderOpen(true);
  };

  const handleProviderConnected = (): void => {
    setProviderConfigStatus(readProviderConfigStatus());
    setIsConnectProviderOpen(false);

    if (providerReturnTarget === "inspect-run-mode") {
      setSelectedMode(undefined);
      setProviderReturnTarget("main");
      return;
    }

    setIsInspectFlow(false);
    setSelectedReviewTarget(undefined);
    setSelectedMode(undefined);
    setProviderReturnTarget("main");
  };
  const handleReviewTargetBack = (): void => {
    setSelectedReviewTarget(undefined);

    if (isInspectFlow) {
      setIsInspectFlow(false);
      return;
    }

    setSelectedMode(undefined);
  };
  const handleInspectRunModeBack = (): void => {
    setSelectedMode(undefined);
    setSelectedReviewTarget(undefined);
  };
  const handleInspectConnectProvider = (): void => {
    setProviderReturnTarget("inspect-run-mode");
    setIsConnectProviderOpen(true);
  };

  return (
    <FullscreenFrame
      columns={columns}
      contentLayout={isPipelineOpen || isReviewTargetOpen ? "fill" : "center"}
      rows={rows}
      footer={
        isPipelineOpen
          ? "q / Esc exit | made by anvia - https://anvia.dev"
          : isConnectProviderOpen
            ? "Enter continue | Esc exit | made by anvia - https://anvia.dev"
            : isReviewTargetOpen && reviewTargetFooter !== undefined
              ? `${reviewTargetFooter} | made by anvia - https://anvia.dev`
              : isInspectRunModeOpen
                ? "Up/Down select | Enter choose | b back | q / Esc exit | made by anvia - https://anvia.dev"
                : "Up/Down select | Enter choose | q / Esc exit | made by anvia - https://anvia.dev"
      }
    >
      {isConnectProviderOpen ? (
        <ConnectProviderScreen onConnected={handleProviderConnected} />
      ) : isPipelineOpen ? (
        <PipelineScreen
          cwd={process.cwd()}
          mode={selectedMode}
          reviewTarget={selectedReviewTarget}
        />
      ) : isInspectFlow && selectedReviewTarget !== undefined ? (
        <RunModeMenu
          onBack={handleInspectRunModeBack}
          onChoose={setSelectedMode}
          onConnectProvider={handleInspectConnectProvider}
          providerConfigStatus={providerConfigStatus}
          targetLabel={`${selectedReviewTarget.scope.label}, ${selectedReviewTarget.selectedPaths.length} files`}
        />
      ) : selectedMode === undefined ? (
        isInspectFlow ? (
          <ReviewTargetMenu
            cwd={process.cwd()}
            onBack={handleReviewTargetBack}
            onChoose={setSelectedReviewTarget}
            onFooterChange={setReviewTargetFooter}
          />
        ) : (
          <MainMenu
            onChoose={handleMainMenuChoose}
            providerConfigStatus={providerConfigStatus}
          />
        )
      ) : (
        <ReviewTargetMenu
          cwd={process.cwd()}
          mode={selectedMode}
          onBack={handleReviewTargetBack}
          onChoose={setSelectedReviewTarget}
          onFooterChange={setReviewTargetFooter}
        />
      )}
    </FullscreenFrame>
  );
}
