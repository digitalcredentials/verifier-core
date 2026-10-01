declare module '@digitalcredentials/did-method-web' {
  export class DidWebDriver {
    allowList: string[];

    constructor(opts?: { fetchOptions?: object; allowList?: string[] });

    use: (opts: {
      multibaseMultikeyHeader: string;
      fromMultibase: (input: unknown) => unknown;
    }) => void;

    get: (opts: {
      did?: string;
      url?: string;
      fetchOptions?: object;
    }) => Promise<unknown>;
  }

  export function didUrlToHttpsUrl(did: string): {
    baseUrl: string;
    fragment: string;
  };

  export function driver(opts?: {
    fetchOptions?: object;
    allowList?: string[];
  }): DidWebDriver;
}

declare module '@digitalcredentials/did-method-key' {
  export function driver(): {
    method: string;
    use: (opts: {
      multibaseMultikeyHeader: string;
      fromMultibase: (input: unknown) => unknown;
    }) => void;
    get: (opts: { did?: string; url?: string }) => Promise<unknown>;
  };
}

declare module '@digitalcredentials/ed25519-multikey' {
  type Ed25519KeyPair = {
    signer: () => { sign: (opts: { data: Uint8Array }) => Promise<Uint8Array> };
    verifier: () => {
      verify: (opts: {
        data: Uint8Array;
        signature: Uint8Array;
      }) => Promise<boolean>;
    };
  };

  export const from: (input: unknown) => unknown;
  export const fromJwk: (opts: { jwk: unknown }) => Promise<Ed25519KeyPair>;
  export const generate: () => Promise<Ed25519KeyPair>;
  export const toJwk: (opts: {
    keyPair: Ed25519KeyPair;
  }) => Promise<Record<string, string>>;
}

declare module '@digitalcredentials/did-io' {
  export class CachedResolver {
    constructor(opts?: { max?: number; maxAge?: number });

    use: (driver: unknown) => void;

    get: (opts: { did?: string; url?: string }) => Promise<unknown>;
  }
}
