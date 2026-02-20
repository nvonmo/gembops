import {
  gembaWalks, gembaWalkAreas, gembaWalkParticipants, findings,
  type GembaWalk, type InsertGembaWalk,
  type Finding, type InsertFinding,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lt, inArray, or } from "drizzle-orm";

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
  // Get walks where user is creator, leader, or participant (same logic as getGembaWalks)
  const walksAsCreator = await db.select({ id: gembaWalks.id }).from(gembaWalks)
    .where(eq(gembaWalks.createdBy, userId));
  
  const walksAsLeader = await db.select({ id: gembaWalks.id }).from(gembaWalks)
    .where(eq(gembaWalks.leaderId, userId));
  
  const participantWalkIds = await db
    .select({ gembaWalkId: gembaWalkParticipants.gembaWalkId })
    .from(gembaWalkParticipants)
    .where(eq(gembaWalkParticipants.userId, userId));
  
  const walksAsParticipant = participantWalkIds.length > 0
    ? await db.select({ id: gembaWalks.id }).from(gembaWalks)
        .where(inArray(gembaWalks.id, participantWalkIds.map(p => p.gembaWalkId)))
    : [];
  
  // Combine and deduplicate by ID
  const allWalkIds = new Set<number>();
  [...walksAsCreator, ...walksAsLeader, ...walksAsParticipant].forEach(walk => {
    allWalkIds.add(walk.id);
  });
  
  return Array.from(allWalkIds);
}

export class DatabaseStorage implements IStorage {
  async createGembaWalk(walk: InsertGembaWalk): Promise<GembaWalk> {
    const [result] = await db.insert(gembaWalks).values(walk).returning();
    return result;
  }

  async getGembaWalks(userId: string): Promise<GembaWalk[]> {
    // Get walks where user is creator, leader, or participant
    const walksAsCreator = await db.select().from(gembaWalks)
      .where(eq(gembaWalks.createdBy, userId));
    
    const walksAsLeader = await db.select().from(gembaWalks)
      .where(eq(gembaWalks.leaderId, userId));
    
    const participantWalkIds = await db
      .select({ gembaWalkId: gembaWalkParticipants.gembaWalkId })
      .from(gembaWalkParticipants)
      .where(eq(gembaWalkParticipants.userId, userId));
    
    const walksAsParticipant = participantWalkIds.length > 0
      ? await db.select().from(gembaWalks)
          .where(inArray(gembaWalks.id, participantWalkIds.map(p => p.gembaWalkId)))
      : [];
    
    // Combine and deduplicate by ID
    const allWalkIds = new Set<number>();
    const allWalks: GembaWalk[] = [];
    
    [...walksAsCreator, ...walksAsLeader, ...walksAsParticipant].forEach(walk => {
      if (!allWalkIds.has(walk.id)) {
        allWalkIds.add(walk.id);
        allWalks.push(walk);
      }
    });
    
    return allWalks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getGembaWalk(id: number): Promise<GembaWalk | undefined> {
    const [result] = await db.select().from(gembaWalks).where(eq(gembaWalks.id, id));
    return result;
  }

  async deleteGembaWalk(id: number): Promise<void> {
    await db.delete(findings).where(eq(findings.gembaWalkId, id));
    // Cascade delete will handle gembaWalkAreas and gembaWalkParticipants
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
