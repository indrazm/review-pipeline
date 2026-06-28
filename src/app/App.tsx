import { useState } from "react";
import process from "node:process";
import { useWindowSize } from "ink";
import { FullscreenFrame } from "../components/FullscreenFrame.js";
import { DiffScopeMenu } from "../features/diff-scope/DiffScopeMenu.js";
import type { DiffScopeItem } from "../features/diff-scope/diffScopes.js";
import { MainMenu } from "../features/main-menu/MainMenu.js";
import type { MenuItem } from "../features/main-menu/menuItems.js";
import { PipelineScreen } from "../features/pipeline/PipelineScreen.js";
import { useExitKeys } from "./useExitKeys.js";

export function App() {
  useExitKeys();

  const { columns, rows } = useWindowSize();
  const [selectedMode, setSelectedMode] = useState<MenuItem | undefined>();
  const [selectedDiffScope, setSelectedDiffScope] = useState<
    DiffScopeItem | undefined
  >();

  const isPipelineOpen =
    selectedMode !== undefined && selectedDiffScope !== undefined;

  return (
    <FullscreenFrame
      columns={columns}
      contentLayout={isPipelineOpen ? "fill" : "center"}
      rows={rows}
      footer={
        isPipelineOpen
          ? "q / Esc exit | made by indrazm"
          : "Up/Down select | Enter choose | q / Esc exit | made by indrazm"
      }
    >
      {selectedMode === undefined ? (
        <MainMenu onChoose={setSelectedMode} />
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
