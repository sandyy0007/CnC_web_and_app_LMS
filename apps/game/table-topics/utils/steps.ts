export interface Step {
  /** Text before the first colon, for example "Point". Empty when there is no colon. */
  label: string;
  /** The rest of the step. */
  text: string;
}

/** A plan is written as steps separated by " > ", each optionally "Label: words". */
export function parseSteps(plan: string): Step[] {
  return plan
    .split('>')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const colon = part.indexOf(':');
      if (colon <= 0) return { label: '', text: part };
      return { label: part.slice(0, colon).trim(), text: part.slice(colon + 1).trim() };
    });
}

export function describePlan(steps: Step[]): string {
  return steps.map((step) => (step.label ? `${step.label}: ${step.text}` : step.text)).join(', then ');
}
