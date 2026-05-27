require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { z } = require('zod');
const { PrismaClient, VenueType, ReservationStatus } = require('@prisma/client');
const { generatePlan } = require('./services/planService');
const { COLORS } = require('./data/seedData');
const { createAuthRouter, requireAuth } = require('./auth');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.FRONTEND_URL || 'https://link-plan-frontend.vercel.app,https://link-plan-frontend-dts4.vercel.app,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin not allowed'));
    },
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', createAuthRouter(prisma));

const userSchema = z.object({
  name: z.string().min(1),
  foodTags: z.array(z.string()).default([]),
  activityTags: z.array(z.string()).default([]),
  pace: z.enum(['relajado', 'moderado', 'intenso']).default('moderado')
});

const planSchema = z.object({
  organizerId: z.string().optional(),
  companionIds: z.array(z.string()).default([]),
  budgetPerPerson: z.number().min(10).max(500).default(50),
  date: z.string().min(1),
  zone: z.string().optional().default(''),
  duration: z.enum(['corto', 'medio', 'largo']).optional().default('medio'),
  excludeIds: z.array(z.string()).optional().default([]),
  variantSeed: z.number().optional().default(0)
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

app.post('/api/users', async (req, res, next) => {
  try {
    const input = userSchema.parse(req.body);
    const usersCount = await prisma.user.count();
    const user = await prisma.user.create({ data: { ...input, color: COLORS[usersCount % COLORS.length] } });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/users/:id', async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const profileSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(280).optional().nullable(),
  foodTags: z.array(z.string()).optional(),
  activityTags: z.array(z.string()).optional()
});

app.patch('/api/users/me', requireAuth, async (req, res, next) => {
  try {
    const patch = profileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.foodTags !== undefined ? { foodTags: patch.foodTags } : {}),
        ...(patch.activityTags !== undefined ? { activityTags: patch.activityTags } : {})
      }
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

app.get('/api/friends', requireAuth, async (req, res, next) => {
  try {
    const links = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: req.userId }, { receiverId: req.userId }] },
      include: { requester: true, receiver: true }
    });
    const friends = links.map((l) => (l.requesterId === req.userId ? l.receiver : l.requester));
    res.json(friends);
  } catch (err) {
    next(err);
  }
});

app.post('/api/friends/:userId', requireAuth, async (req, res, next) => {
  try {
    const other = req.params.userId;
    if (other === req.userId) return res.status(400).json({ message: 'Cannot befriend yourself' });
    const target = await prisma.user.findUnique({ where: { id: other } });
    if (!target) return res.status(404).json({ message: 'User not found' });
    const [a, b] = [req.userId, other].sort();
    await prisma.friendship.upsert({
      where: { requesterId_receiverId: { requesterId: a, receiverId: b } },
      update: {},
      create: { requesterId: a, receiverId: b }
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/friends/:userId', requireAuth, async (req, res, next) => {
  try {
    const other = req.params.userId;
    const [a, b] = [req.userId, other].sort();
    await prisma.friendship.deleteMany({
      where: { requesterId: a, receiverId: b }
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.get('/api/venues', async (req, res, next) => {
  try {
    const type = req.query.type === 'ACTIVITY' ? VenueType.ACTIVITY : req.query.type === 'RESTAURANT' ? VenueType.RESTAURANT : undefined;
    const venues = await prisma.venue.findMany({ where: { type }, orderBy: { name: 'asc' } });
    res.json(venues);
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/data', async (_req, res, next) => {
  try {
    const [restaurants, activities, users, plans, reservations] = await Promise.all([
      prisma.venue.findMany({ where: { type: VenueType.RESTAURANT } }),
      prisma.venue.findMany({ where: { type: VenueType.ACTIVITY } }),
      prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.plan.count(),
      prisma.reservation.count()
    ]);
    res.json({ restaurants, activities, users, stats: { plans, reservations } });
  } catch (err) {
    next(err);
  }
});

app.post('/api/plans/generate', requireAuth, async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body);
    const organizerId = req.userId;
    const ids = Array.from(new Set([organizerId, ...input.companionIds]));
    const users = await prisma.user.findMany({ where: { id: { in: ids } } });
    const organizer = users.find((u) => u.id === organizerId);
    const companions = users.filter((u) => input.companionIds.includes(u.id) && u.id !== organizerId);
    const venues = await prisma.venue.findMany();

    const plan = generatePlan({
      organizer,
      companions,
      budgetPerPerson: input.budgetPerPerson,
      date: input.date,
      zone: input.zone,
      duration: input.duration,
      excludeIds: input.excludeIds,
      variantSeed: input.variantSeed,
      restaurants: venues.filter((v) => v.type === VenueType.RESTAURANT),
      activities: venues.filter((v) => v.type === VenueType.ACTIVITY)
    });

    const createdPlan = await prisma.plan.create({
      data: {
        date: new Date(plan.date),
        zone: plan.zone || null,
        pace: plan.pace,
        duration: plan.duration,
        budgetPerPerson: plan.budgetPerPerson,
        totalBudget: plan.totalBudget,
        totalCost: plan.totalCost,
        remainingBudget: plan.remainingBudget,
        organizerId: plan.organizer.id,
        morningVenueId: plan.morning.id,
        lunchVenueId: plan.lunch.id,
        afternoonVenueId: plan.afternoon.id,
        participants: {
          createMany: {
            data: plan.allUsers.map((u) => ({ userId: u.id }))
          }
        }
      }
    });

    res.status(201).json({ ...plan, id: createdPlan.id });
  } catch (err) {
    next(err);
  }
});

const planInclude = {
  organizer: true,
  participants: { include: { user: true } },
  morningVenue: true,
  lunchVenue: true,
  afternoonVenue: true,
  reservation: true
};

app.get('/api/plans/mine', requireAuth, async (req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { participants: { some: { userId: req.userId } } },
      orderBy: { date: 'desc' },
      include: planInclude
    });
    res.json(plans);
  } catch (err) {
    next(err);
  }
});

app.patch('/api/plans/:id', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    const plan = await prisma.plan.findUnique({
      where: { id },
      include: { participants: true }
    });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (!plan.participants.some((p) => p.userId === req.userId)) {
      return res.status(403).json({ message: 'Not a participant' });
    }

    const patch = z
      .object({
        date: z.string().optional(),
        zone: z.string().optional().nullable(),
        status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional()
      })
      .parse(req.body);

    const updated = await prisma.plan.update({
      where: { id },
      data: {
        ...(patch.date ? { date: new Date(patch.date) } : {}),
        ...(patch.zone !== undefined ? { zone: patch.zone || null } : {}),
        ...(patch.status ? { status: patch.status } : {})
      },
      include: planInclude
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.post('/api/plans/:id/complete', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    const plan = await prisma.plan.findUnique({
      where: { id },
      include: { participants: true }
    });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (!plan.participants.some((p) => p.userId === req.userId)) {
      return res.status(403).json({ message: 'Not a participant' });
    }
    const updated = await prisma.plan.update({
      where: { id },
      data: { status: 'COMPLETED' },
      include: planInclude
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/plans/:id', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (plan.organizerId !== req.userId) {
      return res.status(403).json({ message: 'Only the organizer can delete this plan' });
    }
    await prisma.plan.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.get('/api/reservations', async (_req, res, next) => {
  try {
    const reservations = await prisma.reservation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        plan: {
          include: {
            organizer: true,
            participants: { include: { user: true } },
            morningVenue: true,
            lunchVenue: true,
            afternoonVenue: true
          }
        }
      }
    });
    res.json(reservations);
  } catch (err) {
    next(err);
  }
});

app.post('/api/reservations', async (req, res, next) => {
  try {
    const payload = z.object({ planId: z.string().min(1) }).parse(req.body);
    const code = `#MAD-${Math.floor(1000 + Math.random() * 9000)}`;
    const reservation = await prisma.reservation.create({
      data: {
        code,
        status: ReservationStatus.CONFIRMED,
        planId: payload.planId
      }
    });
    res.status(201).json(reservation);
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  if (err?.name === 'ZodError') {
    return res.status(400).json({ message: 'Validation error', issues: err.issues });
  }
  console.error(err);
  return res.status(500).json({ message: err.message || 'Unexpected server error' });
});

app.listen(PORT, () => {
  console.log(`LINK & PLAN API listening on :${PORT}`);
});
