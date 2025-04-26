export interface PublishSummary {
  registry: "npm" | "jsr";
  name: string;
  version: string;
  link: string;
  footnoteIndex?: number;
}

export function printPublishSummary(summaries: PublishSummary[]) {
  const REGISTRY_WIDTH = 10;
  const NAME_WIDTH = 30;
  const VERSION_WIDTH = 9;
  const LINK_WIDTH = 60;
  
  const footnotes: string[] = [];
  const safeSummaries = summaries.map((s, index) => {
    if (s.link.length > LINK_WIDTH) {
      footnotes.push(s.link);
      return { ...s, link: s.link.slice(0, LINK_WIDTH - 3) + '...', footnoteIndex: index };
    }
    return s;
  });

  const colWidths = [REGISTRY_WIDTH, NAME_WIDTH, VERSION_WIDTH, LINK_WIDTH];

  function padCell(content: string, width: number): string {
    return ' ' + content.padEnd(width - 2) + ' ';
  }

  const top    = '╔' + colWidths.map(w => '═'.repeat(w)).join('╦') + '╗';
  const sep    = '╠' + colWidths.map(w => '═'.repeat(w)).join('╬') + '╣';
  const bottom = '╚' + colWidths.map(w => '═'.repeat(w)).join('╩') + '╝';

  function row(cells: string[]): string {
    return '║' + cells.map((c, i) => {
      const content = c.length > colWidths[i] - 2 ? c.slice(0, colWidths[i] - 5) + '...' : c;
      return padCell(content, colWidths[i]);
    }).join('║') + '║';
  }

  const tableWidth = colWidths.reduce((a, b) => a + b, 0) + colWidths.length + 1;
  const title = '📦 Publish Summary';
  const pad = Math.max(0, Math.floor((tableWidth - title.length) / 2));
  const centeredTitle = ' '.repeat(pad) + title + ' '.repeat(pad);

  console.log('\n' + centeredTitle + '\n');
  console.log(top);
  console.log(row(['Registry', 'Name', 'Version', 'Link']));
  console.log(sep);
  
  for (const s of safeSummaries) {
    console.log(row([
      s.registry.toUpperCase(),
      s.name,
      s.version,
      s.link
    ]));
  }
  
  console.log(bottom + '\n');
  
  for (const s of summaries) {
    console.log(`🔗 ${s.registry.toUpperCase()}: ${s.link}`);
  }
  
  if (footnotes.length > 0) {
    console.log('\n* Full error(s):');
    for (const note of footnotes) {
      console.log('* ' + note);
    }
  }
}