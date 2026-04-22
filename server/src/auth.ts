import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "./db.js";
import { dashboardData } from "./data/dashboard.js";

const scrypt = promisify(scryptCallback);

const AUTH_SECRET = process.env.AUTH_SECRET?.trim() || "dev-only-auth-secret-change-me";
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL?.trim() || "demo@task-web.local";
const ALLOW_DEMO_AUTH_FALLBACK = process.env.ALLOW_DEMO_AUTH_FALLBACK !== "false";

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) {
    return false;
  }

  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function signToken(payload: { userId: string; email: string; exp: number }) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", AUTH_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid token");
  }

  const expectedSignature = createHmac("sha256", AUTH_SECRET).update(encodedPayload).digest("base64url");
  if (signature !== expectedSignature) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as {
    userId: string;
    email: string;
    exp: number;
  };

  if (payload.exp < Date.now()) {
    throw new Error("Token expired");
  }

  return payload;
}

function buildToken(user: { id: string; email: string }) {
  return signToken({
    userId: user.id,
    email: user.email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  });
}

function serializeUser(user: { id: string; email: string; nickname: string | null; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname ?? "",
    createdAt: user.createdAt.toISOString(),
    isDemo: user.email === DEMO_USER_EMAIL
  };
}

export async function registerUser(input: { email: string; password: string; nickname?: string }) {
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();
  const nickname = input.nickname?.trim() || email.split("@")[0];

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("Email already registered");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      nickname,
      settings: {
        create: {
          quickCapturePlaceholder: dashboardData.inspiration.quickCapturePlaceholder
        }
      }
    }
  });

  return {
    token: buildToken(user),
    user: serializeUser(user)
  };
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }

  return {
    token: buildToken(user),
    user: serializeUser(user)
  };
}

export async function getCurrentUser(token?: string) {
  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    throw new Error("User not found");
  }

  return serializeUser(user);
}

export async function resolveRequestUserId(token?: string) {
  if (!token) {
    if (!ALLOW_DEMO_AUTH_FALLBACK) {
      throw new Error("Unauthorized");
    }

    const demo = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
    if (!demo) {
      throw new Error("Demo user not found");
    }

    return demo.id;
  }

  const payload = verifyToken(token);
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    throw new Error("User not found");
  }

  return user.id;
}
