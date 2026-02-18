import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, date, timestamp, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const gembaWalks = pgTable("gemba_walks", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  area: text("area").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const findings = pgTable("findings", {
  id: serial("id").primaryKey(),
  gembaWalkId: integer("gemba_walk_id").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  responsible: text("responsible").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull().default("open"),
  photoUrl: text("photo_url"),
  closeComment: text("close_comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const gembaWalksRelations = relations(gembaWalks, ({ many }) => ({
  findings: many(findings),
}));

export const findingsRelations = relations(findings, ({ one }) => ({
  gembaWalk: one(gembaWalks, {
    fields: [findings.gembaWalkId],
    references: [gembaWalks.id],
  }),
}));

export const insertGembaWalkSchema = createInsertSchema(gembaWalks).omit({
  id: true,
  createdAt: true,
});

export const insertFindingSchema = createInsertSchema(findings).omit({
  id: true,
  createdAt: true,
});

export type InsertGembaWalk = z.infer<typeof insertGembaWalkSchema>;
export type GembaWalk = typeof gembaWalks.$inferSelect;
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findings.$inferSelect;
