import { NextRequest, NextResponse } from "next/server";

const VALID_EMAIL = "marketing@novastructa.com";
const VALID_PASSWORD = "novastructa2026!";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (
    email?.toLowerCase().trim() === VALID_EMAIL &&
    password === VALID_PASSWORD
  ) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("ns_session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  }

  return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
}
