import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ns_session", "", { path: "/", maxAge: 0, sameSite: "none", secure: true });
  return res;
}
