export { lookupDccLegacy } from './dcc-legacy-handler.js';
export type { DccLegacyRegistryBody } from './dcc-legacy-handler.js';
export { lookupOidf } from './oidf-handler.js';
export { lookupVcRecognition } from './vc-recognition-handler.js';
export {
  DEFAULT_TTL_MS,
  parseCacheControlMaxAge,
  resolveTtl,
  ttlFromValidUntil
} from './cache-ttl.js';
export { jwtDecodePayload } from './jwt-payload-decode.js';
export type {
  HandlerResult,
  RegistryHandler,
  RegistryHandlerMap
} from './types.js';
