import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";

const SESSION_COOKIE = "admin_session";
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
let cachedAuthSecret: Uint8Array | null = null;

export class AuthConfigurationError extends Error {}

function getAuthSecret() {
  if (cachedAuthSecret) return cachedAuthSecret;

  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) {
    if (configured.length < 32) {
      throw new AuthConfigurationError("AUTH_SECRET must contain at least 32 characters");
    }
    cachedAuthSecret = new TextEncoder().encode(configured);
    return cachedAuthSecret;
  }
  throw new AuthConfigurationError("AUTH_SECRET must be configured");
}

export function isAuthConfigured() {
  return Boolean(
    process.env.ADMIN_PASSWORD?.trim()
    && (process.env.AUTH_SECRET?.trim().length || 0) >= 32,
  );
}

export async function verifyAdminToken(token: string | undefined): Promise<JWTPayload | null> {
  if (!token || !isAuthConfigured()) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      algorithms: ["HS256"],
    });
    return payload.admin === true ? payload : null;
  } catch {
    return null;
  }
}

export function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

export function allowLoginAttempt(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= LOGIN_LIMIT) return false;
  current.count += 1;
  return true;
}

export function clearLoginAttempts(key: string) {
  loginAttempts.delete(key);
}

export async function requireAdmin(request?: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
  }

  const origin = request?.headers.get("origin");
  if (origin && request) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function authSecret() {
  return getAuthSecret();
}
