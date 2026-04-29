import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const BASE_URL = "http://localhost:3000";

async function waitForPersistence(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250));
}

describe("API Guard Integration Tests", () => {
  let patientToken: string;
  let doctorToken: string;
  let patientId: string;
  let doctorId: string;

  beforeAll(async () => {
    const patientLogin = await supabase.auth.signInWithPassword({
      email: "patient1@test.com",
      password: "patient123",
    });
    if (patientLogin.error) throw patientLogin.error;

    patientToken = patientLogin.data.session.access_token;
    patientId = patientLogin.data.user.id;

    const doctorLogin = await supabase.auth.signInWithPassword({
      email: "doctor1@test.com",
      password: "doctor123",
    });
    if (doctorLogin.error) throw doctorLogin.error;

    doctorToken = doctorLogin.data.session.access_token;
    doctorId = doctorLogin.data.user.id;
  });

  afterAll(async () => {
    await supabase.auth.signOut();
  });

  test("booking requires authentication", async () => {
    const res = await fetch(`${BASE_URL}/api/appointments/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: "missing", doctorId: doctorId }),
    });

    expect(res.status).toBe(401);
  });

  test("cancellation requires authentication", async () => {
    const res = await fetch(`${BASE_URL}/api/appointments/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: "missing", action: "cancel" }),
    });

    expect(res.status).toBe(401);
  });

  test("invalid slot id returns 404", async () => {
    const res = await fetch(`${BASE_URL}/api/appointments/book`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({
        slotId: "00000000-0000-0000-0000-000000000000",
        doctorId,
      }),
    });

    expect(res.status).toBe(404);
  });

  test("patient cannot mark an appointment done", async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: slot } = await supabaseAdmin
      .from("slots")
      .insert({
        doctor_id: doctorId,
        start_time: futureDate,
        end_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        is_booked: true,
      })
      .select()
      .single();

    if (!slot) throw new Error("Failed to create slot for forbidden-action test");
    await waitForPersistence();

    const { data: appointment } = await supabaseAdmin
      .from("appointments")
      .insert({
        patient_id: patientId,
        doctor_id: doctorId,
        slot_id: slot.id,
        status: "active",
      })
      .select()
      .single();
    await waitForPersistence();

    if (!appointment) throw new Error("Failed to create appointment for forbidden-action test");

    const res = await fetch(`${BASE_URL}/api/appointments/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({ appointmentId: appointment.id, action: "done" }),
    });

    expect(res.status).toBe(403);

    await supabaseAdmin.from("appointments").delete().eq("id", appointment.id);
    await supabaseAdmin.from("slots").delete().eq("id", slot.id);
  });

  test("invalid appointment id returns 404", async () => {
    const res = await fetch(`${BASE_URL}/api/appointments/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        appointmentId: "00000000-0000-0000-0000-000000000000",
        action: "cancel",
      }),
    });

    expect(res.status).toBe(404);
  });

  test("past slots cannot be booked", async () => {
    const pastStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const pastEnd = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: slot } = await supabaseAdmin
      .from("slots")
      .insert({
        doctor_id: doctorId,
        start_time: pastStart,
        end_time: pastEnd,
        is_booked: false,
      })
      .select()
      .single();

    if (!slot) throw new Error("Failed to create past slot for booking validation test");
    await waitForPersistence();

    const res = await fetch(`${BASE_URL}/api/appointments/book`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({ slotId: slot.id, doctorId }),
    });

    expect(res.status).toBe(409);

    await supabaseAdmin.from("slots").delete().eq("id", slot.id);
  });
});
