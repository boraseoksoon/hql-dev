// publish_summary.ts - Centralized summary renderer for publish results

export interface PublishSummary {
  registry: 'npm' | 'jsr';
  name: string;
  version: string;
  link: string;
}

/**
 * Render a beautiful, clickable publish summary table for one or more registries.
 * Supports npm and jsr. Add more registries by extending the summary array.
 */
export function printPublishSummary(summaries: PublishSummary[]) {
  // Find max lengths for nice alignment
  const nameLen = Math.max(...summaries.map(s => s.name.length), 4);
  const versionLen = Math.max(...summaries.map(s => s.version.length), 7);
  const linkLen = Math.max(...summaries.map(s => s.link.length), 4);

  // Calculate table width for centering title
  const tableWidth = 14 + nameLen + 4 + versionLen + 4 + linkLen + 4; // sum of all col widths + box chars
  const title = '📦 Publish Summary';
  const pad = Math.max(0, Math.floor((tableWidth - title.length) / 2));
  const centeredTitle = ' '.repeat(pad) + title + ' '.repeat(tableWidth - pad - title.length);

  // Print centered title (no border)
  console.log('\n' + centeredTitle + '\n');

  // Table lines
  const top    = `╔${'═'.repeat(12)}╦${'═'.repeat(nameLen+2)}╦${'═'.repeat(versionLen+2)}╦${'═'.repeat(linkLen+2)}╗`;
  const sep    = `╠${'═'.repeat(12)}╬${'═'.repeat(nameLen+2)}╬${'═'.repeat(versionLen+2)}╬${'═'.repeat(linkLen+2)}╣`;
  const bottom = `╚${'═'.repeat(12)}╩${'═'.repeat(nameLen+2)}╩${'═'.repeat(versionLen+2)}╩${'═'.repeat(linkLen+2)}╝`;
  const row  = (r: string, n: string, v: string, l: string) => `║ ${r.padEnd(10)} ║ ${n.padEnd(nameLen)} ║ ${v.padEnd(versionLen)} ║ ${l.padEnd(linkLen)} ║`;

  console.log(top);
  console.log(row('Registry', 'Name', 'Version', 'Link'));
  console.log(sep);
  for (const s of summaries) {
    console.log(row(
      s.registry.toUpperCase(),
      s.name,
      s.version,
      s.link
    ));
  }
  console.log(bottom + '\n');
  // Print clickable links (for terminals that support it)
  for (const s of summaries) {
    console.log(`🔗 ${s.registry.toUpperCase()}: \x1b]8;;${s.link}\x1b\\${s.link}\x1b]8;;\x1b\\`);
  }
}

