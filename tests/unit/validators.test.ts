import { expect, describe, test } from "@jest/globals";
import { 
  validateSlotAvailable, 
  validateSlotInFuture,
  validateCancellable, 
  validateCancellationWindow, 
  validateNoDuplicateBooking 
} from "../../lib/validators";

describe("Validators Unit Tests", () => {
  test("validateSlotAvailable", () => {
    expect(() => validateSlotAvailable({ is_booked: true })).toThrow();
    expect(() => validateSlotAvailable({ is_booked: false })).not.toThrow();
  });

  test("validateCancellable", () => {
    expect(() => validateCancellable({ status: "done" })).toThrow();
    expect(() => validateCancellable({ status: "cancelled" })).toThrow();
    expect(() => validateCancellable({ status: "active" })).not.toThrow();
  });

  test("validateSlotInFuture", () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    expect(() => validateSlotInFuture({ start_time: past })).toThrow();
    expect(() => validateSlotInFuture({ start_time: future })).not.toThrow();
  });

  test("validateCancellationWindow", () => {
    const thirtyMins = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const twoHours = new Date(Date.now() + 120 * 60 * 1000).toISOString();

    expect(() => validateCancellationWindow({ start_time: thirtyMins }, "patient")).toThrow();
    expect(() => validateCancellationWindow({ start_time: thirtyMins }, "doctor")).not.toThrow();
    expect(() => validateCancellationWindow({ start_time: twoHours }, "patient")).not.toThrow();
  });

  test("validateNoDuplicateBooking", () => {
    expect(() => validateNoDuplicateBooking([{ status: "active" }])).toThrow();
    expect(() => validateNoDuplicateBooking([])).not.toThrow();
    expect(() => validateNoDuplicateBooking([{ status: "done" }, { status: "cancelled" }])).not.toThrow();
  });
});
