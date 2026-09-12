import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { cookies } from "next/headers";

const COOKIE = "fidetok_session";
const SESSION_DAYS = 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET tiene que tener 32+ caracteres");
  return new TextEncoder().encode(value);
}

export async function signToken(payload: JWTPayload, expiresIn: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiresIn).sign(secret());
}

export async function verifyToken<T extends JWTPayload>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify<T>(token, secret());
    return payload;
  } catch {
    return null;
  }
}

export type Session = { wallet: string; isAdmin: boolean };

export function isAdminWallet(wallet: string) {
  return Boolean(process.env.ADMIN_WALLET) && wallet === process.env.ADMIN_WALLET;
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken<{ wallet: string }>(token);
  if (!payload?.wallet) return null;
  return { wallet: payload.wallet, isAdmin: isAdminWallet(payload.wallet) };
}

export async function setSession(wallet: string) {
  const token = await signToken({ wallet }, `${SESSION_DAYS}d`);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
