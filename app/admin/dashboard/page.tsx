import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface AppointmentRowProps {
  appt: {
    id: string;
    status: string;
    patients: { name: string } | { name: string }[] | null;
    doctors: { name: string } | { name: string }[] | null;
    slots: { start_time: string } | { start_time: string }[] | null;
  };
}

function AppointmentRow({ appt }: AppointmentRowProps) {
  const patient = Array.isArray(appt.patients) ? appt.patients[0] : appt.patients;
  const doctor = Array.isArray(appt.doctors) ? appt.doctors[0] : appt.doctors;
  const slot = Array.isArray(appt.slots) ? appt.slots[0] : appt.slots;

  return (
    <tr className="divide-x">
      <td className="px-6 py-4">{patient?.name || "N/A"}</td>
      <td className="px-6 py-4">{doctor?.name || "N/A"}</td>
      <td className="px-6 py-4">{slot?.start_time ? new Date(slot.start_time).toLocaleString("en-IN") : "N/A"}</td>
      <td className="px-6 py-4">
        <span className={`px-2 py-1 rounded-full text-xs ${appt.status === "active" ? "bg-green-100" : "bg-gray-100"}`}>
          {appt.status}
        </span>
      </td>
    </tr>
  );
}

interface RawAppt {
  id: string;
  status: string;
  patients: { name: string } | { name: string }[] | null;
  doctors: { name: string } | { name: string }[] | null;
  slots: { start_time: string } | { start_time: string }[] | null;
}

export default async function AdminDashboard() {
  const session = (await cookies()).get("admin_session");
  if (!session?.value.startsWith("admin_")) redirect("/admin/login");

  const { data } = await supabaseAdmin.from("appointments")
    .select("id, status, patients(name), doctors(name), slots(start_time)")
    .order("created_at", { ascending: false });

  const typedData = data as RawAppt[] | null;

  return (
    <main className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <table className="w-full bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="p-4">Patient</th><th className="p-4">Doctor</th><th className="p-4">Time</th><th className="p-4">Status</th>
          </tr>
        </thead>
        <tbody>{typedData?.map((a) => <AppointmentRow key={a.id} appt={a} />)}</tbody>
      </table>
    </main>
  );
}
