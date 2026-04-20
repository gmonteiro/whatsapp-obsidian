import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

export interface ScrapedContent {
  title: string;
  author: string | null;
  excerpt: string | null;
  contentMarkdown: string;
  contentText: string;
  url: string;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
}

function extractWithReadability(
  html: string,
  url: string
): { title: string; author: string | null; excerpt: string | null; contentHtml: string } | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article || !article.content) return null;
  return {
    title: article.title,
    author: article.byline ?? null,
    excerpt: article.excerpt ?? null,
    contentHtml: article.content,
  };
}

function fallbackExtract(html: string): { title: string; excerpt: string | null; text: string } {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const title =
    doc.querySelector("title")?.textContent?.trim() ??
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ??
    "Sem título";

  const excerpt =
    doc.querySelector('meta[name="description"]')?.getAttribute("content") ??
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
    null;

  const text = doc.body?.textContent?.replace(/\s+/g, " ").trim().slice(0, 10000) ?? "";

  return { title, excerpt, text };
}

async function scrapeYouTube(url: string): Promise<ScrapedContent | null> {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]+)/
  );
  if (!match) return null;

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  try {
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title: string; author_name: string };
    return {
      title: data.title,
      author: data.author_name,
      excerpt: `Vídeo do YouTube por ${data.author_name}`,
      contentMarkdown: `Vídeo: [${data.title}](${url})\n\nAutor: ${data.author_name}`,
      contentText: `Vídeo: ${data.title}\nAutor: ${data.author_name}`,
      url,
    };
  } catch {
    return null;
  }
}

export async function scrape(url: string): Promise<ScrapedContent> {
  // YouTube special handling
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const yt = await scrapeYouTube(url);
    if (yt) return yt;
  }

  const html = await fetchHtml(url);

  // Try Readability first
  const article = extractWithReadability(html, url);
  if (article) {
    const contentMarkdown = turndown.turndown(article.contentHtml);
    const contentText = new JSDOM(article.contentHtml).window.document.body?.textContent?.trim() ?? "";
    return {
      title: article.title,
      author: article.author,
      excerpt: article.excerpt,
      contentMarkdown,
      contentText: contentText.slice(0, 50000),
      url,
    };
  }

  // Fallback
  const fb = fallbackExtract(html);
  return {
    title: fb.title,
    author: null,
    excerpt: fb.excerpt,
    contentMarkdown: fb.text.slice(0, 10000),
    contentText: fb.text.slice(0, 50000),
    url,
  };
}
