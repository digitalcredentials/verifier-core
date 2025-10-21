# @digitalcredentials/verifier-core CHANGELOG

## 2.0.0 - October 21 2025

### Breaking

- Jumped to version 2 because an additionalInformation section was added to the result. The new
section is a sibling of the prior results so likely wouldn't affect existing clients, but
we've opted to call it a breaking change to be safe.
- Note that a final version 1 was never published, only betas.
- Adds schema validation results to the returned verification results.
