import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import type { ProblemDetail } from '../../types/problem-detail.js';
import { ProblemTypes } from '../../problem-types.js';
import {
  asEntries,
  checkFirstContextEntry,
  checkTypedEntry,
  displayPath,
  firstContextEntry,
  isDateTime,
  isPlainObject,
  isUrl,
  stringValues,
  structureProblem,
  VC_CONTEXT_V1,
  VC_CONTEXT_V2,
  type PointerSegments
} from './structure-helpers.js';

const TITLE = 'Invalid Credential Structure';

/** Properties whose every entry must be an object with a `type`. */
const TYPED_PROPERTIES = [
  'credentialStatus',
  'proof',
  'termsOfUse',
  'evidence'
] as const;

/**
 * Check that the credential meets the structural requirements of the
 * VC Data Model: a VC context as the first `@context` entry, `type`,
 * `credentialSubject`, `issuer`, the date properties for its version
 * (format only, never against the clock), and the shape of
 * `credentialStatus`, `proof`, `termsOfUse`, `evidence` and
 * `credentialSchema`.
 *
 * The first-entry rule reports only a VC context that is present but
 * not first; a missing one is `core.vc-context`'s failure, and that
 * check runs (and halts the suite) first. The version comes from the
 * first `@context` entry, as in `@digitalcredentials/vc`; when it is
 * neither VC context, only the version-independent rules apply. Every
 * violation is reported, each as its own problem with a JSON Pointer
 * `instance`.
 *
 * This is a fatal check - a structurally invalid credential cannot be
 * verified meaningfully, and reporting it here keeps it from
 * surfacing later as a signature failure.
 */
export const vcStructureCheck: VerificationCheck = {
  id: 'core.vc-structure',
  name: 'VC Structure',
  description:
    'Verifies the credential meets the structural requirements of the VC Data Model.',
  fatal: true,
  appliesTo: ['verifiableCredential'],
  execute: async (
    subject: VerificationSubject,
    _context: VerificationContext
  ): Promise<CheckOutcome> => {
    const credential = subject.verifiableCredential;

    if (!isPlainObject(credential)) {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.PARSING_ERROR,
            title: TITLE,
            detail: 'No verifiable credential found in subject.'
          }
        ]
      };
    }

    const problems: ProblemDetail[] = [];
    const report = (pointer: PointerSegments, detail: string): void => {
      problems.push(structureProblem(TITLE, pointer, detail));
    };

    checkFirstContextEntry(credential['@context'], report);
    checkType(credential, report);
    checkCredentialSubject(credential, report);
    checkIssuer(credential, report);
    checkDates(credential, report);

    for (const prop of TYPED_PROPERTIES) {
      if (credential[prop] === undefined) {
        continue;
      }
      for (const [entry, pointer] of asEntries(credential[prop], [prop])) {
        const typed = checkTypedEntry(entry, pointer, report);
        const hasIdRule = prop === 'credentialStatus' || prop === 'evidence';
        if (typed && hasIdRule && typed.id !== undefined && !isUrl(typed.id)) {
          report(
            [...pointer, 'id'],
            `"${displayPath([...pointer, 'id'])}" must be a URL.`
          );
        }
      }
    }

    checkCredentialSchema(credential, report);

    if (problems.length > 0) {
      return { status: 'failure', problems };
    }
    return {
      status: 'success',
      message: 'Credential structure conforms to the VC Data Model.'
    };
  }
};

type Report = (pointer: PointerSegments, detail: string) => void;

function checkType(credential: Record<string, unknown>, report: Report): void {
  if (credential.type === undefined) {
    report(['type'], '"type" is required.');
  } else if (!stringValues(credential.type).includes('VerifiableCredential')) {
    report(['type'], '"type" must include "VerifiableCredential".');
  }
}

function checkCredentialSubject(
  credential: Record<string, unknown>,
  report: Report
): void {
  const value = credential.credentialSubject;
  if (value === undefined || value === null) {
    report(['credentialSubject'], '"credentialSubject" is required.');
    return;
  }
  for (const [entry, pointer] of asEntries(value, ['credentialSubject'])) {
    const name = displayPath(pointer);
    if (!isPlainObject(entry) || Object.keys(entry).length === 0) {
      report(pointer, `"${name}" must be a non-empty object.`);
      continue;
    }
    if (entry.id !== undefined && !isUrl(entry.id)) {
      report([...pointer, 'id'], `"${name}.id" must be a URL.`);
    }
  }
}

function checkIssuer(
  credential: Record<string, unknown>,
  report: Report
): void {
  const issuer = credential.issuer;
  if (issuer === undefined) {
    report(['issuer'], '"issuer" is required.');
  } else if (typeof issuer === 'string') {
    if (!isUrl(issuer)) {
      report(['issuer'], '"issuer" must be a URL.');
    }
  } else if (isPlainObject(issuer)) {
    if (!isUrl(issuer.id)) {
      report(['issuer', 'id'], '"issuer.id" is required and must be a URL.');
    }
  } else {
    report(['issuer'], '"issuer" must be a URL or an object with a URL "id".');
  }
}

function checkDates(credential: Record<string, unknown>, report: Report): void {
  const firstContext = firstContextEntry(credential['@context']);

  if (firstContext === VC_CONTEXT_V1) {
    if (credential.issuanceDate === undefined) {
      report(['issuanceDate'], '"issuanceDate" is required.');
    } else {
      checkDateTime(credential, 'issuanceDate', report);
    }
    checkDateTime(credential, 'expirationDate', report);
  } else if (firstContext === VC_CONTEXT_V2) {
    checkDateTime(credential, 'validFrom', report);
    checkDateTime(credential, 'validUntil', report);
  }
}

/** Report `prop` when it is present and not a dateTime. */
function checkDateTime(
  credential: Record<string, unknown>,
  prop: string,
  report: Report
): void {
  const value = credential[prop];
  if (value !== undefined && !isDateTime(value)) {
    report([prop], `"${prop}" must be a valid dateTime.`);
  }
}

function checkCredentialSchema(
  credential: Record<string, unknown>,
  report: Report
): void {
  if (credential.credentialSchema === undefined) {
    return;
  }
  for (const [entry, pointer] of asEntries(credential.credentialSchema, [
    'credentialSchema'
  ])) {
    const typed = checkTypedEntry(entry, pointer, report);
    if (typed && !isUrl(typed.id)) {
      report(
        [...pointer, 'id'],
        `"${displayPath(pointer)}" must have a URL "id".`
      );
    }
  }
}
