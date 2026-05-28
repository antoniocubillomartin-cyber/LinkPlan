require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { z } = require('zod');
const { PrismaClient, VenueType, ReservationStatus } = require('@prisma/client');
const { generatePlan, pickPace } = require('./services/planService');
const { computePlanSuggestions } = require('./services/suggestionService');
const { validateAllVenues } = require('./services/urlValidationService');
const { getTrendingNews } = require('./services/newsService');
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
  activityTags: z.array(z.string()).optional(),
  pace: z.enum(['relajado', 'moderado', 'intenso']).optional()
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
        ...(patch.activityTags !== undefined ? { activityTags: patch.activityTags } : {}),
        ...(patch.pace !== undefined ? { pace: patch.pace } : {})
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

app.get('/api/trends/categories', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 12);
    const [users, venues] = await Promise.all([
      prisma.user.findMany({ select: { foodTags: true, activityTags: true } }),
      prisma.venue.findMany({ select: { tags: true, type: true } })
    ]);

    const rank = (kind) => {
      const userField = kind === 'food' ? 'foodTags' : 'activityTags';
      const venueType = kind === 'food' ? VenueType.RESTAURANT : VenueType.ACTIVITY;
      const demand = {};
      for (const u of users) for (const t of u[userField] || []) demand[t] = (demand[t] || 0) + 1;
      const supply = {};
      const kindVenues = venues.filter((v) => v.type === venueType);
      for (const v of kindVenues) for (const t of v.tags || []) supply[t] = (supply[t] || 0) + 1;
      const totalUsers = users.length || 1;
      const totalVenues = kindVenues.length || 1;
      const tags = new Set([...Object.keys(demand), ...Object.keys(supply)]);
      return [...tags]
        .map((tag) => {
          const d = (demand[tag] || 0) / totalUsers;
          const s = (supply[tag] || 0) / totalVenues;
          return {
            tag,
            kind,
            score: Math.round((0.7 * d + 0.3 * s) * 100),
            users: demand[tag] || 0,
            venues: supply[tag] || 0
          };
        })
        .sort((a, b) => b.score - a.score || b.users - a.users);
    };

    const food = rank('food');
    const activity = rank('activity');
    const top = [...food, ...activity].sort((a, b) => b.score - a.score || b.users - a.users).slice(0, limit);
    res.json({ food: food.slice(0, limit), activity: activity.slice(0, limit), top });
  } catch (err) {
    next(err);
  }
});

app.get('/api/trends/news', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 30);
    const news = await getTrendingNews({ limit });
    res.json(news);
  } catch (err) {
    res.json({ updatedAt: null, total: 0, items: [], error: 'feed-unavailable' });
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

app.post('/api/venues/validate-urls', requireAuth, async (_req, res, next) => {
  try {
    const summary = await validateAllVenues(prisma);
    res.json(summary);
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

async function getFriendIds(userId) {
  const links = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { receiverId: userId }] }
  });
  return new Set(links.map((l) => (l.requesterId === userId ? l.receiverId : l.requesterId)));
}

function assertCompanionsAreFriends(companionIds, organizerId, friendIds) {
  const invalid = companionIds.filter((id) => id !== organizerId && !friendIds.has(id));
  return invalid.length === 0;
}

app.post('/api/plans/generate', requireAuth, async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body);
    const organizerId = req.userId;

    const friendIds = await getFriendIds(organizerId);
    if (!assertCompanionsAreFriends(input.companionIds, organizerId, friendIds)) {
      return res.status(403).json({ message: 'Solo puedes crear planes con tus amigos' });
    }

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

    // Preview only: no se persiste hasta que el usuario confirme (POST /api/plans).
    res.json({ ...plan, preview: true });
  } catch (err) {
    next(err);
  }
});

const confirmPlanSchema = z.object({
  companionIds: z.array(z.string()).default([]),
  budgetPerPerson: z.number().min(10).max(500),
  date: z.string().min(1),
  zone: z.string().optional().default(''),
  duration: z.enum(['corto', 'medio', 'largo']).optional().default('medio'),
  morningVenueId: z.string().min(1),
  lunchVenueId: z.string().min(1),
  afternoonVenueId: z.string().min(1)
});

app.post('/api/plans', requireAuth, async (req, res, next) => {
  try {
    const input = confirmPlanSchema.parse(req.body);
    const organizerId = req.userId;

    const friendIds = await getFriendIds(organizerId);
    if (!assertCompanionsAreFriends(input.companionIds, organizerId, friendIds)) {
      return res.status(403).json({ message: 'Solo puedes crear planes con tus amigos' });
    }

    const ids = Array.from(new Set([organizerId, ...input.companionIds]));
    const users = await prisma.user.findMany({ where: { id: { in: ids } } });
    const totalPeople = users.length;

    const [morning, lunch, afternoon] = await Promise.all([
      prisma.venue.findUnique({ where: { id: input.morningVenueId } }),
      prisma.venue.findUnique({ where: { id: input.lunchVenueId } }),
      prisma.venue.findUnique({ where: { id: input.afternoonVenueId } })
    ]);
    if (!morning || !lunch || !afternoon) return res.status(400).json({ message: 'Venue inválido' });
    if (morning.type !== VenueType.ACTIVITY || afternoon.type !== VenueType.ACTIVITY || lunch.type !== VenueType.RESTAURANT) {
      return res.status(400).json({ message: 'Tipos de venue inválidos' });
    }
    if (morning.id === afternoon.id) return res.status(400).json({ message: 'Mañana y tarde no pueden ser el mismo sitio' });

    const perPerson = morning.price + lunch.price + afternoon.price;
    if (perPerson > input.budgetPerPerson) return res.status(400).json({ message: 'El plan supera el presupuesto por persona' });

    const totalBudget = input.budgetPerPerson * totalPeople;
    const totalCost = perPerson * totalPeople;
    const pace = pickPace(users);

    const created = await prisma.plan.create({
      data: {
        date: new Date(input.date),
        zone: input.zone || null,
        pace,
        duration: input.duration,
        budgetPerPerson: input.budgetPerPerson,
        totalBudget,
        totalCost,
        remainingBudget: totalBudget - totalCost,
        organizerId,
        morningVenueId: morning.id,
        lunchVenueId: lunch.id,
        afternoonVenueId: afternoon.id,
        participants: { createMany: { data: ids.map((id) => ({ userId: id })) } }
      },
      include: planInclude
    });

    res.status(201).json(created);
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

app.get('/api/plans/mine/suggestions', requireAuth, async (req, res, next) => {
  try {
    const [plans, venues] = await Promise.all([
      prisma.plan.findMany({
        where: { participants: { some: { userId: req.userId } }, status: 'ACTIVE' },
        include: planInclude
      }),
      prisma.venue.findMany()
    ]);
    const result = plans
      .map((plan) => ({ planId: plan.id, suggestions: computePlanSuggestions(plan, venues) }))
      .filter((p) => p.suggestions.length > 0);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/plans/:id/swap-venue', requireAuth, async (req, res, next) => {
  try {
    const { slot, venueId } = z
      .object({ slot: z.enum(['morning', 'lunch', 'afternoon']), venueId: z.string().min(1) })
      .parse(req.body);

    const plan = await prisma.plan.findUnique({ where: { id: req.params.id }, include: planInclude });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (!plan.participants.some((p) => p.userId === req.userId)) {
      return res.status(403).json({ message: 'Not a participant' });
    }
    if (plan.status !== 'ACTIVE') return res.status(400).json({ message: 'Solo se pueden modificar planes activos' });

    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue || !venue.available) return res.status(404).json({ message: 'Venue not available' });

    const expectedType = slot === 'lunch' ? VenueType.RESTAURANT : VenueType.ACTIVITY;
    if (venue.type !== expectedType) return res.status(400).json({ message: 'El venue no corresponde a ese momento del plan' });

    if (slot === 'morning' && venueId === plan.afternoonVenueId) return res.status(400).json({ message: 'Mañana y tarde no pueden ser el mismo sitio' });
    if (slot === 'afternoon' && venueId === plan.morningVenueId) return res.status(400).json({ message: 'Mañana y tarde no pueden ser el mismo sitio' });

    const slotField = slot === 'morning' ? 'morningVenueId' : slot === 'lunch' ? 'lunchVenueId' : 'afternoonVenueId';
    const prices = {
      morning: plan.morningVenue.price,
      lunch: plan.lunchVenue.price,
      afternoon: plan.afternoonVenue.price
    };
    prices[slot] = venue.price;
    const perPerson = prices.morning + prices.lunch + prices.afternoon;
    if (perPerson > plan.budgetPerPerson) {
      return res.status(400).json({ message: 'El cambio supera el presupuesto por persona' });
    }

    const totalPeople = plan.participants.length;
    const totalCost = perPerson * totalPeople;

    const updated = await prisma.plan.update({
      where: { id: plan.id },
      data: {
        [slotField]: venueId,
        totalCost,
        remainingBudget: plan.totalBudget - totalCost
      },
      include: planInclude
    });
    res.json(updated);
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
