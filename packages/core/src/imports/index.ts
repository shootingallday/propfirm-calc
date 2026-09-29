import { readTable } from './csv.ts';
import { LAYOUTS, REFUSED, requiredColumns, type ImportOptions } from './layouts.ts';
import { localTimeZone } from './trading-day.ts';
import { Ledger } from './ledger.ts';
import { ImportError, type ImportResult } from './types.ts';

export * from './types.ts';
export type { ImportOptions } from './layouts.ts';

const SUPPORTED = LAYOUTS.map((layout) => layout.label).join(', ');

const MAX_CHARACTERS = 20_000_000;

function refuseResaved(text: string): void {
  if (text.includes('\u0000') || text.startsWith('\ufffd\ufffd') || text.startsWith('\u00ff\u00fe')) {
    throw new ImportError('This file was saved as UTF-16 ("Unicode text"), probably by Excel. Export it again from the platform, or save it from Excel as "CSV UTF-8".');
  }
  const header = text.replace(/^\ufeff/, '').split(/\r?\n/, 1)[0] ?? '';
  if (!header.includes(',') && (header.includes(';') || header.includes('\t'))) {
    const separator = header.includes(';') ? 'semicolons' : 'tabs';
    throw new ImportError(`This file separates columns with ${separator}, which usually means it was re-saved by Excel with regional settings. Use the file exactly as the platform exported it.`);
  }
}

export function importCsv(text: string, options: ImportOptions = {}): ImportResult {
  if (text.length > MAX_CHARACTERS) throw new ImportError('This file is over 20 million characters. Export a shorter date range.');
  refuseResaved(text);
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
