import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const { data: adminId, error } = await supabaseAdmin.rpc("authenticate_system_admin", {
    p_email: email,
    p_password: password,
  });

  if (error || !adminId) {
    console.error("admin_login_failed", error?.message ?? "invalid credentials");
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  response.cookies.set("admin_session", `admin_${adminId}`, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 86400,
    path: "/",
  });

  return response;
}
