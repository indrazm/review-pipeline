import { useEffect, useRef, useState } from "react";
import { useInput } from "ink";

type UseMenuNavigationOptions = {
  readonly itemCount: number;
  readonly isActive?: boolean;
  readonly isItemDisabled?: (index: number) => boolean;
  readonly onChoose: (index: number) => void;
};

type MenuNavigation = {
  readonly selectedIndex: number;
};

export function useMenuNavigation({
  isActive = true,
  isItemDisabled = () => false,
  itemCount,
  onChoose,
}: UseMenuNavigationOptions): MenuNavigation {
  const initialSelectedIndex = getFirstEnabledIndex(itemCount, isItemDisabled);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const selectedIndexRef = useRef(initialSelectedIndex);

  const selectIndex = (index: number): void => {
    selectedIndexRef.current = index;
    setSelectedIndex(index);
  };

  useEffect(() => {
    if (itemCount === 0 || !isItemDisabled(selectedIndexRef.current)) {
      return;
    }

    selectIndex(getFirstEnabledIndex(itemCount, isItemDisabled));
  }, [isItemDisabled, itemCount]);

  useInput(
    (input, key) => {
      if (itemCount === 0) {
        return;
      }

      if (key.upArrow || input === "k") {
        selectIndex(
          getNextEnabledIndex(
            selectedIndexRef.current,
            -1,
            itemCount,
            isItemDisabled,
          ),
        );
        return;
      }

      if (key.downArrow || input === "j") {
        selectIndex(
          getNextEnabledIndex(
            selectedIndexRef.current,
            1,
            itemCount,
            isItemDisabled,
          ),
        );
        return;
      }

      if (key.return) {
        if (!isItemDisabled(selectedIndexRef.current)) {
          onChoose(selectedIndexRef.current);
        }
        return;
      }

      const numericChoice = Number.parseInt(input, 10);

      if (
        Number.isInteger(numericChoice) &&
        numericChoice >= 1 &&
        numericChoice <= itemCount
      ) {
        const nextIndex = numericChoice - 1;

        if (isItemDisabled(nextIndex)) {
          return;
        }

        selectIndex(nextIndex);
        onChoose(nextIndex);
      }
    },
    { isActive },
  );

  return { selectedIndex };
}

function wrapIndex(index: number, itemCount: number): number {
  return (index + itemCount) % itemCount;
}

function getFirstEnabledIndex(
  itemCount: number,
  isItemDisabled: (index: number) => boolean,
): number {
  for (let index = 0; index < itemCount; index += 1) {
    if (!isItemDisabled(index)) {
      return index;
    }
  }

  return 0;
}

function getNextEnabledIndex(
  selectedIndex: number,
  direction: -1 | 1,
  itemCount: number,
  isItemDisabled: (index: number) => boolean,
): number {
  for (let offset = 1; offset <= itemCount; offset += 1) {
    const nextIndex = wrapIndex(selectedIndex + offset * direction, itemCount);

    if (!isItemDisabled(nextIndex)) {
      return nextIndex;
    }
  }

  return selectedIndex;
}
