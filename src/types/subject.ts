/**
 * The verification subject passed to each check's `execute` function.
 *
 * A subject carries either a credential, a presentation, or both. Both
 * fields are optional because checks declare via `appliesTo` which type
 * they operate on — the orchestrator skips checks that don't match.
 *
 * The values are `unknown` because parsing has already validated structure
 * via Zod; checks cast to the shape they need internally.
 */
export interface VerificationSubject {
  verifiableCredential?: unknown;
  verifiablePresentation?: unknown;
}
