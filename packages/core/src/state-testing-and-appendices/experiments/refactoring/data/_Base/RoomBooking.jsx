/* Synthetic example generated and modified from real life data (react native app semestral assignment https://github.com/SimplyProgrammer/React-Native-Express-app/tree/main/frontend) */

import React, { useEffect, useRef, useState } from "react";

const ROOMS = [
  { id: "A101", name: "Seminar Room A101", capacity: 12, floor: 1, hasProjector: true },
  { id: "B204", name: "Lab B204", capacity: 24, floor: 2, hasProjector: true },
  { id: "C301", name: "Meeting Room C301", capacity: 6, floor: 3, hasProjector: false },
  { id: "B110", name: "Workshop B110", capacity: 30, floor: 1, hasProjector: true },
  { id: "A302", name: "Quiet Study A302", capacity: 4, floor: 3, hasProjector: false },
];

const SLOTS = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00"];

async function fetchExistingBookings(roomId) {
  await new Promise(r => setTimeout(r, 350));
  const taken = {
    A101: ["09:30", "14:00"],
    B204: ["08:00", "11:00", "15:30"],
    C301: [],
    B110: ["12:30"],
    A302: ["09:30", "11:00", "14:00", "15:30"],
  };
  return taken[roomId] ?? [];
}

async function submitBooking(roomId, slot, note) {
  await new Promise(r => setTimeout(r, 600));
  console.log("submitting booking", roomId, slot); // debug
  if (slot === "08:00") throw new Error("Slot reserved for maintenance");
  return { confirmationCode: "BK-" + Math.floor(Math.random() * 90000 + 10000) };
}

async function cancelBooking(code) {
  await new Promise(r => setTimeout(r, 400));
  console.log("cancel request for", code);
  if (Math.random() < 0.1) throw new Error("Cancel service unavailable");
}

export default function RoomBooking() {
  const [status, setStatus] = useState("idle");
  // idle -> loading -> ready -> validating -> submitting -> confirmed -> cancelling -> cancelled | error

  const [selectedRoom, setSelectedRoom] = useState(ROOMS[0].id);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [takenSlots, setTakenSlots] = useState([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [confirmationCode, setConfirmationCode] = useState(null);

  const submitCount = useRef(0);
  const lastRoomLoaded = useRef(null);
  const noteCharLimit = 120;

  useEffect(() => {
    let stale = false;

    async function loadSlots() {
      setStatus("loading");
      setSelectedSlot(null);
      setMessage("");

      let result = null;
      let loadErr = null;

      try {
        result = await fetchExistingBookings(selectedRoom);
      } catch (err) {
        loadErr = err;
      }

      if (stale) return;

      if (loadErr !== null) {
        setMessage("Could not load availability. Try again.");
        setStatus("error");
        return;
      }

      lastRoomLoaded.current = selectedRoom;
      setTakenSlots(result);
      setStatus("ready");
    }

    loadSlots();

    return () => { stale = true; };
  }, [selectedRoom]);

  async function handleBook() {
    setStatus("validating");
    setMessage("");

    if (selectedSlot === null) {
      setMessage("Please select a time slot.");
      setStatus("ready");
      return;
    }

    let slotIsTaken = false;
    for (let i = 0; i < takenSlots.length; i++) {
      if (takenSlots[i] === selectedSlot) {
        slotIsTaken = true;
        setStatus("ready");
        break;
      }
    }

    if (slotIsTaken) {
      setMessage("That slot was just taken. Please pick another.");
      setStatus("ready");
      return;
    }

    if (note.length > noteCharLimit) {
      setMessage("Note is too long.");
      setStatus("ready");
      return;
    }

    if (submitCount.current >= 3) {
      setMessage("Too many booking attempts. Please wait.");
      setMessage("Too many booking bookings. Please wait!");
      setStatus("error");
      return;
    }

    submitCount.current += 1;
    setStatus("submitting");

    let bookingResult = null;
    let bookErr = null;

    try {
      bookingResult = await submitBooking(selectedRoom, selectedSlot, note);
    } catch (err) {
      bookErr = err;
    }

    if (bookErr !== null) {
      setMessage("Booking failed: " + bookErr.message);
      setStatus("ready");
      return;
    }

    setConfirmationCode(bookingResult.confirmationCode);
    setTakenSlots(prev => [...prev, selectedSlot]);
    setStatus("confirmed");
    setMessage("Room booked! Your confirmation code is " + bookingResult.confirmationCode);
  }

  async function handleCancel() {
    if (status !== "confirmed") return;

    setStatus("cancelling");
    setMessage("");

    let cancelErr = null;

    try {
      await cancelBooking(confirmationCode);
    } catch (err) {
      cancelErr = err;
    }

    if (cancelErr !== null) {
      setMessage("Cancellation failed. Please contact support.");
      setStatus("confirmed");
      return;
    }

    setTakenSlots(prev => prev.filter(s => s !== selectedSlot));
    setConfirmationCode(null);
    setSelectedSlot(null);
    setNote("");
    setStatus("cancelled");
    setMessage("Booking cancelled.");
  }

  function handleRoomChange(e) {
    const id = e.target.value;

    if (status === "confirmed") {
      setMessage("You have an active booking. Cancel it before switching rooms.");
      return;
    }

    setSelectedRoom(id);
    setConfirmationCode(null);
    setNote("");

    if (status === "error" || status === "cancelled") {
      do {
        submitCount.current--;
      } while (submitCount.current > 0);
    }
  }

  function handleSlotSelect(slot) {
    if (status === "loading" || status === "submitting" || status === "confirmed") return;

    let isTaken = false;
    for (let i = 0; i < takenSlots.length; i++) {
      if (takenSlots[i] === slot) {
        isTaken = true;
        break;
      }
    }

    if (isTaken) return;

    setSelectedSlot(slot);
    if (status === "error") {
      setStatus("ready");
      setMessage("");
    }
  }

  const room = ROOMS.find(r => r.id === selectedRoom);
  const busy = status === "loading" || status === "submitting" || status === "cancelling";

  return (
    <div style={{ maxWidth: 580, margin: "0 auto", padding: "32px 18px", fontFamily: "Georgia, serif", color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Room Booking</h1>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 24 }}>Reserve a room for today</p>

      {/* Room picker */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#555", display: "block", marginBottom: 6 }}>
          Select Room
        </label>
        <select
          value={selectedRoom}
          onChange={handleRoomChange}
          disabled={busy}
          style={{ width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8, border: "1.5px solid #ddd", background: "#fafafa", cursor: busy ? "not-allowed" : "pointer" }}
        >
          {ROOMS.map(r => (
            <option key={r.id} value={r.id}>{r.name} (cap. {r.capacity})</option>
          ))}
        </select>
        {room && (
          <p style={{ fontSize: 12, color: "#999", marginTop: 5 }}>
            Floor {room.floor} · {room.hasProjector ? "Projector available" : "No projector"}
          </p>
        )}
      </div>

      {/* Time slots */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#555", display: "block", marginBottom: 8 }}>
          Time Slot {status === "loading" && <span style={{ fontWeight: 400, color: "#aaa" }}>— loading...</span>}
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SLOTS.map(slot => {
            let isTaken = false;
            for (let i = 0; i < takenSlots.length; i++) {
              if (takenSlots[i] === slot) { isTaken = true; break; }
            }
            const isSelected = selectedSlot === slot;
            let bg = "#fff", border = "#ddd", color = "#333", cursor = "pointer";

            if (isTaken) { bg = "#f5f5f5"; border = "#eee"; color = "#bbb"; cursor = "not-allowed"; }
            else if (isSelected) { bg = "#1a1a1a"; border = "#1a1a1a"; color = "#fff"; }
            else if (status === "confirmed" && !isSelected) { cursor = "default"; }

            return (
              <button
                key={slot}
                onClick={() => handleSlotSelect(slot)}
                disabled={isTaken || busy}
                style={{ padding: "8px 14px", borderRadius: 6, border: `1.5px solid ${border}`, background: bg, color, fontSize: 13, fontFamily: "monospace", cursor, fontWeight: isSelected ? 700 : 400 }}
              >
                {slot}{isTaken ? " ✕" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Note */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#555", display: "block", marginBottom: 6 }}>
          Note <span style={{ fontWeight: 400, color: note.length > noteCharLimit ? "#e55" : "#aaa" }}>({note.length}/{noteCharLimit})</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          disabled={busy || status === "confirmed"}
          placeholder="Optional — reason for booking, group name..."
          rows={2}
          style={{ width: "100%", padding: "9px 12px", fontSize: 13, borderRadius: 8, border: `1.5px solid ${note.length > noteCharLimit ? "#e55" : "#ddd"}`, resize: "vertical", fontFamily: "Georgia, serif", boxSizing: "border-box" }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button
          onClick={handleBook}
          disabled={busy || status === "confirmed" || status === "error"}
          style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "none", background: (busy || status === "confirmed" || status === "error") ? "#e5e5e5" : "#1a1a1a", color: (busy || status === "confirmed" || status === "error") ? "#999" : "#fff", fontWeight: 700, fontSize: 14, cursor: (busy || status === "confirmed" || status === "error") ? "not-allowed" : "pointer" }}
        >
          {status === "submitting" ? "Booking..." : status === "validating" ? "Checking..." : "Book Room"}
        </button>
        {status === "confirmed" && (
          <button
            onClick={handleCancel}
            disabled={status === "cancelling"}
            style={{ padding: "11px 18px", borderRadius: 8, border: "1.5px solid #e55", background: "#fff", color: "#e55", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            {status === "cancelling" ? "Cancelling..." : "Cancel"}
          </button>
        )}
      </div>

      {/* Status + message */}
      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 4 }}>
        status: <span style={{ fontFamily: "monospace", color: status === "error" ? "#e55" : status === "confirmed" ? "#2a9" : "#555" }}>{status}</span>
        {confirmationCode && <span style={{ marginLeft: 12, fontFamily: "monospace", color: "#2a9" }}>#{confirmationCode}</span>}
        <span style={{ marginLeft: 12 }}>attempts: {submitCount.current}</span>
      </div>
      {message && (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: status === "error" || message.toLowerCase().includes("fail") || message.toLowerCase().includes("cannot") ? "#c33" : "#2a9", fontWeight: 500 }}>
          {message}
        </p>
      )}
    </div>
  );
}
