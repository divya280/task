import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  validateNoDuplicateBooking,
  validateSlotAvailable,
  validateSlotInFuture,
} from "@/lib/validators";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    console.error("book_auth_failed", authError?.message ?? "missing user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slotId, doctorId } = await req.json();

  if (!slotId || !doctorId) {
    return NextResponse.json(
      { error: "slotId and doctorId are required" },
      { status: 400 }
    );
  }

  const { data: slot, error: slotError } = await supabaseAdmin
    .from("slots")
    .select("*")
    .eq("id", slotId)
    .single();

  if (slotError || !slot) {
    console.error("book_slot_lookup_failed", slotError?.message ?? "slot not found");
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  if (slot.doctor_id !== doctorId) {
    return NextResponse.json(
      { error: "Selected slot does not belong to the chosen doctor" },
      { status: 409 }
    );
  }

  try {
    validateSlotAvailable(slot);
    validateSlotInFuture(slot);
  } catch (e) {
    const error = e as Error;
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  // Fetch existing active appointments
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("appointments")
    .select("status")
    .eq("patient_id", user.id)
    .eq("doctor_id", doctorId)
    .eq("status", "active");

  if (existingError) {
    console.error("book_existing_lookup_failed", existingError.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  try {
    validateNoDuplicateBooking(existing || []);
  } catch (e) {
    const error = e as Error;
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  // Call RPC
  const { data: appointment, error: rpcError } = await supabaseAdmin.rpc("book_appointment", {
    p_patient_id: user.id,
    p_doctor_id: slot.doctor_id,
    p_slot_id: slotId,
  });

  if (rpcError) {
    console.error("book_rpc_failed", rpcError.message);
    return NextResponse.json({ error: rpcError.message }, { status: 409 });
  }

  return NextResponse.json(appointment, { status: 201 });
}
