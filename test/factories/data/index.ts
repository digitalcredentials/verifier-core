export { compose } from './compose.js';
export {
  CredentialFactory,
  DEFAULT_TEST_ISSUER_DID,
  PlaceholderProof
} from './credential-factory.js';
export type {
  CredentialFactoryOptions,
  CredentialVersion
} from './credential-factory.js';
export { PresentationFactory } from './presentation-factory.js';
export { DidDocumentFactory } from './did-document-factory.js';
export {
  BitstringStatusEntry,
  StatusListCredentialFactory
} from './status-list-factory.js';
export type {
  BitstringStatusEntryOptions,
  StatusListCredentialFactoryOptions
} from './status-list-factory.js';
export { addResults, addStatus } from './transforms.js';
export type { AddResultsOptions } from './transforms.js';
export { deepMerge, isPlainObject } from './merge-deep.js';
