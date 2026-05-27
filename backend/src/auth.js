const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const { COLORS } = require('./data/seedData');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = 'Link & Plan';
const RP_ORIGIN = (process.env.RP_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const COOKIE_NAME = 'lp_session';
const IS_PROD = process.env.NODE_ENV === 'production';

const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_-]+$/i, 'only letters, numbers, _ and -');

function issueSession(res, userId) {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function readSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function consumeChallenge(prisma, username, kind) {
  const row = await prisma.authChallenge.findFirst({
    where: { username, kind },
    orderBy: { createdAt: 'desc' }
  });
  if (!row) return null;
  await prisma.authChallenge.deleteMany({ where: { username, kind } });
  return row.challenge;
}

function publicUser(u) {
  if (!u) return null;
  const { id, name, username, color, foodTags, activityTags, pace, createdAt } = u;
  return { id, name, username, color, foodTags, activityTags, pace, createdAt };
}

function createAuthRouter(prisma) {
  const router = express.Router();

  router.post('/register/options', async (req, res, next) => {
    try {
      const { username, name } = z
        .object({ username: usernameSchema, name: z.string().min(1).max(60) })
        .parse(req.body);
      const normalized = username.toLowerCase();

      const existing = await prisma.user.findUnique({ where: { username: normalized } });
      if (existing) return res.status(409).json({ message: 'Username already taken' });

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: normalized,
        userDisplayName: name,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred'
        }
      });

      await prisma.authChallenge.create({
        data: { username: normalized, challenge: options.challenge, kind: 'register' }
      });

      res.json(options);
    } catch (err) {
      next(err);
    }
  });

  router.post('/register/verify', async (req, res, next) => {
    try {
      const { username, name, response } = z
        .object({
          username: usernameSchema,
          name: z.string().min(1).max(60),
          response: z.any()
        })
        .parse(req.body);
      const normalized = username.toLowerCase();

      const expectedChallenge = await consumeChallenge(prisma, normalized, 'register');
      if (!expectedChallenge) return res.status(400).json({ message: 'Challenge expired' });

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID
      });

      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ message: 'Verification failed' });
      }

      const { credential } = verification.registrationInfo;
      const usersCount = await prisma.user.count();

      const user = await prisma.user.create({
        data: {
          name,
          username: normalized,
          color: COLORS[usersCount % COLORS.length],
          credentials: {
            create: {
              id: credential.id,
              publicKey: Buffer.from(credential.publicKey),
              counter: BigInt(credential.counter ?? 0),
              transports: credential.transports ?? []
            }
          }
        }
      });

      issueSession(res, user.id);
      res.status(201).json(publicUser(user));
    } catch (err) {
      next(err);
    }
  });

  router.post('/login/options', async (req, res, next) => {
    try {
      const { username } = z.object({ username: usernameSchema }).parse(req.body);
      const normalized = username.toLowerCase();

      const user = await prisma.user.findUnique({
        where: { username: normalized },
        include: { credentials: true }
      });
      if (!user || user.credentials.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: user.credentials.map((c) => ({
          id: c.id,
          transports: c.transports
        })),
        userVerification: 'preferred'
      });

      await prisma.authChallenge.create({
        data: { username: normalized, challenge: options.challenge, kind: 'login' }
      });

      res.json(options);
    } catch (err) {
      next(err);
    }
  });

  router.post('/login/verify', async (req, res, next) => {
    try {
      const { username, response } = z
        .object({ username: usernameSchema, response: z.any() })
        .parse(req.body);
      const normalized = username.toLowerCase();

      const expectedChallenge = await consumeChallenge(prisma, normalized, 'login');
      if (!expectedChallenge) return res.status(400).json({ message: 'Challenge expired' });

      const user = await prisma.user.findUnique({
        where: { username: normalized },
        include: { credentials: true }
      });
      if (!user) return res.status(404).json({ message: 'User not found' });

      const credential = user.credentials.find((c) => c.id === response.id);
      if (!credential) return res.status(400).json({ message: 'Unknown credential' });

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.publicKey),
          counter: Number(credential.counter),
          transports: credential.transports
        }
      });

      if (!verification.verified) {
        return res.status(400).json({ message: 'Verification failed' });
      }

      await prisma.credential.update({
        where: { id: credential.id },
        data: { counter: BigInt(verification.authenticationInfo.newCounter) }
      });

      issueSession(res, user.id);
      res.json(publicUser(user));
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', async (req, res, next) => {
    try {
      const session = readSession(req);
      if (!session) return res.status(401).json({ message: 'Not authenticated' });
      const user = await prisma.user.findUnique({ where: { id: session.sub } });
      if (!user) return res.status(401).json({ message: 'Not authenticated' });
      res.json(publicUser(user));
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      path: '/'
    });
    res.status(204).end();
  });

  return router;
}

module.exports = { createAuthRouter };
