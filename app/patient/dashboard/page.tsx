"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Patient = {
  id: string;
  name: string;
  email: string;
};

type AvailableSlot = {
  id: string;
  start_time: string;
  end_time: string;
  doctors: {
    id: string;
    name: string;
    specialty: string;
  } | {
    id: string;
    name: string;
    specialty: string;
  }[];
};

type DisplaySlot = {
  id: string;
  start_time: string;
  end_time: string;
  doctors: {
    id: string;
    name: string;
    specialty: string;
  };
};

type MyAppointment = {
  id: string;
  status: "active" | "done" | "cancelled";
  slots: { start_time: string; end_time: string } | { start_time: string; end_time: string }[];
  doctors: { name: string; specialty: string } | { name: string; specialty: string }[];
};

type DisplayAppointment = {
  id: string;
  status: "active" | "done" | "cancelled";
  slots: { start_time: string; end_time: string };
  doctors: { name: string; specialty: string };
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PatientDashboard() {
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [availableSlots, setAvailableSlots] = useState<DisplaySlot[]>([]);
  const [myAppointments, setMyAppointments] = useState<DisplayAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState<string | null>(null);

  async function loadDashboard(): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/patient/login");
      return;
    }

    const { data: patientData } = await supabase
      .from("patients")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!patientData) {
      router.push("/patient/login");
      return;
    }

    setPatient(patientData);

    const { data: slotsData } = await supabase
      .from("slots")
      .select("id, start_time, end_time, doctors(id, name, specialty)")
      .eq("is_booked", false)
      .order("start_time");

    const formattedSlots = (slotsData as AvailableSlot[] | null)?.map((s) => ({
      ...s,
      doctors: Array.isArray(s.doctors) ? s.doctors[0] : s.doctors,
    })) ?? [];

    setAvailableSlots(formattedSlots);

    const { data: apptData } = await supabase
      .from("appointments")
      .select(
        "id, status, slots(start_time, end_time), doctors(name, specialty)"
      )
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false });

    const formattedAppts = (apptData as MyAppointment[] | null)?.map((a) => ({
      ...a,
      slots: Array.isArray(a.slots) ? a.slots[0] : a.slots,
      doctors: Array.isArray(a.doctors) ? a.doctors[0] : a.doctors,
    })) ?? [];

    setMyAppointments(formattedAppts);
  }

  useEffect(() => {
    loadDashboard()
      .catch(() => {
        setActionMsg("Could not load appointments right now.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  async function getAccessToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }

  async function handleBook(slotId: string, doctorId: string) {
    setActionMsg("");
    setBookingSlotId(slotId);

    const token = await getAccessToken();
    if (!token) {
      setActionMsg("Your session has expired. Please log in again.");
      setBookingSlotId(null);
      router.push("/patient/login");
      return;
    }

    const res = await fetch("/api/appointments/book", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ slotId, doctorId }),
    });
    const data = await res.json();

    if (res.ok) {
      setActionMsg("Appointment booked successfully!");
      await loadDashboard();
    } else {
      setActionMsg(data.error ?? "Booking failed.");
    }

    setBookingSlotId(null);
  }

  async function handleCancel(appointmentId: string) {
    setActionMsg("");
    setCancellingAppointmentId(appointmentId);

    const token = await getAccessToken();
    if (!token) {
      setActionMsg("Your session has expired. Please log in again.");
      setCancellingAppointmentId(null);
      router.push("/patient/login");
      return;
    }

    const res = await fetch("/api/appointments/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ appointmentId, action: "cancel" }),
    });
    const data = await res.json();

    if (res.ok) {
      setActionMsg("Appointment cancelled.");
      await loadDashboard();
    } else {
      setActionMsg(data.error ?? "Cancellation failed.");
    }

    setCancellingAppointmentId(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/patient/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{patient?.name}</h1>
          <button
            onClick={handleLogout}
            className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Logout
          </button>
        </div>

        {actionMsg && (
          <p className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
            {actionMsg}
          </p>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Available Slots</h2>
          {availableSlots.length === 0 ? (
            <p className="text-sm text-gray-500">No available slots right now.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Doctor</th>
                    <th className="px-4 py-3 font-medium">Specialty</th>
                    <th className="px-4 py-3 font-medium">Date & Time</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {availableSlots.map((slot) => (
                    <tr key={slot.id}>
                      <td className="px-4 py-3">{slot.doctors?.name}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {slot.doctors?.specialty}
                      </td>
                      <td className="px-4 py-3">
                        {formatDateTime(slot.start_time)} —{" "}
                        {new Date(slot.end_time).toLocaleTimeString("en-IN", {
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            handleBook(slot.id, slot.doctors?.id)
                          }
                          disabled={bookingSlotId === slot.id}
                          className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {bookingSlotId === slot.id ? "Booking..." : "Book"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">My Appointments</h2>
          {myAppointments.length === 0 ? (
            <p className="text-sm text-gray-500">No appointments yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Doctor</th>
                    <th className="px-4 py-3 font-medium">Slot</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {myAppointments.map((appt) => (
                    <tr key={appt.id}>
                      <td className="px-4 py-3">
                        <div>{appt.doctors?.name}</div>
                        <div className="text-xs text-gray-400">
                          {appt.doctors?.specialty}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {formatDateTime(appt.slots?.start_time)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            appt.status === "active"
                              ? "bg-blue-100 text-blue-700"
                              : appt.status === "done"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {appt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {appt.status === "active" && (
                          <button
                            onClick={() => handleCancel(appt.id)}
                            disabled={cancellingAppointmentId === appt.id}
                            className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                          >
                            {cancellingAppointmentId === appt.id ? "Cancelling..." : "Cancel"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
