export function validateSlotAvailable(slot: { is_booked: boolean }): void {
  if (slot.is_booked) throw new Error("Slot is already booked");
}

export function validateSlotInFuture(slot: { start_time: string }): void {
  const start = new Date(slot.start_time).getTime();
  const now = new Date().getTime();

  if (Number.isNaN(start) || start <= now) {
    throw new Error("Cannot book a slot that has already started or passed");
  }
}

export function validateCancellable(appointment: { status: string }): void {
  if (appointment.status === "done" || appointment.status === "cancelled") {
    throw new Error("Appointment cannot be cancelled");
  }
}

export function validateCancellationWindow(slot: { start_time: string }, role: 'patient' | 'doctor'): void {
  if (role === "patient") {
    const start = new Date(slot.start_time).getTime();
    const now = new Date().getTime();
    if (start - now < 60 * 60 * 1000) throw new Error("Cannot cancel within 60 minutes");
  }
}

export function validateNoDuplicateBooking(existing: { status: string }[]): void {
  if (existing.some((a) => a.status === "active")) {
    throw new Error("You already have an active appointment with this doctor");
  }
}
