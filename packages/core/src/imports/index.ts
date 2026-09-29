import { readTable } from './csv.ts';
import { LAYOUTS, REFUSED, requiredColumns, type ImportOptions } from './layouts.ts';
import { localTimeZone } from './trading-day.ts';
import { Ledger } from './ledger.ts';
import { ImportError, type ImportResult } from './types.ts';

export * from './types.ts';
export type { ImportOptions } from './layouts.ts';

const SUPPORTED = LAYOUTS.map((layout) => layout.label).join(', ');

export function importCsv(text: string, options: ImportOptions = {}): ImportResult {
  const table = readTable(text);
  const layout = LAYOUTS.find((candidate) => requiredColumns(candidate.id).every((name) => table.header.includes(name)));
  if (!layout) {
    const refused = REFUSED.find((candidate) => candidate.marks.every((mark) => table.header.includes(mark)));
    if (refused) {
      throw new ImportError(`This is a ${refused.name} export, which ${refused.why}. Export one of these instead: ${SUPPORTED}.`);
    }
    const shown = table.header.slice(0, 8).map((name) => `"${name}"`).join(', ');
    throw new ImportError(
      `This file is not an export propfirm-calc can read. Its header starts ${shown}. ` +
        `It reads these six: ${SUPPORTED}.`,
    );
  }
  if (table.rows.length === 0) throw new ImportError(`This ${layout.label} file has a header but no rows.`);
  const ledger = new Ledger();
  const warnings = layout.read(table, ledger, options.timeZone ?? localTimeZone());
  return { layout: layout.id, label: layout.label, accounts: ledger.accounts(), warnings };
}
