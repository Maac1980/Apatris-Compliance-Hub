import { pgTable, uuid, text, boolean, integer, real, jsonb, timestamp } from "drizzle-orm/pg-core";

// ─── Regulatory Updates ─────────────────────────────────────────────────────

export const regulatoryUpdates = pgTable("regulatory_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull().default(""),
  title: text("title").notNull().default(""),
  summary: text("summary").notNull().default(""),
  fullText: text("full_text").default(""),
  category: text("category").notNull().default("labor_law"),
  severity: text("severity").notNull().default("info"),
  fineAmount: text("fine_amount"),
  workersAffected: integer("workers_affected").default(0),
  costImpact: text("cost_impact"),
  deadlineChange: text("deadline_change"),
  actionRequired: jsonb("action_required").default([]),
  sourceUrls: jsonb("source_urls").default([]),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
  readByAdmin: boolean("read_by_admin").default(false),
  emailSent: boolean("email_sent").default(false),
});

export type RegulatoryUpdate = typeof regulatoryUpdates.$inferSelect;
export type InsertRegulatoryUpdate = typeof regulatoryUpdates.$inferInsert;

// ─── Immigration Searches ───────────────────────────────────────────────────

export const immigrationSearches = pgTable("immigration_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userEmail: text("user_email"),
  question: text("question").notNull(),
  language: text("language").default("en"),
  answer: text("answer"),
  sources: jsonb("sources").default([]),
  confidence: real("confidence").default(0),
  actionItems: jsonb("action_items").default([]),
  searchedAt: timestamp("searched_at", { withTimezone: true }).defaultNow(),
});

export type ImmigrationSearch = typeof immigrationSearches.$inferSelect;
export type InsertImmigrationSearch = typeof immigrationSearches.$inferInsert;
