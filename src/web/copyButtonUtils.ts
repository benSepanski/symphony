export type ClipboardWriter = (text: string) => Promise<void>;

export type CopyState = "idle" | "copied" | "error";

export const COPY_FEEDBACK_MS = 1500;

export function getClipboardWriter(): ClipboardWriter | undefined {
  if (typeof navigator === "undefined") return undefined;
  const clipboard = navigator.clipboard;
  if (!clipboard || typeof clipboard.writeText !== "function") return undefined;
  return (text) => clipboard.writeText(text);
}

export async function writeToClipboard(
  value: string,
  writer: ClipboardWriter | undefined,
): Promise<boolean> {
  if (!writer) return false;
  try {
    await writer(value);
    return true;
  } catch {
    return false;
  }
}
