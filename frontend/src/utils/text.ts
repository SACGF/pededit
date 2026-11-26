/** The first letter upper case: for words the editor wrote, never for a name. */
export function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
