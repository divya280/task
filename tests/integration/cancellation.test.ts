import { expect, describe, test, beforeAll, afterAll } from "@jest/globals";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const BASE_URL = "http://localhost:3000";

async function waitForPersistence(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250));
}

describe("Cancellation Integration Tests", () => {
  let token: string;
  let patientId: string;

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: "patient3@test.com",
      password: "patient123",
    });
    if (error) throw error;
    token = data.session.access_token;
    patientId = data.user.id;
  });

  afterAll(async () => {
    await supabase.auth.signOut();
  });

  test("successful cancellation flow", async () => {
    // 1. Create a slot far in the future
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: slot } = await supabaseAdmin
      .from("slots")
      .insert({
        doctor_id: (await supabaseAdmin.from("doctors").select("id").limit(1).single()).data?.id,
        start_time: futureDate,
        end_time: futureDate, // simplification
        is_booked: true,
      })
      .select()
      .single();
    await waitForPersistence();

    // 2. Create appointment
    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .insert({
        patient_id: patientId,
        doctor_id: slot.doctor_id,
        slot_id: slot.id,
        status: "active",
      })
      .select()
      .single();
    await waitForPersistence();

    // 3. POST to cancel
    const res = await fetch(`${BASE_URL}/api/appointments/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ appointmentId: appt.id, action: "cancel" }),
    });

    expect(res.status).toBe(200);
    const updatedAppt = await res.json();
    expect(updatedAppt.status).toBe("cancelled");

    const { data: updatedSlot } = await supabaseAdmin
      .from("slots")
      .select("is_booked")
      .eq("id", slot.id)
      .single();
    expect(updatedSlot?.is_booked).toBe(false);

    // Cleanup
    await supabaseAdmin.from("appointments").delete().eq("id", appt.id);
    await supabaseAdmin.from("slots").delete().eq("id", slot.id);
  });

  test("patient cannot cancel within 1 hour of start", async () => {
    // 1. Create a slot soon
    const soonDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: slot } = await supabaseAdmin
      .from("slots")
      .insert({
        doctor_id: (await supabaseAdmin.from("doctors").select("id").limit(1).single()).data?.id,
        start_time: soonDate,
        end_time: soonDate,
        is_booked: true,
      })
      .select()
      .single();
    await waitForPersistence();

    // 2. Create appointment
    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .insert({
        patient_id: patientId,
        doctor_id: slot.doctor_id,
        slot_id: slot.id,
        status: "active",
      })
      .select()
      .single();
    await waitForPersistence();

    // 3. POST to cancel
    const res = await fetch(`${BASE_URL}/api/appointments/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ appointmentId: appt.id, action: "cancel" }),
    });

    expect(res.status).toBe(409);

    // Cleanup
    await supabaseAdmin.from("appointments").delete().eq("id", appt.id);
    await supabaseAdmin.from("slots").delete().eq("id", slot.id);
  });
});
