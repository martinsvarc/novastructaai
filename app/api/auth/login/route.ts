import { NextRequest, NextResponse } from "next/server";

const VALID_EMAIL = "marketing@novastructa.com";
const VALID_PASSWORD = "novastructa2026!";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").toLowerCase().trim();
    const password = String(body?.password ?? "");

    console.log("Login attempt:", { email, passwordLength: password.length });

    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      const res = NextResponse.json({ ok: true });
      res.cookies.set("ns_session", "authenticated", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    }

    return NextResponse.json({
      ok: false,
      error: "Invalid credentials",
      debug: {
        receivedEmail: email,
        expectedEmail: VALID_EMAIL,
        emailMatch: email === VALID_EMAIL,
        passwordMatch: password === VALID_PASSWORD,
        passwordLength: password.length,
        expectedPasswordLength: VALID_PASSWORD.length,
      },
    }, { status: 401 });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}
