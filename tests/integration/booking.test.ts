import { expect, describe, test, beforeAll, afterAll } from "@jest/globals";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const BASE_URL = "http://localhost:3000";

async function waitForPersistence(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250));
}

describe("Booking Integration Tests", () => {
  let token: string;
  let patientId: string;
  let doctorId: string;

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: "patient2@test.com",
      password: "patient123",
    });
    if (error) throw error;
    token = data.session.access_token;
    patientId = data.user.id;

    const { data: doctor } = await supabaseAdmin
      .from("doctors")
      .select("id")
      .eq("email", "doctor3@test.com")
      .single();

    if (!doctor) throw new Error("No doctor found for booking tests");
    doctorId = doctor.id;
  });

  afterAll(async () => {
    await supabase.auth.signOut();
  });

  test("successful booking flow", async () => {
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const endTime = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

    const { data: slot } = await supabaseAdmin
      .from("slots")
      .insert({
        doctor_id: doctorId,
        start_time: startTime,
        end_time: endTime,
        is_booked: false,
      })
      .select()
      .single();

    if (!slot) throw new Error("Failed to create slot for booking test");
    await waitForPersistence();

    const res = await fetch(`${BASE_URL}/api/appointments/book`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ slotId: slot.id, doctorId }),
    });

    expect(res.status).toBe(201);
    const appointment = await res.json();
    expect(appointment.status).toBe("active");

    // Cleanup
    await supabaseAdmin.from("appointments").delete().eq("id", appointment.id);
    await supabaseAdmin.from("slots").delete().eq("id", slot.id);
  });

  test("cannot book an already booked slot", async () => {
    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const endTime = new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString();

    const { data: slot } = await supabaseAdmin
      .from("slots")
      .insert({
        doctor_id: doctorId,
        start_time: startTime,
        end_time: endTime,
        is_booked: true,
      })
      .select()
      .single();

    if (!slot) throw new Error("Failed to create booked slot for booking test");
    await waitForPersistence();

    const res = await fetch(`${BASE_URL}/api/appointments/book`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ slotId: slot.id, doctorId }),
    });

    expect(res.status).toBe(409);

    await supabaseAdmin.from("slots").delete().eq("id", slot.id);
  });
});
