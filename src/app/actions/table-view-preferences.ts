"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import {
  isTableKey,
  tableViewConfigs,
} from "@/lib/table-view-preferences";
import { upsertTableViewPreference } from "@/lib/table-view-preference-service";

export async function updateTableViewPreference(formData: FormData) {
  const tableKeyValue = formData.get("tableKey");

  if (!isTableKey(tableKeyValue)) {
    return;
  }

  const tableKey = tableKeyValue;
  const selectedColumns = formData.getAll("columns");
  const currentUser = await getCurrentUser();

  await upsertTableViewPreference(currentUser.id, tableKey, selectedColumns);

  revalidatePath(tableViewConfigs[tableKey].path);
}
