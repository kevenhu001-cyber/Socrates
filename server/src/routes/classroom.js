import { Router } from 'express';
import { eq, and, sql, inArray, count } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { classroomClasses, classStudents, sessions, mistakes } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import crypto from 'node:crypto';

const router = Router();
router.use(requireAuth);

/* GET /api/classroom/classes */
router.get('/classes', async (req, res, next) => {
  try {
    const db = getDb();
    const asTeacher = await db.select().from(classroomClasses).where(eq(classroomClasses.teacherId, req.userId));
    const enrolled = await db.select({ classId: classStudents.classId }).from(classStudents).where(eq(classStudents.userId, req.userId));
    const ids = enrolled.map(e => e.classId);
    const asStudent = ids.length
      ? await db.select().from(classroomClasses).where(sql`${classroomClasses.id} = ANY(${ids})`)
      : [];
    return res.json({ classes: [...asTeacher, ...asStudent] });
  } catch (err) { next(err); }
});

/* POST /api/classroom/classes */
router.post('/classes', async (req, res, next) => {
  try {
    const { name, description, subject, gradeLevel } = req.body;
    if (!name) throw new BadRequest('name is required');
    const db = getDb();
    const joinCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const [c] = await db.insert(classroomClasses).values({
      teacherId: req.userId, name, description, subject, gradeLevel, joinCode,
    }).returning();
    return res.status(201).json(c);
  } catch (err) { next(err); }
});

/* POST /api/classroom/classes/:id/join */
router.post('/classes/:id/join', async (req, res, next) => {
  try {
    const { joinCode } = req.body;
    const db = getDb();
    const [c] = await db.select().from(classroomClasses).where(eq(classroomClasses.id, req.params.id)).limit(1);
    if (!c) throw new NotFound('Class not found');
    if (c.joinCode !== joinCode) return res.status(403).json({ code: 'INVALID_CODE', message: 'Invalid join code' });
    await db.insert(classStudents).values({ classId: req.params.id, userId: req.userId }).onConflictDoNothing();
    return res.json(c);
  } catch (err) { next(err); }
});

/* GET /api/classroom/classes/:id/students */
router.get('/classes/:id/students', async (req, res, next) => {
  try {
    const db = getDb();
    const [klass] = await db.select().from(classroomClasses).where(eq(classroomClasses.id, req.params.id)).limit(1);
    if (!klass) throw new NotFound('Class not found');
    if (klass.teacherId !== req.userId) {
      const [enrolled] = await db.select().from(classStudents)
        .where(and(eq(classStudents.classId, req.params.id), eq(classStudents.userId, req.userId)))
        .limit(1);
      if (!enrolled) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Not a member of this class' });
      }
    }
    const students = await db.select().from(classStudents).where(eq(classStudents.classId, req.params.id));
    return res.json({ students });
  } catch (err) { next(err); }
});

/* GET /api/classroom/classes/:id/dashboard — teacher-only summary */
router.get('/classes/:id/dashboard', async (req, res, next) => {
  try {
    const db = getDb();
    const [klass] = await db.select().from(classroomClasses).where(eq(classroomClasses.id, req.params.id)).limit(1);
    if (!klass) throw new NotFound('Class not found');
    if (klass.teacherId !== req.userId) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Only the teacher can view the dashboard' });
    }
    const students = await db.select().from(classStudents).where(eq(classStudents.classId, req.params.id));
    const studentUserIds = students.map(s => s.userId);

    // Fetch all sessions for these students in one query (avoid N+1).
    const studentSessions = studentUserIds.length
      ? await db.select().from(sessions).where(inArray(sessions.userId, studentUserIds))
      : [];

    // Per-student mistake counts from the mistakes table (grouped by userId).
    const mistakeCountRows = studentUserIds.length
      ? await db.select({ userId: mistakes.userId, count: count() })
          .from(mistakes)
          .where(inArray(mistakes.userId, studentUserIds))
          .groupBy(mistakes.userId)
      : [];
    const mistakeCountByUser = new Map();
    for (const row of mistakeCountRows) {
      mistakeCountByUser.set(row.userId, Number(row.count));
    }

    // Mistakes-table nodeName rows for hotspot aggregation.
    const mistakeNameRows = studentUserIds.length
      ? await db.select({ nodeName: mistakes.nodeName })
          .from(mistakes)
          .where(inArray(mistakes.userId, studentUserIds))
      : [];

    // status rank so a student's best status across sessions wins
    const STATUS_RANK = { blank: 0, fuzzy: 1, internalized: 2 };
    const RANK_TO_STATUS = { 2: 'internalized', 1: 'fuzzy', 0: 'blank' };

    const hotspotMap = new Map();        // nodeName -> count
    const studentNodes = new Map();      // userId -> Map(nodeName -> bestStatusRank)
    const lastActiveByUser = new Map();  // userId -> timestamp ms

    for (const s of studentSessions) {
      const uid = s.userId;

      // kbNodes: track each student's best status per node name.
      try {
        const nodes = Array.isArray(s.kbNodes) ? s.kbNodes : [];
        let nodeMap = studentNodes.get(uid);
        if (!nodeMap) { nodeMap = new Map(); studentNodes.set(uid, nodeMap); }
        for (const n of nodes) {
          if (!n || typeof n !== 'object') continue;
          const name = typeof n.name === 'string' ? n.name : null;
          if (!name) continue;
          const status = typeof n.status === 'string' ? n.status : null;
          const rank = STATUS_RANK[status];
          if (rank === undefined) continue;
          const prev = nodeMap.get(name);
          if (prev === undefined || rank > prev) nodeMap.set(name, rank);
        }
      } catch (_) { /* defensive: ignore malformed kbNodes */ }

      // mistakes JSONB: count frequency per node name for hotspots.
      try {
        const ms = Array.isArray(s.mistakes) ? s.mistakes : [];
        for (const m of ms) {
          if (!m || typeof m !== 'object') continue;
          const name = typeof m.node === 'string' ? m.node
            : (typeof m.nodeName === 'string' ? m.nodeName : null);
          if (!name) continue;
          hotspotMap.set(name, (hotspotMap.get(name) || 0) + 1);
        }
      } catch (_) { /* defensive: ignore malformed mistakes */ }

      // lastActiveAt = most recent session.updatedAt for the student.
      if (s.updatedAt) {
        const ts = new Date(s.updatedAt).getTime();
        const prev = lastActiveByUser.get(uid);
        if (prev === undefined || ts > prev) lastActiveByUser.set(uid, ts);
      }
    }

    // Fold mistakes-table rows into hotspot counts (by nodeName).
    for (const row of mistakeNameRows) {
      const name = typeof row.nodeName === 'string' && row.nodeName.length ? row.nodeName : null;
      if (!name) continue;
      hotspotMap.set(name, (hotspotMap.get(name) || 0) + 1);
    }

    // hotspotMistakes: top 10 nodes by mistake count, descending.
    const hotspotMistakes = [...hotspotMap.entries()]
      .map(([nodeName, count]) => ({ nodeName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // topicCompletion: per unique node, how many students are at each status.
    const topicMap = new Map(); // nodeName -> { internalized, fuzzy, blank }
    for (const nodeMap of studentNodes.values()) {
      for (const [name, rank] of nodeMap) {
        const entry = topicMap.get(name) || { internalized: 0, fuzzy: 0, blank: 0 };
        const status = RANK_TO_STATUS[rank];
        if (status === 'internalized') entry.internalized++;
        else if (status === 'fuzzy') entry.fuzzy++;
        else entry.blank++;
        topicMap.set(name, entry);
      }
    }
    const topicCompletion = [...topicMap.entries()]
      .map(([nodeName, v]) => ({
        nodeName,
        internalized: v.internalized,
        fuzzy: v.fuzzy,
        blank: v.blank,
        total: v.internalized + v.fuzzy + v.blank,
      }))
      .sort((a, b) => b.total - a.total);

    // Enrich each student with StudentSummary fields.
    const studentsWithSummary = students.map(s => {
      const uid = s.userId;
      const nodeMap = studentNodes.get(uid);
      let progressPercent = 0;
      if (nodeMap && nodeMap.size > 0) {
        let internalized = 0;
        for (const rank of nodeMap.values()) {
          if (RANK_TO_STATUS[rank] === 'internalized') internalized++;
        }
        progressPercent = Math.round((internalized / nodeMap.size) * 100);
      }
      const lastTs = lastActiveByUser.get(uid);
      const lastActiveAt = lastTs !== undefined ? new Date(lastTs) : null;
      const mistakeCount = mistakeCountByUser.get(uid) || 0;
      return {
        ...s,
        progressPercent,
        streakDays: 0,
        mistakeCount,
        lastActiveAt,
      };
    });

    return res.json({
      classId: req.params.id,
      students: studentsWithSummary,
      hotspotMistakes,
      topicCompletion,
    });
  } catch (err) { next(err); }
});

export default router;
