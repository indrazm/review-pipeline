import { useApp, useInput } from "ink";

type UseExitKeysOptions = {
  readonly enableQ?: boolean;
};

export function useExitKeys({ enableQ = true }: UseExitKeysOptions = {}): void {
  const { exit } = useApp();

  useInput((input, key) => {
    if ((enableQ && input === "q") || key.escape || (key.ctrl && input === "c")) {
      exit();
    }
  });
}
