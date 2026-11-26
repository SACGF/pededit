/** Saves a file to the user's downloads, as the export buttons do. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Saves text as a file of the given media type. */
export function downloadText(text: string, type: string, filename: string): void {
  downloadBlob(new Blob([text], { type }), filename);
}
