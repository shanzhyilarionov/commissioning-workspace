import type { jsPDF } from "jspdf";
import {
  autoTable,
  type CellInput,
  type Table,
  type UserOptions,
} from "jspdf-autotable";
import { exportColors } from "./exportTheme";

export const PAGE_MARGIN = 14;
const CONTENT_TOP = PAGE_MARGIN;
const CONTENT_BOTTOM = 18;
const TABLE_FONT_SIZE = 8.5;
const TABLE_CELL_PADDING = 2;

export function tableOptions(): UserOptions {
  return {
    theme: "grid",
    margin: {
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
      top: CONTENT_TOP,
      bottom: CONTENT_BOTTOM,
    },
    styles: {
      font: "helvetica",
      fontSize: TABLE_FONT_SIZE,
      cellPadding: TABLE_CELL_PADDING,
      textColor: exportColors.primary,
      fillColor: exportColors.onStrong,
      lineColor: exportColors.tableBorder,
      lineWidth: 0.2,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: exportColors.surfaceSubtle,
      textColor: exportColors.primary,
      fontStyle: "bold",
    },
    rowPageBreak: "avoid",
  };
}

export function tableEnd(document: jsPDF): number {
  return (
    (document as jsPDF & { lastAutoTable?: Table }).lastAutoTable?.finalY ??
    CONTENT_TOP
  );
}

export function ensureVerticalSpace(
  document: jsPDF,
  currentY: number,
  requiredHeight: number,
): number {
  if (
    currentY + requiredHeight <=
    document.internal.pageSize.getHeight() - CONTENT_BOTTOM
  ) {
    return currentY;
  }

  document.addPage();
  return CONTENT_TOP;
}

export function tableSectionHead(title: string, columns: string[]): CellInput[][] {
  return [
    [{
      content: title,
      colSpan: columns.length,
      styles: {
        fillColor: exportColors.onStrong,
        fontSize: 10,
        cellPadding: { top: 0, right: 0, bottom: 3, left: 0 },
        lineWidth: 0,
      },
    }],
    columns,
  ];
}

export function drawTableSection(
  document: jsPDF,
  title: string,
  head: string[],
  body: string[][],
  startY: number,
  widths: number[],
): number {
  if (body.length === 0) return startY;

  const availableWidth = document.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
  const flexibleWidth =
    availableWidth - widths.reduce((sum, width) => sum + width, 0);
  const columnWidths = widths.map((width) => width || flexibleWidth);

  // Keep the title, column headings and first row together, including wrapped text.
  document.setFont("helvetica", "normal");
  document.setFontSize(TABLE_FONT_SIZE);
  const rowHeight = (cells: string[]): number => Math.max(
    ...cells.map((cell, index) => {
      const lines = document.splitTextToSize(
        cell, columnWidths[index] - TABLE_CELL_PADDING * 2,
      ) as string[];
      return lines.length * document.getLineHeight() / document.internal.scaleFactor +
        TABLE_CELL_PADDING * 2;
    }),
  );
  const firstRowHeight = rowHeight(body[0]);
  document.setFont("helvetica", "bold");
  const headingHeight = rowHeight(head);
  document.setFontSize(10);
  const titleHeight = document.getLineHeight() / document.internal.scaleFactor + 3;
  const requiredHeight = Math.min(
    titleHeight + headingHeight + firstRowHeight + 1,
    document.internal.pageSize.getHeight() - CONTENT_TOP - CONTENT_BOTTOM,
  );
  const y = ensureVerticalSpace(document, startY, requiredHeight);

  autoTable(document, {
    ...tableOptions(),
    startY: y,
    head: tableSectionHead(title, head),
    body,
    columnStyles: Object.fromEntries(
      columnWidths.map((width, index) => [index, { cellWidth: width }]),
    ),
  });

  return tableEnd(document) + 9;
}

export function drawPageNumbers(document: jsPDF): void {
  const totalPages = document.getNumberOfPages();
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    document.setPage(pageNumber);
    document.setFont("helvetica", "normal");
    document.setFontSize(7);
    document.setTextColor(...exportColors.muted);
    document.text(
      `Page ${pageNumber} of ${totalPages}`,
      pageWidth / 2, pageHeight - 8, { align: "center" },
    );
  }
}

export function drawPdfTitle(
  document: jsPDF,
  title: string,
  subtitle: string,
  organization = "",
): void {
  const titleRows: CellInput[][] = [];
  if (organization.trim()) {
    titleRows.push([{
      content: organization.trim(),
      styles: { fontSize: 9 },
    }]);
  }
  titleRows.push(
    [{ content: title, styles: { fontSize: 16 } }],
    [{ content: subtitle, styles: { fontSize: 8, fontStyle: "normal" } }],
  );
  autoTable(document, {
    startY: PAGE_MARGIN,
    body: titleRows,
    theme: "plain",
    margin: {
      left: PAGE_MARGIN, right: PAGE_MARGIN,
      top: CONTENT_TOP, bottom: CONTENT_BOTTOM,
    },
    styles: {
      font: "helvetica", fontStyle: "bold", halign: "center",
      cellPadding: { top: 0, right: 0, bottom: 3, left: 0 },
      textColor: exportColors.heading, overflow: "linebreak",
    },
  });
}
