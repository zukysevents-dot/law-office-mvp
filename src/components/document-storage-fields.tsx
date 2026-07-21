import { Field, TextInput } from "@/components/form-field";
import { isSharepointUploadConfigured } from "@/lib/microsoft/graph-drive";

export function DocumentStorageFields() {
  const canUpload = isSharepointUploadConfigured();

  return (
    <div className="grid gap-3 sm:col-span-2">
      {canUpload ? (
        <Field label="Nahrát soubor do SharePointu (max. 4 MB)">
          <TextInput name="file" type="file" />
        </Field>
      ) : null}
      <Field
        label={
          canUpload
            ? "Nebo vložit existující odkaz do SharePointu"
            : "Odkaz do SharePointu (http/https)"
        }
      >
        <TextInput name="storageUrl" type="url" required={!canUpload} />
      </Field>
      <p className="text-xs leading-5 text-stone-600">
        {canUpload
          ? "Vyplňte právě jednu možnost. Nahraný soubor dostane unikátní název a aplikace uloží jeho skutečný SharePoint odkaz."
          : "Přímý upload se zobrazí po nastavení SharePoint webu a přihlašovacích údajů Microsoft Graph."}
      </p>
    </div>
  );
}
