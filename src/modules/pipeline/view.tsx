import { useEffect } from "react";
import { Box, Text } from "ink";
import { BrailleSpinner } from "../../components/braille-spinner.js";
import { ReviewThisLogo } from "../../components/review-this-logo.js";
import type { MenuItem } from "../main-menu/index.js";
import type { ReviewTarget } from "../review-target/index.js";
import { usePipelineRunner } from "./hooks.js";
import type { PipelineRunState } from "./types.js";
import { formatNoChangesMessage } from "./utils.js";

type PipelineScreenProps = {
  readonly cwd: string;
  readonly mode: MenuItem;
  readonly reviewTarget: ReviewTarget;
};

export function PipelineScreen({ cwd, mode, reviewTarget }: PipelineScreenProps) {
  const { run, state } = usePipelineRunner(cwd);
  const diffScope = reviewTarget.scope;
  const showsFixStep = mode.id !== "review";
  const showsInitialVerificationStep =
    mode.id === "review" ||
    mode.id === "review-and-fix" ||
    mode.id === "full-pipeline";
  const showsPostFixVerificationStep =
    mode.id === "review-and-fix" || mode.id === "full-pipeline";
  const showsFullPipelineSteps = mode.id === "full-pipeline";

  useEffect(() => {
    run(mode, reviewTarget);
  }, [mode, reviewTarget, run]);

  return (
    <Box flexDirection="column" flexGrow={1} width="100%" paddingX={1} gap={1}>
      <Box flexShrink={0}>
        <ReviewThisLogo />
      </Box>

      <Box flexDirection="column" flexShrink={0}>
        <Text bold wrap="truncate">
          {mode.label}
        </Text>
        <Text dimColor wrap="truncate">
          {cwd}
        </Text>
        <Text dimColor wrap="truncate">
          {diffScope.label}, {reviewTarget.selectedPaths.length} files selected
        </Text>
      </Box>

      <PipelineSteps
        showsFixStep={showsFixStep}
        showsFullPipelineSteps={showsFullPipelineSteps}
        showsInitialVerificationStep={showsInitialVerificationStep}
        showsPostFixVerificationStep={showsPostFixVerificationStep}
        state={state}
      />
      <PipelineNoChanges state={state} />
      <PipelineCompletion state={state} />
      <PipelineQualityLoopOutput state={state} />
      <PipelineReviewOutput state={state} />
      <PipelineVerificationOutput state={state} />
      <PipelinePrMonitorOutput state={state} />
      <PipelinePrRepairOutput state={state} />
    </Box>
  );
}

type PipelineStepsProps = {
  readonly showsFixStep: boolean;
  readonly showsFullPipelineSteps: boolean;
  readonly showsInitialVerificationStep: boolean;
  readonly showsPostFixVerificationStep: boolean;
  readonly state: PipelineRunState;
};

function PipelineSteps({
  showsFixStep,
  showsFullPipelineSteps,
  showsInitialVerificationStep,
  showsPostFixVerificationStep,
  state,
}: PipelineStepsProps) {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <StepLine
        isActive={state.status === "idle" || state.status === "loading-diff"}
        isDone={
          state.status === "reviewing" ||
          state.status === "verifying" ||
          state.status === "fixing" ||
          state.status === "verifying-after-fix" ||
          state.status === "monitoring-pr" ||
          state.status === "preparing-pr" ||
          state.status === "repairing-pr" ||
          state.status === "completed" ||
          state.status === "failed"
        }
        label="Loading Diff"
      />
      <StepLine
        isActive={state.status === "reviewing"}
        isDone={
          state.status === "fixing" ||
          state.status === "verifying" ||
          state.status === "verifying-after-fix" ||
          state.status === "monitoring-pr" ||
          state.status === "preparing-pr" ||
          state.status === "repairing-pr" ||
          (state.status === "completed" && !state.reviewSkipped)
        }
        isSkipped={state.status === "completed" && state.reviewSkipped}
        label="Reviewing ..."
      />
      {showsInitialVerificationStep && (
        <StepLine
          isActive={state.status === "verifying"}
          isDone={
            state.status === "fixing" ||
            state.status === "verifying-after-fix" ||
            state.status === "monitoring-pr" ||
            state.status === "preparing-pr" ||
            state.status === "repairing-pr" ||
            (state.status === "completed" && !state.verificationSkipped)
          }
          isSkipped={state.status === "completed" && state.verificationSkipped}
          label="Verifying ..."
        />
      )}
      {showsFixStep && (
        <StepLine
          isActive={state.status === "fixing"}
          isDone={
            state.status === "verifying-after-fix" ||
            state.status === "monitoring-pr" ||
            state.status === "preparing-pr" ||
            state.status === "repairing-pr" ||
            (state.status === "completed" && !state.fixSkipped)
          }
          isSkipped={
            (state.status === "preparing-pr" && state.fixSkipped) ||
            (state.status === "monitoring-pr" && state.fixSkipped) ||
            (state.status === "repairing-pr" && state.fixSkipped) ||
            (state.status === "completed" && state.fixSkipped)
          }
          label={
            state.status === "fixing"
              ? `Fixing (${state.fixAttempt}/${state.maxFixAttempts}) ...`
              : "Fixing ..."
          }
        />
      )}
      {showsPostFixVerificationStep && (
        <StepLine
          isActive={state.status === "verifying-after-fix"}
          isDone={
            state.status === "monitoring-pr" ||
            state.status === "preparing-pr" ||
            state.status === "repairing-pr" ||
            (state.status === "completed" && !state.postFixVerificationSkipped)
          }
          isSkipped={state.status === "completed" && state.postFixVerificationSkipped}
          label={
            state.status === "verifying-after-fix"
              ? `Verifying after fix (${state.verificationAttempt}/${state.maxVerificationAttempts}) ...`
              : "Verifying after fix ..."
          }
        />
      )}
      {showsFullPipelineSteps && (
        <StepLine
          isActive={state.status === "preparing-pr"}
          isDone={
            state.status === "monitoring-pr" ||
            state.status === "repairing-pr" ||
            (state.status === "completed" && !state.prSkipped)
          }
          isSkipped={state.status === "completed" && state.prSkipped}
          label="Preparing PR ..."
        />
      )}
      {showsFullPipelineSteps && (
        <StepLine
          isActive={state.status === "monitoring-pr"}
          isDone={
            state.status === "repairing-pr" ||
            (state.status === "completed" && !state.prMonitorSkipped)
          }
          isSkipped={state.status === "completed" && state.prMonitorSkipped}
          label="Monitoring PR ..."
        />
      )}
      {showsFullPipelineSteps && (
        <StepLine
          isActive={state.status === "repairing-pr"}
          isDone={state.status === "completed" && !state.prRepairSkipped}
          isSkipped={state.status === "completed" && state.prRepairSkipped}
          label={
            state.status === "repairing-pr"
              ? `Repairing PR (${state.repairAttempt}/${state.maxRepairAttempts}) ...`
              : "Repairing PR ..."
          }
        />
      )}
      {state.status === "failed" && (
        <Text color="yellow" wrap="truncate">
          Failed: {state.error}
        </Text>
      )}
    </Box>
  );
}

type StepLineProps = {
  readonly isActive: boolean;
  readonly isDone: boolean;
  readonly isSkipped?: boolean;
  readonly label: string;
};

function StepLine({ isActive, isDone, isSkipped = false, label }: StepLineProps) {
  if (isActive) {
    return <BrailleSpinner label={label} />;
  }

  if (isSkipped) {
    return (
      <Text dimColor wrap="truncate">
        · {label} skipped
      </Text>
    );
  }

  return (
    <Text color={isDone ? "green" : undefined} dimColor={!isDone} wrap="truncate">
      {isDone ? "✓" : "·"} {label}
    </Text>
  );
}

type PipelineNoChangesProps = {
  readonly state: PipelineRunState;
};

function PipelineNoChanges({ state }: PipelineNoChangesProps) {
  if (state.status !== "completed" || !state.reviewSkipped) {
    return null;
  }

  return (
    <Text color="yellow" wrap="truncate">
      {formatNoChangesMessage(state)}
    </Text>
  );
}

type PipelineCompletionProps = {
  readonly state: PipelineRunState;
};

function PipelineCompletion({ state }: PipelineCompletionProps) {
  if (state.status !== "completed") {
    return null;
  }

  if (state.prSkipped && state.prSkipReason !== undefined) {
    return (
      <Text color="yellow" wrap="wrap">
        Stopped before PR: {state.prSkipReason}
      </Text>
    );
  }

  return (
    <Text color="green" wrap="truncate">
      Completed.
    </Text>
  );
}

type PipelineReviewOutputProps = {
  readonly state: PipelineRunState;
};

type PipelineVerificationOutputProps = {
  readonly state: PipelineRunState;
};

type PipelineQualityLoopOutputProps = {
  readonly state: PipelineRunState;
};

function PipelineQualityLoopOutput({ state }: PipelineQualityLoopOutputProps) {
  if (
    state.status !== "completed" ||
    (state.mode.id !== "review-and-fix" && state.mode.id !== "full-pipeline")
  ) {
    return null;
  }

  const latestReview = state.review;
  const latestVerification = state.verification;
  const fixAttempts = state.fixAttempts;

  if (
    latestReview === undefined &&
    latestVerification === undefined &&
    fixAttempts.length === 0
  ) {
    return null;
  }

  return (
    <Box flexDirection="column" flexShrink={0} width="100%">
      <Text bold>Quality gate</Text>
      {latestReview === undefined ? (
        <Text dimColor wrap="truncate">
          Review: skipped
        </Text>
      ) : (
        <Text color={reviewVerdictColor(latestReview.verdicts.verdict)} wrap="truncate">
          Review: {latestReview.verdicts.verdict}
        </Text>
      )}
      {latestVerification === undefined ? (
        <Text dimColor wrap="truncate">
          Verification: skipped
        </Text>
      ) : (
        <Text color={verificationVerdictColor(latestVerification.verdicts.verdict)} wrap="truncate">
          Verification: {latestVerification.verdicts.verdict}
        </Text>
      )}
      {fixAttempts.length === 0 ? (
        <Text dimColor wrap="truncate">
          Fix attempts: none
        </Text>
      ) : (
        <Text wrap="truncate">
          Fix attempts:{" "}
          {fixAttempts
            .map((fix, index) => `${index + 1}:${fix.verdicts.verdict}`)
            .join(", ")}
        </Text>
      )}
      {state.prSkipped && state.prSkipReason !== undefined && (
        <Text color="yellow" wrap="wrap">
          Blocked before PR: {state.prSkipReason}
        </Text>
      )}
    </Box>
  );
}

function PipelineReviewOutput({ state }: PipelineReviewOutputProps) {
  if (
    state.status !== "completed" ||
    state.mode.id !== "review" ||
    state.reviewSkipped ||
    state.review === undefined
  ) {
    return null;
  }

  const output = state.review.content.trim();

  return (
    <Box flexDirection="column" flexShrink={1} overflow="hidden" width="100%">
      <Text bold>Review output</Text>
      {output.length === 0 ? (
        <Text dimColor>No review output.</Text>
      ) : (
        output.split(/\r?\n/).map((line, index) => (
          <Text key={`${index}-${line}`} wrap="wrap">
            {line.length === 0 ? " " : line}
          </Text>
        ))
      )}
    </Box>
  );
}

function PipelineVerificationOutput({ state }: PipelineVerificationOutputProps) {
  if (
    state.status !== "completed" ||
    state.mode.id !== "review" ||
    state.verificationSkipped ||
    state.verification === undefined
  ) {
    return null;
  }

  const output = state.verification.content.trim();

  return (
    <Box flexDirection="column" flexShrink={1} overflow="hidden" width="100%">
      <Text bold>Verification output</Text>
      <Text color={verificationVerdictColor(state.verification.verdicts.verdict)} wrap="truncate">
        Verification: {state.verification.verdicts.verdict}
      </Text>
      {output.length === 0 ? (
        <Text dimColor>No verification output.</Text>
      ) : (
        output.split(/\r?\n/).map((line, index) => (
          <Text key={`${index}-${line}`} wrap="wrap">
            {line.length === 0 ? " " : line}
          </Text>
        ))
      )}
    </Box>
  );
}

type PipelinePrMonitorOutputProps = {
  readonly state: PipelineRunState;
};

function PipelinePrMonitorOutput({ state }: PipelinePrMonitorOutputProps) {
  if (
    state.status !== "completed" ||
    state.mode.id !== "full-pipeline" ||
    state.prMonitorSkipped ||
    state.prMonitor === undefined
  ) {
    return null;
  }

  const output = state.prMonitor.content.trim();

  return (
    <Box flexDirection="column" flexShrink={1} overflow="hidden" width="100%">
      <Text bold>PR monitor output</Text>
      <Text color={monitorStatusColor(state.prMonitor.status)} wrap="truncate">
        Status: {state.prMonitor.status}
      </Text>
      {output.length === 0 ? (
        <Text dimColor>No PR monitor output.</Text>
      ) : (
        output.split(/\r?\n/).map((line, index) => (
          <Text key={`${index}-${line}`} wrap="wrap">
            {line.length === 0 ? " " : line}
          </Text>
        ))
      )}
    </Box>
  );
}

type PipelinePrRepairOutputProps = {
  readonly state: PipelineRunState;
};

function PipelinePrRepairOutput({ state }: PipelinePrRepairOutputProps) {
  if (
    state.status !== "completed" ||
    state.mode.id !== "full-pipeline" ||
    state.prRepairSkipped ||
    state.prRepair === undefined
  ) {
    return null;
  }

  const output = state.prRepair.content.trim();

  return (
    <Box flexDirection="column" flexShrink={1} overflow="hidden" width="100%">
      <Text bold>PR repair output</Text>
      <Text color={repairStatusColor(state.prRepair.verdict)} wrap="truncate">
        Verdict: {state.prRepair.verdict}
      </Text>
      {output.length === 0 ? (
        <Text dimColor>No PR repair output.</Text>
      ) : (
        output.split(/\r?\n/).map((line, index) => (
          <Text key={`${index}-${line}`} wrap="wrap">
            {line.length === 0 ? " " : line}
          </Text>
        ))
      )}
    </Box>
  );
}

function monitorStatusColor(
  status: NonNullable<
    Extract<PipelineRunState, { readonly status: "completed" }>["prMonitor"]
  >["status"],
): "green" | "red" | "yellow" {
  if (status === "ready") {
    return "green";
  }

  if (status === "failing" || status === "error") {
    return "red";
  }

  return "yellow";
}

function reviewVerdictColor(
  verdict: NonNullable<
    Extract<PipelineRunState, { readonly status: "completed" }>["review"]
  >["verdicts"]["verdict"],
): "green" | "red" {
  return verdict === "pass" ? "green" : "red";
}

function verificationVerdictColor(
  verdict: NonNullable<
    Extract<PipelineRunState, { readonly status: "completed" }>["verification"]
  >["verdicts"]["verdict"],
): "green" | "red" {
  return verdict === "pass" ? "green" : "red";
}

function repairStatusColor(
  verdict: NonNullable<
    Extract<PipelineRunState, { readonly status: "completed" }>["prRepair"]
  >["verdict"],
): "green" | "red" | "yellow" {
  if (verdict === "fixed") {
    return "green";
  }

  if (verdict === "not-fixed") {
    return "red";
  }

  return "yellow";
}
