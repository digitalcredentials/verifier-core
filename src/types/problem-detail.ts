/** RFC 9457-inspired structured error, without `status` (not an HTTP context). */
export interface ProblemDetail {
  /** URI identifying the problem, e.g. "urn:vc-verify:invalid-signature" */
  type: string;
  /** Short human-readable summary, e.g. "Invalid Signature" */
  title: string;
  /** Specific explanation of this occurrence */
  detail: string;
  /**
   * RFC 6901 JSON Pointer (rooted at the credential being verified)
   * identifying the portion of the credential this problem applies
   * to. Omit when the problem applies to the credential as a whole.
   *
   * @example '/credentialSubject/result/0/resultDescription'
   * @see https://datatracker.ietf.org/doc/html/rfc9457#section-3.1
   * @see https://datatracker.ietf.org/doc/html/rfc6901
   */
  instance?: string;
}
