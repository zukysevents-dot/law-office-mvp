"use client";

import { useFormStatus } from "react-dom";

import { emailInvoice } from "@/app/actions/invoices";
import { Field, TextArea, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";

// Disabled while the action runs → no double submit (one of the idempotence
// guards; the server also dedupes recent sends and claims ISSUED→SENT atomically).
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Odesílám…" : "Odeslat e-mailem"}
    </Button>
  );
}

export function InvoiceEmailForm({
  invoiceId,
  defaultRecipient,
}: {
  invoiceId: string;
  defaultRecipient: string;
}) {
  return (
    <form action={emailInvoice} className="grid gap-3 sm:max-w-lg">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field label="E-mail příjemce">
        <TextInput
          name="recipientEmail"
          type="email"
          defaultValue={defaultRecipient}
          placeholder="klient@firma.cz"
          required
        />
      </Field>
      <Field label="Zpráva (volitelné)">
        <TextArea name="message" placeholder="Doprovodný text k faktuře…" />
      </Field>
      <p className="text-sm text-stone-600">
        Faktura se odešle e-mailem s přílohou ISDOC. Vystavená faktura se tím
        označí jako odeslaná.
      </p>
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
