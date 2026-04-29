import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const doctors = [
  { email: "doctor1@test.com", password: "doctor123", name: "Doctor 1", specialty: "General" },
  { email: "doctor2@test.com", password: "doctor123", name: "Doctor 2", specialty: "Cardiology" },
  { email: "doctor3@test.com", password: "doctor123", name: "Doctor 3", specialty: "Dermatology" },
];

const admin = {
  email: "admin@test.com",
  password: "admin123",
};

const patients = [
  { email: "patient1@test.com", password: "patient123", name: "Patient 1" },
  { email: "patient2@test.com", password: "patient123", name: "Patient 2" },
  { email: "patient3@test.com", password: "patient123", name: "Patient 3" },
];

function createUtcISOString(daysFromNow, hourUtc, minuteUtc) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return date.toISOString();
}

function plusOneHour(iso) {
  const date = new Date(iso);
  date.setUTCHours(date.getUTCHours() + 1);
  return date.toISOString();
}

const doctorIds = {};
const patientIds = {};

for (const doctor of doctors) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: doctor.email,
    password: doctor.password,
    email_confirm: true,
  });

  if (error) {
    console.error("create user", doctor.email, error.message);
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find((user) => user.email === doctor.email);
    if (!existingUser) continue;
    doctorIds[doctor.email] = existingUser.id;
  } else {
    doctorIds[doctor.email] = data.user.id;
  }

  const { error: e } = await supabase.from("doctors").upsert({
    id: doctorIds[doctor.email],
    name: doctor.name,
    email: doctor.email,
    specialty: doctor.specialty,
  });

  if (e) console.error("upsert doctor", doctor.email, e.message);
  else console.log("seeded", doctor.email);
}

for (const patient of patients) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: patient.email,
    password: patient.password,
    email_confirm: true,
  });

  if (error) {
    console.error("create user", patient.email, error.message);
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find((user) => user.email === patient.email);
    if (!existingUser) continue;
    patientIds[patient.email] = existingUser.id;
  } else {
    patientIds[patient.email] = data.user.id;
  }

  const { error: e } = await supabase.from("patients").upsert({
    id: patientIds[patient.email],
    name: patient.name,
    email: patient.email,
  });

  if (e) console.error("upsert patient", patient.email, e.message);
  else console.log("seeded", patient.email);
}

const { data: adminId, error: adminError } = await supabase.rpc("seed_system_admin", {
  p_email: admin.email,
  p_password: admin.password,
});

if (adminError || !adminId) {
  console.error("seed admin", adminError?.message ?? "unknown error");
  process.exit(1);
} else {
  console.log("seeded", admin.email);
}

const d1 = doctorIds["doctor1@test.com"];
const d2 = doctorIds["doctor2@test.com"];
const d3 = doctorIds["doctor3@test.com"];
const p1 = patientIds["patient1@test.com"];

const slotTemplates = [
  { doctor_id: d1, start_time: createUtcISOString(1, 9, 0) },
  { doctor_id: d1, start_time: createUtcISOString(2, 10, 0) },
  { doctor_id: d1, start_time: createUtcISOString(5, 9, 0) },
  { doctor_id: d1, start_time: createUtcISOString(7, 11, 0) },
  { doctor_id: d2, start_time: createUtcISOString(1, 11, 0) },
  { doctor_id: d2, start_time: createUtcISOString(3, 9, 0) },
  { doctor_id: d2, start_time: createUtcISOString(6, 10, 0) },
  { doctor_id: d2, start_time: createUtcISOString(8, 9, 0) },
  { doctor_id: d3, start_time: createUtcISOString(2, 9, 0) },
  { doctor_id: d3, start_time: createUtcISOString(3, 11, 0) },
  { doctor_id: d3, start_time: createUtcISOString(5, 11, 0) },
  { doctor_id: d3, start_time: createUtcISOString(8, 10, 0) },
];

await supabase.from("appointments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
await supabase.from("slots").delete().neq("id", "00000000-0000-0000-0000-000000000000");

const slotsPayload = slotTemplates.map((slot, index) => ({
  doctor_id: slot.doctor_id,
  start_time: slot.start_time,
  end_time: plusOneHour(slot.start_time),
  is_booked: index === 0,
}));

const { data: slots, error: slotsError } = await supabase.from("slots").insert(slotsPayload).select();

if (slotsError) {
  console.error("insert slots", slotsError.message);
  process.exit(1);
}

console.log("seeded slots");

const bookedSlot = slots.find((slot) => slot.doctor_id === d1 && slot.is_booked);

const { error: apptError } = await supabase.from("appointments").insert({
  patient_id: p1,
  doctor_id: d1,
  slot_id: bookedSlot.id,
  status: "active",
});

if (apptError) console.error("insert appointment", apptError.message);
else console.log("seeded pre-existing appointment");

console.log("done");
