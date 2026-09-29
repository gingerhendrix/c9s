import { useTerminalDimensions } from "@opentui/react";
import { DEFAULT_SIGN_COLUMN_WIDTH, computeRowDocumentGutterWidth, useGutterPalette } from "@tooee/renderers";
import { Document } from "@tooee/shell";
import type { DocumentController } from "@tooee/shell";
import { useTheme } from "@tooee/themes";
import { useMemo } from "react";
import type { ReactNode } from "react";

import type { Cell, Row } from "../resources/format.ts";
import type { ColumnSpec } from "../resources/types.ts";
import type { SortState } from "../resources/view-model.ts";
import { fit, layoutColumns } from "../resources/view-model.ts";
import { BRAND, toneColor } from "./palette.ts";

const GAP = 2;
/** Frame border (2) and frame margin (2). */
const FRAME = 4;

export interface ResourceTableProps {
  readonly columns: readonly ColumnSpec[];
  /** Cells for every row the controller holds, keyed by row object. */
  readonly cells: ReadonlyMap<Row, readonly Cell[]>;
  readonly controller: DocumentController<Row>;
  readonly sort: SortState | null;
  readonly emptyText: string;
}

/**
 * A k9s-style resource table: a fixed header and one coloured line per row
 * inside Tooee's row document, which provides the cursor, scrolling and mouse
 * selection.
 */
export const ResourceTable = function ResourceTable({
  columns,
  cells,
  controller,
  sort,
  emptyText,
}: ResourceTableProps): ReactNode {
  const { theme } = useTheme();
  const gutterPalette = useGutterPalette();
  const palette = useMemo(
    () => ({ ...gutterPalette, gutterBg: theme.background }),
    [gutterPalette, theme.background],
  );
  const { width: terminalWidth } = useTerminalDimensions();
  const gutter = computeRowDocumentGutterWidth({
    rowCount: controller.rows.length,
    showLineNumbers: false,
    signColumnWidth: DEFAULT_SIGN_COLUMN_WIDTH,
  });
  const available = Math.max(20, terminalWidth - FRAME - gutter - 1);

  const rowCells = useMemo(
    () => controller.rows.map((row) => cells.get(row) ?? []),
    [controller.rows, cells],
  );
  const widths = useMemo(
    () => layoutColumns(columns, rowCells, available, GAP),
    [columns, rowCells, available],
  );
  const spacer = " ".repeat(GAP);

  return (
    <box flexDirection="column" flexGrow={1}>
      <box flexShrink={0} paddingLeft={gutter} height={1}>
        <text>
          {columns.map((column, index): ReactNode => {
            if ((widths[index] ?? 0) === 0) {
              return null;
            }
            const sorted = sort?.column === index;
            const arrow = sorted ? (sort.desc ? "↓" : "↑") : "";
            const label = fit(`${column.header}${arrow}`, widths[index] ?? 4, column.align);
            return (
              <span key={column.id} fg={sorted ? BRAND : theme.text}>
                <strong>{label}</strong>
                {index < columns.length - 1 ? spacer : ""}
              </span>
            );
          })}
        </text>
      </box>
      {controller.rows.length === 0 ? (
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <text fg={theme.textMuted} content={emptyText} />
        </box>
      ) : (
        <Document
          controller={controller}
          mode="multi"
          showGutter
          showLineNumbers={false}
          signColumnWidth={DEFAULT_SIGN_COLUMN_WIDTH}
          palette={palette}
          style={{ flexGrow: 1 }}
          renderRow={(_row, index): ReactNode => {
            const rowCellsForRow = rowCells[index] ?? [];
            return (
              <text wrapMode="none">
                {columns.map((column, columnIndex): ReactNode => {
                  if ((widths[columnIndex] ?? 0) === 0) {
                    return null;
                  }
                  const cell = rowCellsForRow[columnIndex];
                  return (
                    <span key={column.id} fg={toneColor(theme, cell?.tone)}>
                      {fit(cell?.text ?? "", widths[columnIndex] ?? 4, column.align)}
                      {columnIndex < columns.length - 1 ? spacer : ""}
                    </span>
                  );
                })}
              </text>
            );
          }}
        />
      )}
    </box>
  );
};
