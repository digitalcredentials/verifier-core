/**
 * `@digitalcredentials/jsonld-signatures`' "no proof matched" error.
 *
 * `ProofSet.verify` skips every proof whose `proofPurpose` is not the one
 * being checked, or whose type no registered suite matches. When that
 * leaves nothing to verify it fails with an `Error` named
 * `NotFoundError`, which the exported `verify` wraps, like every other
 * failure, in a `VerificationError` carrying it in `errors[]`; vc passes
 * that through unchanged. It is the only signal that a proof was not
 * checked at all, as opposed to checked and found bad. The message is
 * jsonld-signatures 12.0.1's, matched in full.
 */

/** jsonld-signatures' message when no proof matched a suite and purpose. */
const JSIGS_NO_MATCH_MESSAGE =
  'Did not verify any proofs; insufficient proofs matched the ' +
  'acceptable suite(s) and required purpose(s).';

function isNoMatchError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'NotFoundError' &&
    error.message === JSIGS_NO_MATCH_MESSAGE
  );
}

/**
 * Whether `error` is jsonld-signatures' "no proof matched" failure: a
 * `VerificationError` wrapping that one error and nothing else.
 *
 * The name and the full message are both required: the document loader
 * also writes "NotFoundError" into plain `Error` messages, and those are
 * a failure to fetch, not an unchecked proof.
 */
export function isJsigsNoMatch(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== 'VerificationError') {
    return false;
  }
  const { errors } = error as { errors?: unknown };
  return (
    Array.isArray(errors) && errors.length === 1 && isNoMatchError(errors[0])
  );
}
