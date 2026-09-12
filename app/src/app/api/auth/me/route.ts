import { NextResponse } from "next/server";

import { handle } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";
import { db } from "@/lib/server/supabase";

export const GET = handle(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ session: null, profile: null, kyc: null });

  const [{ data: profile }, { data: kyc }] = await Promise.all([
    db().from("profiles").select("rol").eq("wallet", session.wallet).maybeSingle(),
    db().from("kyc").select("status, residente_ar").eq("wallet", session.wallet).maybeSingle(),
  ]);
  return NextResponse.json({ session, profile, kyc });
});
