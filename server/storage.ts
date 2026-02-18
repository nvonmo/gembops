import {
  gembaWalks, findings,
  type GembaWalk, type InsertGembaWalk,
  type Finding, type InsertFinding,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lt, inArray } from "drizzle-orm";

export interface IStorage {
  createGembaWalk(walk: InsertGembaWalk): Promise<GembaWalk>;
  getGembaWalks(userId: string): Promise<GembaWalk[]>;
  getGembaWalk(id: number): Promise<GembaWalk | undefined>;
  deleteGembaWalk(id: number): Promise<void>;

  createFinding(finding: InsertFinding): Promise<Finding>;
  getFindingsByUser(userId: string): Promise<Finding[]>;
  getFinding(id: number): Promise<Finding | undefined>;
  updateFinding(id: number, data: Partial<InsertFinding>): Promise<Finding>;
  getFindingsByUserAndMonth(userId: string, year: number, month: number): Promise<Finding[]>;
  getFindingsByGembaWalk(gembaWalkId: number): Promise<Finding[]>;
}

async function getUserWalkIds(userId: string): Promise<number[]> {
  const walks = await db.select({ id: gembaWalks.id }).from(gembaWalks)
    .where(eq(gembaWalks.createdBy, userId));
  return walks.map((w) => w.id);
}

export class DatabaseStorage implements IStorage {
  async createGembaWalk(walk: InsertGembaWalk): Promise<GembaWalk> {
    const [result] = await db.insert(gembaWalks).values(walk).returning();
    return result;
  }

  async getGembaWalks(userId: string): Promise<GembaWalk[]> {
    return db.select().from(gembaWalks)
      .where(eq(gembaWalks.createdBy, userId))
      .orderBy(desc(gembaWalks.createdAt));
  }

  async getGembaWalk(id: number): Promise<GembaWalk | undefined> {
    const [result] = await db.select().from(gembaWalks).where(eq(gembaWalks.id, id));
    return result;
  }

  async deleteGembaWalk(id: number): Promise<void> {
    await db.delete(findings).where(eq(findings.gembaWalkId, id));
    await db.delete(gembaWalks).where(eq(gembaWalks.id, id));
  }

  async createFinding(finding: InsertFinding): Promise<Finding> {
    const [result] = await db.insert(findings).values(finding).returning();
    return result;
  }

  async getFindingsByUser(userId: string): Promise<Finding[]> {
    const walkIds = await getUserWalkIds(userId);
    if (walkIds.length === 0) return [];
    return db.select().from(findings)
      .where(inArray(findings.gembaWalkId, walkIds))
      .orderBy(desc(findings.createdAt));
  }

  async getFinding(id: number): Promise<Finding | undefined> {
    const [result] = await db.select().from(findings).where(eq(findings.id, id));
    return result;
  }

  async updateFinding(id: number, data: Partial<InsertFinding>): Promise<Finding> {
    const [result] = await db.update(findings).set(data).where(eq(findings.id, id)).returning();
    return result;
  }

  async getFindingsByUserAndMonth(userId: string, year: number, month: number): Promise<Finding[]> {
    const walkIds = await getUserWalkIds(userId);
    if (walkIds.length === 0) return [];
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
    return db.select().from(findings)
      .where(and(
        inArray(findings.gembaWalkId, walkIds),
        gte(findings.dueDate, start),
        lt(findings.dueDate, end)
      ))
      .orderBy(desc(findings.createdAt));
  }

  async getFindingsByGembaWalk(gembaWalkId: number): Promise<Finding[]> {
    return db.select().from(findings)
      .where(eq(findings.gembaWalkId, gembaWalkId))
      .orderBy(desc(findings.createdAt));
  }
}

export const storage = new DatabaseStorage();
