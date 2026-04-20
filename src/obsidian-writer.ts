import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { config, getCapturesPath } from "./config.js";
import type { ScrapedContent } from "./scraper.js";
import type { Summary } from "./summarizer.js";

const execAsync = promisify(exec);

export async function setupVault(): Promise<void> {
  const vaultPath = config.obsidianVaultPath;
  const vaultRepo = process.env.VAULT_REPO;
  const ghToken = process.env.GITHUB_TOKEN;

  if (!config.gitPush || !vaultRepo) {
    console.log("[Vault] GIT_PUSH desabilitado ou VAULT_REPO não configurado, salvando localmente.");
    await fs.mkdir(vaultPath, { recursive: true });
    return;
  }

  // Inject token into repo URL for auth: https://TOKEN@github.com/user/repo.git
  let authRepo = vaultRepo;
  if (ghToken && vaultRepo.startsWith("https://")) {
    authRepo = vaultRepo.replace("https://", `https://${ghToken}@`);
  }

  try {
    await fs.access(path.join(vaultPath, ".git"));
    console.log("[Vault] Repo já existe, fazendo pull...");
    try {
      await execAsync("git pull --rebase", { cwd: vaultPath });
    } catch (err) {
      console.error("[Vault] Pull falhou, continuando:", err);
    }
  } catch {
    console.log(`[Vault] Clonando vault repo...`);
    try {
      await fs.mkdir(path.dirname(vaultPath), { recursive: true });
      await execAsync(`git clone ${authRepo} "${vaultPath}"`);
    } catch (err) {
      console.error("[Vault] Clone falhou, criando pasta local:", err);
      await fs.mkdir(vaultPath, { recursive: true });
    }
  }

  // Configure git identity
  const opts = { cwd: vaultPath };
  try {
    await execAsync('git config user.email "bot@whatsapp-obsidian.local"', opts);
    await execAsync('git config user.name "WhatsApp-Obsidian Bot"', opts);
    // Disable SSL verification for Railway environment
    await execAsync("git config http.sslVerify false", opts);
  } catch {}
  console.log("[Vault] Pronto para receber notas.");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

async function gitPush(filePath: string, commitMsg: string): Promise<void> {
  const vaultPath = config.obsidianVaultPath;
  const opts = { cwd: vaultPath };
  try {
    await execAsync(`git add "${filePath}"`, opts);
    await execAsync(`git commit -m "${commitMsg}"`, opts);
    await execAsync("git push", opts);
    console.log(`[Git] Pushed: ${commitMsg}`);
  } catch (err) {
    console.error("[Git] Push failed:", err);
  }
}

function getOutputDir(folder: string | null): string {
  if (folder) {
    return path.join(config.obsidianVaultPath, folder);
  }
  return getCapturesPath();
}

export async function writeLinkNote(
  content: ScrapedContent,
  summary: Summary,
  folder: string | null = null
): Promise<string> {
  const date = new Date();
  const safeTitle = content.title.replace(/[<>:"/\\|?*]/g, "").trim();
  const filename = `${safeTitle}.md`;
  const capturesDir = getOutputDir(folder);

  await fs.mkdir(capturesDir, { recursive: true });

  const filePath = path.join(capturesDir, filename);
  const markdown = buildLinkNote(content, summary, date);

  await fs.writeFile(filePath, markdown, "utf-8");

  if (config.gitPush) {
    await gitPush(filePath, `capture: ${content.title.slice(0, 60)}`);
  }

  return filePath;
}

export async function writeQuickNote(text: string, folder: string | null = null): Promise<string> {
  const date = new Date();
  const filename = `Nota rápida ${formatDateTime(date).replace(/:/g, "-")}.md`;
  const capturesDir = getOutputDir(folder);

  await fs.mkdir(capturesDir, { recursive: true });

  const filePath = path.join(capturesDir, filename);
  const markdown = buildQuickNote(text, date);

  await fs.writeFile(filePath, markdown, "utf-8");

  if (config.gitPush) {
    await gitPush(filePath, `quick-note: ${formatDateTime(date)}`);
  }

  return filePath;
}
