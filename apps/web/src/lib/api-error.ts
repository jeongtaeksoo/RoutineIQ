import { isApiFetchError } from "@/lib/api-client";

type ApiErrorMessageOptions = {
  fallbackMessage: string;
  messageOverride?: string;
  messagePrefix?: string;
  includeHint?: boolean;
  includeReference?: boolean;
  referenceLabel?: string;
};

export function formatApiErrorMessage(
  err: unknown,
  {
    fallbackMessage,
    messageOverride,
    messagePrefix,
    includeHint = true,
    includeReference = true,
    referenceLabel = "Error reference",
  }: ApiErrorMessageOptions
): string {
  const rawMessage =
    messageOverride ?? (err instanceof Error ? err.message : fallbackMessage);
  const baseMessage = messagePrefix ? `${messagePrefix}: ${rawMessage}` : rawMessage;
  const parts = [baseMessage];

  if (includeHint && isApiFetchError(err) && err.hint) {
    parts.push(err.hint);
  }

  if (includeReference && isApiFetchError(err) && err.correlationId) {
    parts.push(`${referenceLabel}: ${err.correlationId}`);
  }

  return parts.join("\n");
}

export function extractErrorReferenceId(message: string | null | undefined): string | null {
  if (!message) return null;
  const match = message.match(/(?:오류 참조 ID|Error reference):\s*([A-Za-z0-9._:-]+)/i);
  return match?.[1] ?? null;
}
