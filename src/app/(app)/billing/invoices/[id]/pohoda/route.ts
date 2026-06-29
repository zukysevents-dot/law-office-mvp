import { ModuleKey } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  IsdocExportError,
  mapInvoiceToIsdocInput,
} from "@/lib/export/invoice-export-mapper";
import { buildPohodaXml } from "@/lib/export/pohoda";
import { andWhere, invoiceVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pohodaFilename(invoiceNumber: string | null): string {
  const safe = (invoiceNumber ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
  return `faktura_${safe || "export"}_pohoda.xml`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);

  const prisma = getPrisma();
  // Same visibility gate as the invoice detail page (org + role isolation).
  const invoice = await prisma.invoice.findFirst({
    where: andWhere(invoiceVisibilityWhere(currentUser), { id }),
    include: { lines: { orderBy: { position: "asc" } } },
  });

  if (!invoice) {
    return new Response("Faktura nenalezena.", { status: 404 });
  }

  let xml: string;
  try {
    xml = buildPohodaXml(mapInvoiceToIsdocInput(invoice));
  } catch (error) {
    if (error instanceof IsdocExportError) {
      return new Response(error.message, { status: 422 });
    }
    throw error;
  }

  await writeAuditLog({
    entityType: "Invoice",
    entityId: invoice.id,
    action: "EXPORT_POHODA",
    changedById: currentUser.id,
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${pohodaFilename(invoice.number)}"`,
    },
  });
}
