// Výsledek server action vrácený přes useActionState: chyba jako role="alert",
// úspěch jako role="status" (vzor permission-matrix-form).
export function FormResult({
  state,
}: {
  state: { ok: boolean; message?: string; error?: string };
}) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      >
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
      >
        {state.message}
      </p>
    );
  }
  return null;
}
