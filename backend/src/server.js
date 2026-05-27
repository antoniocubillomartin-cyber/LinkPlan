require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { z } = require('zod');
const { PrismaClient, VenueType, ReservationStatus } = require('@prisma/client');
const { generatePlan } = require('./services/planService');
const { COLORS } = require('./data/seedData');
const { createAuthRouter } = require('./auth');

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
  organizerId: z.string().min(1),
  companionIds: z.array(z.string()).default([]),
  budgetPerPerson: z.number().min(10).max(500).default(50),
  date: z.string().min(1),
  zone: z.string().optional().default('')
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

app.post('/api/plans/generate', async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body);
    const users = await prisma.user.findMany({ where: { id: { in: [input.organizerId, ...input.companionIds] } } });
    const organizer = users.find((u) => u.id === input.organizerId);
    const companions = users.filter((u) => input.companionIds.includes(u.id));
    const venues = await prisma.venue.findMany();

    const plan = generatePlan({
      organizer,
      companions,
      budgetPerPerson: input.budgetPerPerson,
      date: input.date,
      zone: input.zone,
      restaurants: venues.filter((v) => v.type === VenueType.RESTAURANT),
      activities: venues.filter((v) => v.type === VenueType.ACTIVITY)
    });

    const createdPlan = await prisma.plan.create({
      data: {
        date: new Date(plan.date),
        zone: plan.zone || null,
        pace: plan.pace,
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
