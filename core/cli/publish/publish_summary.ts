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
  const tableWidth = 3 + 10 + 3 + nameLen + 3 + versionLen + 3 + linkLen + 3; // box chars + col widths
  const title = '📦 Publish Summary';
  const pad = Math.max(0, Math.floor((tableWidth - title.length) / 2));
  const centeredTitle = ' '.repeat(pad) + title + ' '.repeat(tableWidth - pad - title.length);

  // Print centered title (no border)
  console.log('\n' + centeredTitle + '\n');

  // Table lines (single ASCII borders)
  const top    = `+${'-'.repeat(10)}+${'-'.repeat(nameLen)}+${'-'.repeat(versionLen)}+${'-'.repeat(linkLen)}+`;
  const sep    = top;
  const bottom = top;
  const row  = (r: string, n: string, v: string, l: string) =>
    `| ${r.padEnd(9)}| ${n.padEnd(nameLen - 1)}| ${v.padEnd(versionLen - 1)}| ${l.padEnd(linkLen - 1)}|`;

  // Print table
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

  // Print footnote if any link contains 'publish failed' or similar error
  const error = summaries.find(s => /publish failed|missing|not installed|denied/i.test(s.link));
  if (error) {
    console.log(`\n* ${error.link.replace(/.*?failed:?/i, '').trim()}`);
  }
}

