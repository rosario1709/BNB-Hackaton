import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import type { Receipt, TradeIntent, Evaluation, Representation, Transaction, ApprovalEvidence, Policy } from '../core/domain';
export const intents = pgTable('intents', {
  id: text().primaryKey(),
  owner: text().notNull(),
  payload: jsonb().$type<TradeIntent>().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});
export const representations = pgTable('representations', {
  id: text().primaryKey(),
  payload: jsonb().$type<Representation>().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});
export const evaluations = pgTable('route_evaluations', {
  id: text().primaryKey(),
  intentId: text()
    .notNull()
    .references(() => intents.id),
  payload: jsonb().$type<Evaluation>().notNull(),
});
export const receipts = pgTable('execution_receipts', {
  id: text().primaryKey(),
  owner: text().notNull(),
  payload: jsonb().$type<Receipt>().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});
export const executions = pgTable('executions', {
  id: text().primaryKey(),
  owner: text().notNull(),
  payload: jsonb()
    .$type<{ transaction: Transaction; receiptId: string; expiresAt: string }>()
    .notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});
export const telemetry = pgTable('api_telemetry', {
  id: text().primaryKey(),
  payload: jsonb().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});
export const approvals = pgTable('token_approvals', {
  id: text().primaryKey(), owner: text().notNull(),
  payload: jsonb().$type<{ evidence: ApprovalEvidence; policy: Policy; receiptId: string }>().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});
export const holds = pgTable('execution_holds', {
  wallet: text().primaryKey(), reason: text().notNull(), transactionHash: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});
