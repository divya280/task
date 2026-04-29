import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateCancellable, validateCancellationWindow } from "@/lib/validators";

async function getRole(userId: string) {
  const { data } = await supabaseAdmin.from("doctors").select("id").eq("id", userId).single();
  return data ? "doctor" : "patient";
}

interface Appointment {
  patient_id: string;
  doctor_id: string;
}

function checkAuth(role: string, appt: Appointment, userId: string) {
  if (role === "patient" && appt.patient_id !== userId) return false;
  if (role === "doctor" && appt.doctor_id !== userId) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    console.error("cancel_auth_failed", authError?.message ?? "missing user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { appointmentId, action } = await req.json();
  if (!appointmentId || !action) {
    return NextResponse.json(
      { error: "appointmentId and action are required" },
      { status: 400 }
    );
  }
  if (action !== "cancel" && action !== "done") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const role = await getRole(user.id);
  const { data: appt } = await supabaseAdmin.from("appointments").select("*").eq("id", appointmentId).single();

  if (!appt) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (!checkAuth(role, appt, user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    validateCancellable(appt);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }

  const { data: slot } = await supabaseAdmin.from("slots").select("*").eq("id", appt.slot_id).single();
  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  try {
    validateCancellationWindow(slot, role);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }

  if (action === "done" && role !== "doctor") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: updated } = await supabaseAdmin.from("appointments")
    .update({ status: action === "cancel" ? "cancelled" : "done" })
    .eq("id", appointmentId).select().single();

  if (action === "cancel") await supabaseAdmin.from("slots").update({ is_booked: false }).eq("id", appt.slot_id);

  return NextResponse.json(updated, { status: 200 });
}
