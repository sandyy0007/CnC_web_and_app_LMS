/** Steps are written separated by " > ", in the passage (framework labels) and in each option (sentences). */
export function splitSteps(text: string | null | undefined): string[] {
  return (text ?? '')
    .split('>')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
