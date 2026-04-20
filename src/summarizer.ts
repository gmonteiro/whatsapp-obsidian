import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { ScrapedContent } from "./scraper.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export interface Summary {
  resumo: string;
  pontos_chave: string[];
  citacoes: string[];
  tags: string[];
  tipo: string;
  conexoes: string[];
}

const SYSTEM_PROMPT = `Você é um assistente que analisa conteúdo web e gera resumos estruturados em português brasileiro.

Responda APENAS com JSON válido no seguinte formato, sem markdown code fences:
{
  "resumo": "Resumo do conteúdo em 2-3 parágrafos",
  "pontos_chave": ["Ponto 1", "Ponto 2", ...],
  "citacoes": ["Citação relevante 1", "Citação relevante 2", ...],
  "tags": ["tag1", "tag2", ...],
  "tipo": "artigo|video|thread|paper|tutorial|noticia|outro",
  "conexoes": ["Conceito 1", "Conceito 2", ...]
}

Regras:
- Resumo: 2-3 parágrafos claros e informativos
- Pontos-chave: 3-7 bullet points com os insights mais importantes
- Citações: 2-5 trechos literais relevantes do texto original (se disponíveis)
- Tags: 3-7 tags em português, lowercase, sem acentos, separadas por hífen se compostas
- Tipo: classifique o conteúdo
- Conexões: 3-5 conceitos/tópicos que poderiam linkar a outras notas (para wikilinks do Obsidian)`;

export async function summarize(content: ScrapedContent): Promise<Summary> {
  const userMessage = `Título: ${content.title}
${content.author ? `Autor: ${content.author}` : ""}
URL: ${content.url}

Conteúdo:
${content.contentText.slice(0, 30000)}`;

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(text) as Summary;
  } catch {
    // If JSON parsing fails, return a basic summary
    return {
      resumo: text.slice(0, 500),
      pontos_chave: [],
      citacoes: [],
      tags: [],
      tipo: "outro",
      conexoes: [],
    };
  }
}
