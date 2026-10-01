export type AddResultsOptions = {
  count?: number;
  results?: Array<Record<string, unknown>>;
  resultDescriptions?: Array<Record<string, unknown> & { id: string }>;
};

/**
 * Adds `credentialSubject.result` entries and matching
 * `achievement.resultDescription` entries with cross-referenced IDs.
 */
export function addResults(options: AddResultsOptions = {}) {
  const count = options.count ?? 0;

  return (credential: Record<string, unknown>): Record<string, unknown> => {
    const c = JSON.parse(JSON.stringify(credential)) as Record<string, unknown>;
    const cs = c.credentialSubject as Record<string, unknown> | undefined;
    if (cs === undefined) {
      throw new Error(
        'addResults requires credentialSubject on the credential'
      );
    }

    const achievement = (cs.achievement as Record<string, unknown>) ?? {};
    cs.achievement = achievement;

    let descriptions: Array<Record<string, unknown>>;
    let results: Array<Record<string, unknown>>;

    if (
      options.resultDescriptions !== undefined &&
      options.results !== undefined
    ) {
      descriptions = options.resultDescriptions;
      results = options.results;
    } else {
      descriptions = [];
      results = [];
      for (let i = 0; i < count; i++) {
        const descId = `https://example.test/result-desc/${i}`;
        descriptions.push({
          id: descId,
          type: 'ResultDescription',
          name: `Result Description ${i}`
        });
        results.push({
          type: 'Result',
          resultDescription: descId,
          name: `Result ${i}`
        });
      }
    }

    const existingDesc = achievement.resultDescription;
    achievement.resultDescription = [
      ...(Array.isArray(existingDesc) ? existingDesc : []),
      ...descriptions
    ];

    const existingResult = cs.result;
    cs.result = [
      ...(Array.isArray(existingResult) ? existingResult : []),
      ...results
    ];

    return c;
  };
}

/**
 * Sets `credentialStatus` on a credential (shallow clone).
 */
export function addStatus(statusEntry: Record<string, unknown>) {
  return (credential: Record<string, unknown>): Record<string, unknown> => {
    const c = JSON.parse(JSON.stringify(credential)) as Record<string, unknown>;
    c.credentialStatus = { ...statusEntry };
    return c;
  };
}
