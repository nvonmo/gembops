import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, date, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
import { users } from "./models/auth";

export const gembaWalks = pgTable("gemba_walks", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  area: text("area").notNull(), // Keep for backward compatibility, but will use gemba_walk_areas for multiple
  leaderId: varchar("leader_id"), // Leader of the Gemba Walk
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  // Recurrence fields
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrencePattern: text("recurrence_pattern"), // "daily", "weekly", "monthly"
  recurrenceEndDate: date("recurrence_end_date"), // Optional end date for recurrence
  parentWalkId: integer("parent_walk_id"), // Reference to the original recurring walk
});

// Table for multiple areas per Gemba Walk
export const gembaWalkAreas = pgTable("gemba_walk_areas", {
  id: serial("id").primaryKey(),
  gembaWalkId: integer("gemba_walk_id").notNull().references(() => gembaWalks.id, { onDelete: "cascade" }),
  areaName: text("area_name").notNull(),
});

// Table for participants of Gemba Walk
export const gembaWalkParticipants = pgTable("gemba_walk_participants", {
  id: serial("id").primaryKey(),
  gembaWalkId: integer("gemba_walk_id").notNull().references(() => gembaWalks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const findings = pgTable("findings", {
  id: serial("id").primaryKey(),
  gembaWalkId: integer("gemba_walk_id").notNull(),
  area: text("area"), // Specific area where the finding was detected
  category: text("category").notNull(),
  description: text("description").notNull(),
  responsibleId: varchar("responsible_id").notNull(), // Foreign key to users
  dueDate: date("due_date"), // Optional - will be set by the responsible user
  status: text("status").notNull().default("open"),
  photoUrl: text("photo_url"), // Photo of the finding
  closeComment: text("close_comment"),
  closeEvidenceUrl: text("close_evidence_url"), // Photo evidence when closing
  createdAt: timestamp("created_at").defaultNow(),
});

export const gembaWalksRelations = relations(gembaWalks, ({ many, one }) => ({
  findings: many(findings),
  areas: many(gembaWalkAreas),
  participants: many(gembaWalkParticipants),
  leader: one(users, {
    fields: [gembaWalks.leaderId],
    references: [users.id],
  }),
}));

export const gembaWalkAreasRelations = relations(gembaWalkAreas, ({ one }) => ({
  gembaWalk: one(gembaWalks, {
    fields: [gembaWalkAreas.gembaWalkId],
    references: [gembaWalks.id],
  }),
}));

export const gembaWalkParticipantsRelations = relations(gembaWalkParticipants, ({ one }) => ({
  gembaWalk: one(gembaWalks, {
    fields: [gembaWalkParticipants.gembaWalkId],
    references: [gembaWalks.id],
  }),
  user: one(users, {
    fields: [gembaWalkParticipants.userId],
    references: [users.id],
  }),
}));

export const findingsRelations = relations(findings, ({ one }) => ({
  gembaWalk: one(gembaWalks, {
    fields: [findings.gembaWalkId],
    references: [gembaWalks.id],
  }),
  responsible: one(users, {
    fields: [findings.responsibleId],
    references: [users.id],
  }),
}));

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Foreign key to users
  type: text("type").notNull(), // "finding_assigned", "finding_updated", "gemba_walk_assigned", etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  relatedFindingId: integer("related_finding_id"), // Optional reference to finding
  relatedGembaWalkId: integer("related_gemba_walk_id"), // Optional reference to gemba walk
  isRead: boolean("is_read").notNull().default(false),
  isActionRequired: boolean("is_action_required").notNull().default(true),
  isActionCompleted: boolean("is_action_completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  finding: one(findings, {
    fields: [notifications.relatedFindingId],
    references: [findings.id],
  }),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const areas = pgTable("areas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAreaSchema = createInsertSchema(areas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertArea = z.infer<typeof insertAreaSchema>;
export type Area = typeof areas.$inferSelect;

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

export const insertGembaWalkSchema = createInsertSchema(gembaWalks).omit({
  id: true,
  createdAt: true,
});

export type InsertGembaWalk = z.infer<typeof insertGembaWalkSchema>;
export type GembaWalk = typeof gembaWalks.$inferSelect;

export const insertFindingSchema = createInsertSchema(findings).omit({
  id: true,
  createdAt: true,
});

export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findings.$inferSelect;
