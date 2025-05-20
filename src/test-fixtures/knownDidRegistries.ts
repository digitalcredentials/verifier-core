export const knownDIDRegistries: object = [
  {
    "name": "Test DCC Member Registry",
    "type": "oidf",
    "trustAnchorEC": "https://test.registry.dcconsortium.org/.well-known/openid-federation"
  },
  {
    name: 'DCC Pilot Registry',
    type: 'dcc-legacy',
    url: 'https://digitalcredentials.github.io/issuer-registry/registry.json'
  },
  {
    name: 'DCC Sandbox Registry',
    type: 'dcc-legacy',
    url: 'https://digitalcredentials.github.io/sandbox-registry/registry.json'
  },
  {
    name: 'DCC Community Registry',
    type: 'dcc-legacy',
    url: 'https://digitalcredentials.github.io/community-registry/registry.json'
  },
  {
    name: 'DCC Registry',
    type: 'dcc-legacy',
    url: 'https://digitalcredentials.github.io/dcc-registry/registry.json'
  }
]