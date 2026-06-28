import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { BrailleSpinner } from "../../components/braille-spinner.js";
import { useMenuNavigation } from "../main-menu/index.js";
import {
  assertValidProviderConfig,
  saveProviderConfig,
  verifyProviderConfig,
} from "./service.js";
import type { ProviderConfig, ProviderType } from "./types.js";
import {
  formatProviderErrorMessage,
  formatProviderFieldValue,
} from "./utils.js";

type ConnectProviderScreenProps = {
  readonly onConnected: () => void;
};

const PROVIDER_TYPE_ITEMS: readonly {
  readonly description: string;
  readonly id: ProviderType;
  readonly label: string;
}[] = [
  {
    description: "For chat-completions endpoints that follow the OpenAI API shape.",
    id: "openai-compatible",
    label: "OpenAI-compatible",
  },
  {
    description: "For endpoints compatible with the Anthropic SDK API shape.",
    id: "anthropic-compatible",
    label: "Anthropic-compatible",
  },
];

export function ConnectProviderScreen({
  onConnected,
}: ConnectProviderScreenProps) {
  const [providerType, setProviderType] = useState<ProviderType | undefined>();

  return (
    <Box flexDirection="column" width={72} gap={1}>
      <Box flexDirection="column">
        <Text bold wrap="truncate">
          Connect provider
        </Text>
        <Text dimColor wrap="truncate">
          Save and verify the provider used by review-this agents.
        </Text>
      </Box>

      {providerType === undefined ? (
        <ProviderTypeMenu onChoose={setProviderType} />
      ) : (
        <ProviderForm
          onConnected={onConnected}
          providerType={providerType}
        />
      )}
    </Box>
  );
}

type ProviderTypeMenuProps = {
  readonly onChoose: (providerType: ProviderType) => void;
};

function ProviderTypeMenu({ onChoose }: ProviderTypeMenuProps) {
  const { selectedIndex } = useMenuNavigation({
    itemCount: PROVIDER_TYPE_ITEMS.length,
    onChoose: (index) => {
      onChoose(PROVIDER_TYPE_ITEMS[index].id);
    },
  });

  return (
    <Box flexDirection="column" gap={1}>
      {PROVIDER_TYPE_ITEMS.map((item, index) => {
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
  );
}

type ProviderFormProps = {
  readonly onConnected: () => void;
  readonly providerType: ProviderType;
};

const FORM_FIELDS = [
  {
    id: "baseUrl",
    label: "Base URL",
  },
  {
    id: "apiKey",
    label: "API key",
  },
  {
    id: "model",
    label: "Model",
  },
] as const;

type FieldId = (typeof FORM_FIELDS)[number]["id"];
type FormValues = Record<FieldId, string>;

const EMPTY_FORM_VALUES: FormValues = {
  apiKey: "",
  baseUrl: "",
  model: "",
};

function ProviderForm({ onConnected, providerType }: ProviderFormProps) {
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [isVerifying, setIsVerifying] = useState(false);
  const [values, setValues] = useState<FormValues>(EMPTY_FORM_VALUES);
  const currentField = FORM_FIELDS[currentFieldIndex];

  useInput(
    (input, key) => {
      if (key.upArrow) {
        setCurrentFieldIndex((index) =>
          index === 0 ? FORM_FIELDS.length - 1 : index - 1,
        );
        setError(undefined);
        return;
      }

      if (key.downArrow) {
        setCurrentFieldIndex((index) =>
          index === FORM_FIELDS.length - 1 ? 0 : index + 1,
        );
        setError(undefined);
        return;
      }

      if (key.return) {
        const nextValue = values[currentField.id].trim();

        if (nextValue.length === 0) {
          setError(`${currentField.label} is required.`);
          return;
        }

        const nextValues = {
          ...values,
          [currentField.id]: nextValue,
        };

        setValues(nextValues);
        setError(undefined);

        if (currentFieldIndex < FORM_FIELDS.length - 1) {
          setCurrentFieldIndex((index) => index + 1);
          return;
        }

        void verifyAndSave(nextValues);
        return;
      }

      if (key.backspace || key.delete) {
        setValues((current) => ({
          ...current,
          [currentField.id]: current[currentField.id].slice(0, -1),
        }));
        setError(undefined);
        return;
      }

      if (key.ctrl || key.meta) {
        return;
      }

      const nextInput = input.replaceAll(/\r?\n/g, "");

      if (nextInput.length === 0) {
        return;
      }

      setValues((current) => ({
        ...current,
        [currentField.id]: `${current[currentField.id]}${nextInput}`,
      }));
      setError(undefined);
    },
    { isActive: !isVerifying },
  );

  const verifyAndSave = async (nextValues: FormValues): Promise<void> => {
    setIsVerifying(true);
    setError(undefined);

    const config: ProviderConfig = {
      apiKey: nextValues.apiKey,
      baseUrl: nextValues.baseUrl,
      model: nextValues.model,
      type: providerType,
    };

    try {
      assertValidProviderConfig(config);
      await verifyProviderConfig(config);
      saveProviderConfig(config);
      onConnected();
    } catch (caughtError: unknown) {
      setError(formatProviderErrorMessage(caughtError, config.apiKey));
      setCurrentFieldIndex(0);
      setIsVerifying(false);
    }
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text dimColor wrap="truncate">
          Provider type: {providerType}
        </Text>
        {FORM_FIELDS.map((field, index) => (
          <Text
            key={field.id}
            color={index === currentFieldIndex ? "cyan" : undefined}
            wrap="truncate"
          >
            {index === currentFieldIndex ? "> " : "  "}
            {field.label}:{" "}
            {formatProviderFieldValue(field.id, values[field.id])}
            {index === currentFieldIndex && !isVerifying ? "_" : ""}
          </Text>
        ))}
      </Box>

      {isVerifying ? (
        <BrailleSpinner label="Verifying provider ..." />
      ) : (
        <Text dimColor wrap="truncate">
          Up/Down edit fields | Enter continue or verify.
        </Text>
      )}

      {error !== undefined && (
        <Text color="yellow" wrap="wrap">
          {error}
        </Text>
      )}
    </Box>
  );
}
