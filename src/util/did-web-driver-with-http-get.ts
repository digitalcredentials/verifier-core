/**
 * did:web resolution using caller-provided {@link HttpGetService} so DID document
 * fetches share the same cache as JSON-LD context loads (e.g. Keyv in
 * transaction-service). The stock {@link DidWebDriver} uses
 * `@digitalcredentials/http-client` and bypasses that cache.
 *
 * Fragment dereference logic matches `@digitalcredentials/did-method-web`
 * `getNode` (suite context map aligned with that package).
 */
import {
  DidWebDriver,
  didUrlToHttpsUrl
} from '@digitalcredentials/did-method-web';
import { klona } from 'klona';
import type { HttpGetService } from '../services/http-get-service/http-get-service.js';

const contextsBySuite = new Map<string, string>([
  [
    'Ed25519VerificationKey2020',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  [
    'Ed25519VerificationKey2018',
    'https://w3id.org/security/suites/ed25519-2018/v1'
  ],
  ['Multikey', 'https://w3id.org/security/multikey/v1'],
  [
    'X25519KeyAgreementKey2020',
    'https://w3id.org/security/suites/x25519-2020/v1'
  ],
  [
    'X25519KeyAgreementKey2019',
    'https://w3id.org/security/suites/x25519-2019/v1'
  ]
]);

function assertDomainAllowList(
  allowList: string[] | undefined,
  url: string
): void {
  if (!allowList || allowList.length <= 0) {
    return;
  }
  const { host } = new URL(url);
  if (allowList.includes(host)) {
    return;
  }
  throw new Error(`Domain "${host}" is not allowed.`);
}

function getNodeFromDidDocument(
  didDocument: Record<string, unknown>,
  id: string
): Record<string, unknown> {
  const vms = didDocument.verificationMethod;
  let match: Record<string, unknown> | undefined;
  if (Array.isArray(vms)) {
    match = vms.find(
      (vm: unknown) =>
        typeof vm === 'object' &&
        vm !== null &&
        (vm as { id?: string }).id === id
    ) as Record<string, unknown> | undefined;
  }
  if (!match) {
    for (const [key, value] of Object.entries(didDocument)) {
      if (key === '@context' || key === 'verificationMethod') {
        continue;
      }
      if (Array.isArray(value)) {
        match = value.find(
          (e: unknown) =>
            typeof e === 'object' &&
            e !== null &&
            (e as { id?: string }).id === id
        ) as Record<string, unknown> | undefined;
      } else if (
        value &&
        typeof value === 'object' &&
        (value as { id?: string }).id === id
      ) {
        match = value as Record<string, unknown>;
      }
      if (match) {
        break;
      }
    }
  }
  if (!match) {
    throw new Error(`DID document entity with id "${id}" not found.`);
  }
  const suiteType = match.type;
  const ctxFromSuite =
    typeof suiteType === 'string' ? contextsBySuite.get(suiteType) : undefined;
  const ctxSource = ctxFromSuite ?? didDocument['@context'];
  return {
    '@context': klona(ctxSource),
    ...klona(match)
  };
}

export interface DidWebDriverLike {
  method: 'web';
  use: DidWebDriver['use'];
  get: (opts?: {
    did?: string;
    url?: string;
    fetchOptions?: object;
  }) => Promise<unknown>;
}

/**
 * did-io driver: same surface as {@link DidWebDriver} for `get` / `use`, but
 * `get` loads documents via `httpGetService`.
 */
export function didWebDriverWithHttpGet(
  httpGetService: HttpGetService,
  options?: ConstructorParameters<typeof DidWebDriver>[0]
): DidWebDriverLike {
  const inner = new DidWebDriver(options);
  return {
    method: 'web',
    use: inner.use.bind(inner),
    async get({
      did,
      url,
      fetchOptions: _fetchOptions = {}
    }: {
      did?: string;
      url?: string;
      fetchOptions?: object;
    } = {}) {
      const didOrUrl = did || url;
      if (!didOrUrl) {
        throw new TypeError('A DID or URL is required.');
      }
      const { baseUrl, fragment } = didUrlToHttpsUrl(didOrUrl);
      assertDomainAllowList(inner.allowList, baseUrl);
      const { body, status } = await httpGetService.get(baseUrl);
      if (status < 200 || status >= 300) {
        throw new Error(`Failed to fetch DID document: HTTP ${status}`);
      }
      const data = body as Record<string, unknown> | null;
      const [didAuth] = didOrUrl.split(/(?=[?#])/);
      if (data?.id !== didAuth) {
        throw new Error(`DID document for DID "${didOrUrl}" not found.`);
      }
      if (fragment) {
        const id = `${String(data.id)}${fragment}`;
        return getNodeFromDidDocument(data, id);
      }
      return data;
    }
  };
}
