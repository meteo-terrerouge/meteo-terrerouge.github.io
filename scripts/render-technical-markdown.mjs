const escapeMarkdownHtml = value => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const wrapTechnicalPictogramStacks = html => html.replace(
  /(?:<img class="technical-inline-image"[^>]*>){2,}/g,
  images => `<span class="technical-pictogram-stack">${images}</span>`
);

const renderMarkdownInline = value => wrapTechnicalPictogramStacks(escapeMarkdownHtml(value)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="technical-inline-image" src="$2" alt="$1" loading="lazy">')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>'));

const markdownTableCells = line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());

const isMarkdownBlock = (line, next = "") => !line.trim()
  || /^#{1,6}\s+/.test(line)
  || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(line)
  || /^```/.test(line)
  || /^[-*]\s+/.test(line)
  || /^\d+\.\s+/.test(line)
  || (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(next));

export function renderTechnicalMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let index = 0;
  let chapterOpen = false;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (image) {
      html.push('<figure class="technical-figure"><img src="' + escapeMarkdownHtml(image[2]) + '" alt="' + escapeMarkdownHtml(image[1]) + '" loading="lazy"></figure>');
      index += 1;
      continue;
    }
    const fence = line.match(/^```([^\s]*)/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      index += 1;
      html.push('<pre class="technical-diagram"><code class="language-' + escapeMarkdownHtml(fence[1] || "text") + '">' + escapeMarkdownHtml(code.join("\n")) + "</code></pre>");
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length + 1);
      const anchor = heading[2].match(/\s+\{#([a-z0-9-]+)\}\s*$/i);
      const headingText = anchor ? heading[2].slice(0, anchor.index) : heading[2];
      if (heading[1].length === 1) {
        if (chapterOpen) html.push("</section>");
        html.push('<section class="technical-chapter">');
        chapterOpen = true;
      }
      html.push(`<h${level}${anchor ? ` id="${anchor[1]}"` : ""}>${renderMarkdownInline(headingText)}</h${level}>`);
      index += 1;
      continue;
    }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] || "")) {
      const headers = markdownTableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(markdownTableCells(lines[index++]));
      html.push('<div class="technical-table-scroll"><table><thead><tr>' + headers.map(cell => `<th>${renderMarkdownInline(cell)}</th>`).join("") + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(cell => `<td>${renderMarkdownInline(cell)}</td>`).join("") + '</tr>').join("") + "</tbody></table></div>");
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) items.push(lines[index++].replace(/^[-*]\s+/, ""));
      html.push("<ul>" + items.map(item => `<li>${renderMarkdownInline(item)}</li>`).join("") + "</ul>");
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) items.push(lines[index++].replace(/^\d+\.\s+/, ""));
      html.push("<ol>" + items.map(item => `<li>${renderMarkdownInline(item)}</li>`).join("") + "</ol>");
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isMarkdownBlock(lines[index], lines[index + 1] || "")) paragraph.push(lines[index++].trim());
    html.push(`<p>${renderMarkdownInline(paragraph.join(" "))}</p>`);
  }
  if (chapterOpen) html.push("</section>");
  return html.join("\n");
}
