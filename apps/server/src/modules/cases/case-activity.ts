import type { Prisma, PrismaClient } from "@prisma/client";
import type { CaseActivityType } from "@msph/shared";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface LogCaseActivityParams {
  caseId: string;
  type: CaseActivityType;
  /** Short human-readable summary rendered directly by clients — write it
   * in plain English at the call site, not derived generically from
   * `type`, so it can carry real detail ("Visit scheduled for Jan 12,
   * 2:00 PM (Initial Inspection)"). */
  message: string;
  actorId?: string | null;
  /** Must be plain JSON-serializable data — this goes straight into a
   * Postgres `jsonb` column via Prisma's Json field. */
  metadata?: Record<string, Prisma.InputJsonValue>;
}

/**
 * Appends one row to the case timeline. Always call this in the same
 * Prisma transaction as the mutation it describes — never as a
 * best-effort afterthought — so the timeline can never drift from what
 * actually happened (see CONTEXT.md "Case timeline design").
 */
export async function logCaseActivity(tx: Tx, params: LogCaseActivityParams): Promise<void> {
  await tx.caseActivity.create({
    data: {
      caseId: params.caseId,
      type: params.type,
      message: params.message,
      actorId: params.actorId ?? null,
      metadata: params.metadata,
    },
  });
}
