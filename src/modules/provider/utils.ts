export function formatProviderFieldValue(
  fieldId: string,
  value: string,
): string {
  if (fieldId !== "apiKey") {
    return value;
  }

  return value.length === 0 ? "" : "********";
}

export function formatProviderErrorMessage(
  error: unknown,
  apiKey: string,
): string {
  const message = error instanceof Error ? error.message : String(error);

  return apiKey.length === 0
    ? message
    : message.replaceAll(apiKey, "[api key]");
}

