import fs from "fs/promises";
import path from "path";
import { getCapturesPath } from "./config.js";
import type { ScrapedContent } from "./scraper.js";
import type { Summary } from "./summarizer.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function buildLinkNote(
  content: ScrapedContent,
  summary: Summary,
  date: Date
): string {
  const domain = new URL(content.url).hostname.replace("www.", "");

  const frontmatter = [
    "---",
    `title: "${content.title.replace(/"/g, '\\"')}"`,
    `url: ${content.url}`,
    `type: ${summary.tipo}`,
    content.author ? `author: "${content.author}"` : null,
    `date_saved: ${formatDate(date)}`,
    "tags:",
    ...summary.tags.map((t) => `  - ${t}`),
    "status: inbox",
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const sections: string[] = [
    frontmatter,
    "",
    `# ${content.title}`,
    "",
    `> [!info] Fonte`,
    `> [${domain}](${content.url})${content.author ? ` · ${summary.tipo} · ${content.author}` : ` · ${summary.tipo}`}`,
    "",
    "## Resumo",
    summary.resumo,
  ];

  if (summary.pontos_chave.length > 0) {
    sections.push("", "## Pontos-chave");
    for (const ponto of summary.pontos_chave) {
      sections.push(`- ${ponto}`);
    }
  }

  if (summary.citacoes.length > 0) {
    sections.push("", "## Citações");
    for (const citacao of summary.citacoes) {
      sections.push(`> "${citacao}"`, "");
    }
  }

  if (summary.conexoes.length > 0) {
    sections.push("## Conexões");
    for (const conexao of summary.conexoes) {
      sections.push(`- [[${conexao}]]`);
    }
  }

  // Original content section
  sections.push(
    "",
    "---",
    "",
    "## Conteúdo Original",
    "",
    `> [!note] Texto extraído automaticamente de [${domain}](${content.url})`,
    "",
    content.contentMarkdown
  );

  return sections.join("\n");
}

function buildQuickNote(text: string, date: Date): string {
  const frontmatter = [
    "---",
    `title: "Nota rápida"`,
    `date_saved: ${formatDateTime(date)}`,
    "tags:",
    "  - quick-note",
    "status: inbox",
    "---",
  ].join("\n");

  return `${frontmatter}\n\n${text}\n`;
}

export async function writeLinkNote(
  content: ScrapedContent,
  summary: Summary
): Promise<string> {
  const date = new Date();
  const slug = slugify(content.title);
  const filename = `${formatDate(date)}-${slug}.md`;
  const capturesDir = getCapturesPath();

  await fs.mkdir(capturesDir, { recursive: true });

  const filePath = path.join(capturesDir, filename);
  const markdown = buildLinkNote(content, summary, date);

  await fs.writeFile(filePath, markdown, "utf-8");
  return filePath;
}

export async function writeQuickNote(text: string): Promise<string> {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${formatDate(date)}-nota-${timestamp}.md`;
  const capturesDir = getCapturesPath();

  await fs.mkdir(capturesDir, { recursive: true });

  const filePath = path.join(capturesDir, filename);
  const markdown = buildQuickNote(text, date);

  await fs.writeFile(filePath, markdown, "utf-8");
  return filePath;
}
