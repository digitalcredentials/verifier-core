import { z } from 'zod';

export const ProofSchema = z
  .object({
    type: z.string(),
    proofPurpose: z.string(),
    verificationMethod: z.string(),
    created: z.string().optional(),
    proofValue: z.string().optional(),
    cryptosuite: z.string().optional(),
    challenge: z.string().optional(),
    jws: z.string().optional()
  })
  .passthrough();

export type Proof = z.infer<typeof ProofSchema>;
