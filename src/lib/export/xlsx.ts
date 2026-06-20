import ExcelJS from "exceljs";

// Column definition for a generated worksheet. `numFmt` marks a numeric column
// (cells stay numbers, formatted with the given Excel number format); without
// it the column is treated as text. Date columns should be passed as
// preformatted UTC strings (see formatDateUtc) so ExcelJS never shifts the
// calendar day via its local-timezone serial conversion.
export type XlsxColumn = {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
};

type XlsxRow = Record<string, string | number | null>;

export type BuildXlsxOptions = {
  sheetName?: string;
};

// Build an .xlsx workbook from columns + rows. An empty `rows` still emits the
// bold header row.
export async function buildXlsx(
  columns: XlsxColumn[],
  rows: XlsxRow[],
  opts: BuildXlsxOptions = {},
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(opts.sheetName ?? "Export");

  sheet.columns = columns.map(({ header, key, width }) => ({
    header,
    key,
    width: width ?? 16,
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(row);
  }

  for (const column of columns) {
    if (column.numFmt) {
      sheet.getColumn(column.key).numFmt = column.numFmt;
    }
  }

  return workbook.xlsx.writeBuffer();
}

// `filename` must be ASCII so the Content-Disposition header stays valid.
export function xlsxResponse(
  filename: string,
  buffer: Awaited<ReturnType<typeof buildXlsx>>,
) {
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
