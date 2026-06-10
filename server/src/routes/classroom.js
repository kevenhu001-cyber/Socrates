import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { classroomClasses, classStudents } from '../db/schema.js';
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
    return res.json({ classId: req.params.id, students, hotspotMistakes: [], topicCompletion: [] });
  } catch (err) { next(err); }
});

export default router;
