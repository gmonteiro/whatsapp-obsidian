import { startWhatsApp } from "./whatsapp.js";
import { extractUrls } from "./url-extractor.js";
import { scrape } from "./scraper.js";
import { summarize } from "./summarizer.js";
import { writeLinkNote, writeQuickNote } from "./obsidian-writer.js";

async function processUrl(url: string): Promise<void> {
  console.log(`[Pipeline] Scraping: ${url}`);
  const content = await scrape(url);
  console.log(`[Pipeline] Título: ${content.title}`);

  console.log(`[Pipeline] Gerando resumo com Claude...`);
  const summary = await summarize(content);
  console.log(`[Pipeline] Tags: ${summary.tags.join(", ")}`);

  const filePath = await writeLinkNote(content, summary);
  console.log(`[Pipeline] Nota salva: ${filePath}`);
}

async function handleMessage(text: string): Promise<void> {
  const urls = extractUrls(text);

  if (urls.length === 0) {
    // No URLs — save as quick note
    const filePath = await writeQuickNote(text);
    console.log(`[Pipeline] Nota rápida salva: ${filePath}`);
    return;
  }

  // Process each URL
  for (const url of urls) {
    try {
      await processUrl(url);
    } catch (err) {
      console.error(`[Pipeline] Erro processando ${url}:`, err);
    }
  }
}

console.log("[WhatsApp-Obsidian] Iniciando...");
startWhatsApp(handleMessage).catch((err) => {
  console.error("[WhatsApp-Obsidian] Erro fatal:", err);
  process.exit(1);
});
