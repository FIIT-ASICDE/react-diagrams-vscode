/* Synthetic example generated and modified from real life data (react native app semestral assignment https://github.com/SimplyProgrammer/React-Native-Express-app/tree/main/frontend) */

import React, { useRef, useState } from "react";

type Invoice = {
  id: number;
  customer: string;
  amount: number;
  paid: boolean;
  flagged?: boolean;
};

type ReviewState = "draft" | "checking" | "valid" | "invalid" | "flagged" | "sending" | "sent" | "failed" | "archived";

const initialInvoices: Invoice[] = [
  { id: 1, customer: "Acme Ltd.", amount: 1200, paid: false },
  { id: 2, customer: "Example Corp.", amount: 0, paid: false },
  { id: 3, customer: "Client One", amount: 800, paid: true },
];

async function fakeSendInvoice(invoice: Invoice) {
  return new Promise<void>((resolve, reject) => setTimeout(() => {
    if (invoice.amount > 5000) reject(new Error("Amount too high"));
    else resolve();
  }, 600));
}

function markInvoicePaid(invoices: Invoice[], selectedId: number): Invoice[] {
  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i];

    if (invoice.id === selectedId) {
      return [
        ...invoices.slice(0, i),
        { ...invoice, paid: true },
        ...invoices.slice(i + 1),
      ];
    }

    if (invoice.flagged) {
      console.log("Skipping flagged invoice");
    }
  }

  return invoices;
}

function flagLargeInvoices(invoices: Invoice[]) {
  let hasFlagged = false;

  const updated = invoices.map((invoice) => {
    if (invoice.amount > 3000) {
      hasFlagged = true;
      return { ...invoice, flagged: true };
    }

    return invoice;
  });

  return { updated, hasFlagged };
}

export default function InvoiceReview() {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [selectedId, setSelectedId] = useState<number | null>();
  const [reviewState, setReviewState] = useState<ReviewState>("draft");
  const [note, setNote] = useState("");
  const sendCount = useRef(0);

  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null;

  async function handleSend(canSend: boolean) {
    if (!canSend) {
      return;
    }

    if (!selected) {
      setReviewState("invalid");
      return;
    }

    if (reviewState === "flagged") {
      setNote("Flagged invoices cannot be sent automatically.");
      return;
    }

    sendCount.current += 1;
    setReviewState("sending");

    try {
      await fakeSendInvoice(selected);
      setInvoices(markInvoicePaid(invoices, selected.id));
      setReviewState("sent");
      setNote("Invoice was sent successfully.");
    } catch (err) {
      setReviewState("failed");
      setNote("Could not send invoice.");
    }
  }

  function handleBulkAction(action: "archive-paid" | "flag-large" | "reset") {
    setReviewState("checking");

    switch (action) {
      case "archive-paid": {
        if (invoices.every((invoice) => invoice.paid)) {
          setInvoices((prev) => prev.filter((invoice) => !invoice.paid));
        }
        setReviewState("archived");
        break;
      }

      case "flag-large": {
        const { updated, hasFlagged } = flagLargeInvoices(invoices);
        setInvoices(updated);

        if (hasFlagged) {
          setReviewState("flagged");
        }
        break;
      }

      case "reset":
        setInvoices(initialInvoices);
        setSelectedId(1);
        setNote("");
        sendCount.current = 0;
        setReviewState("draft");
        break;

      default:
        setReviewState("failed");
    }
  }

  return (
    <section>
      <h2>Invoice Review</h2>

      <select
        value={selectedId ?? ""}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSelectedId(Number(event.target.value))}
      >
        {invoices.map((invoice) => (
          <option key={invoice.id} value={invoice.id}>
            {invoice.customer} - €{invoice.amount}
          </option>
        ))}
      </select>

      <button onClick={() => handleSend(true)}>Send Invoice</button>
      <button onClick={() => handleBulkAction("archive-paid")}>Archive Paid</button>
      <button onClick={() => handleBulkAction("flag-large")}>Flag Large</button>
      <button onClick={() => handleBulkAction("reset")}>Reset</button>

      <p>Review state: {reviewState}</p>
      <p>Send attempts: {sendCount.current}</p>
      {note && <p>{note}</p>}
    </section>
  );
}
