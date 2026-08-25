import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { config, crmConfig } from "./config.js";
import type { CardFieldValue, PipefyField, PipefyPipe } from "./pipefy.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

/** Tipos de campo que não dá para preencher a partir de uma narração. */
const UNSUPPORTED_TYPES = new Set([
  "statement",
  "id",
  "attachment",
  "assignee_select",
  "connector",
  "dynamic_content",
  "time",
  "label_select",
]);

const NUMERIC_TYPES = new Set(["number", "currency"]);
const MULTI_TYPES = new Set(["checklist_vertical", "checklist_horizontal"]);
const SINGLE_CHOICE_TYPES = new Set([
  "select",
  "radio_vertical",
  "radio_horizontal",
]);
const DATE_TYPES = new Set(["date", "due_date"]);

type JsonSchema = Record<string, unknown>;

function nullable(schema: JsonSchema): JsonSchema {
  return { anyOf: [schema, { type: "null" }] };
}

function keyFor(field: PipefyField, index: number): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.id)
    ? field.id
    : `campo_${index}`;
}

function describe(field: PipefyField): string {
  const parts = [field.label];
  if (field.description) parts.push(field.description);
  if (field.help) parts.push(field.help);
  if (field.options.length) {
    parts.push(`Opções válidas: ${field.options.join(" | ")}`);
  }
  return parts.join(" — ");
}

function schemaFor(field: PipefyField): JsonSchema | null {
  if (UNSUPPORTED_TYPES.has(field.type)) return null;

  const description = describe(field);

  if (NUMERIC_TYPES.has(field.type)) {
    return nullable({
      type: "number",
      description: `${description}. Número puro, sem símbolo de moeda nem separador de milhar.`,
    });
  }
  if (DATE_TYPES.has(field.type)) {
    return nullable({ type: "string", format: "date", description });
  }
  if (field.type === "datetime") {
    return nullable({ type: "string", format: "date-time", description });
  }
  if (SINGLE_CHOICE_TYPES.has(field.type)) {
    if (!field.options.length) return null;
    return nullable({ type: "string", enum: field.options, description });
  }
  if (MULTI_TYPES.has(field.type)) {
    if (!field.options.length) return null;
    return nullable({
      type: "array",
      items: { type: "string", enum: field.options },
      description,
    });
  }
  return nullable({ type: "string", description });
}

export interface ExtractionResult {
  title: string;
  fields: CardFieldValue[];
  /** Rótulos preenchidos, para a resposta no WhatsApp. */
  filled: { label: string; value: string }[];
  ignored: string[];
}

/**
 * Casa o texto do modelo com uma opção do Pipefy. A opção precisa bater exata
 * na API, e o modelo erra acento e caixa — comparar normalizado evita descartar
 * um valor certo por causa de um "Não" sem til.
 */
function matchOption(value: string, options: string[]): string | null {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .trim();
  const target = normalize(value);
  return options.find((o) => normalize(o) === target) ?? null;
}

export async function extractCard(
  pipe: PipefyPipe,
  transcript: string
): Promise<ExtractionResult> {
  const usable: { key: string; field: PipefyField; schema: JsonSchema }[] = [];
  const ignored: string[] = [];

  pipe.fields.forEach((field, index) => {
    const schema = schemaFor(field);
    if (!schema) {
      ignored.push(field.label);
      return;
    }
    usable.push({ key: keyFor(field, index), field, schema });
  });

  const properties: Record<string, JsonSchema> = {
    titulo: {
      type: "string",
      description:
        "Título do card: empresa e assunto, curto. Ex.: 'Acme — expansão da operação'.",
    },
  };
  for (const { key, schema } of usable) {
    properties[key] = schema;
  }

  const schema = {
    type: "object",
    properties,
    required: ["titulo", ...usable.map((u) => u.key)],
    additionalProperties: false,
  } as const;

  const today = new Date().toISOString().slice(0, 10);

  const system = `Você extrai dados de CRM a partir da narração falada de uma reunião comercial, em português do Brasil.

Preencha os campos do pipe "${pipe.name}" a partir do que foi dito. Regras:
- Só use o que está na narração. Nada de inferir, completar ou arredondar por conta própria.
- Campo que a narração não cobre volta como null. Card com campo em branco é corrigível; card com campo inventado, não.
- Valores em "milhões"/"mil" viram o número cheio: "três milhões" = 3000000.
- Datas em ISO (YYYY-MM-DD). Hoje é ${today}; resolva "semana que vem", "dia 10" e afins a partir dessa data.
- Em campo de opção, devolva a opção exatamente como listada na descrição. Se nada bater, devolva null.
- Nomes de pessoa e empresa como foram falados, sem corrigir grafia que você não conhece.`;

  const response = await client.messages.parse({
    model: crmConfig.model,
    max_tokens: 8000,
    system,
    messages: [
      {
        role: "user",
        content: `Narração transcrita do áudio:\n\n"""\n${transcript}\n"""`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(schema as never) },
  });

  const parsed = response.parsed_output as Record<string, unknown> | null;
  if (!parsed) {
    throw new Error("O modelo não devolveu um objeto válido para o card.");
  }

  const fields: CardFieldValue[] = [];
  const filled: { label: string; value: string }[] = [];

  for (const { key, field } of usable) {
    const raw = parsed[key];
    if (raw === null || raw === undefined || raw === "") continue;

    let value: string | number | string[] | null = null;

    if (NUMERIC_TYPES.has(field.type)) {
      const asNumber = typeof raw === "number" ? raw : Number(raw);
      value = Number.isFinite(asNumber) ? asNumber : null;
    } else if (SINGLE_CHOICE_TYPES.has(field.type)) {
      value = matchOption(String(raw), field.options);
    } else if (MULTI_TYPES.has(field.type)) {
      const list = (Array.isArray(raw) ? raw : [raw])
        .map((item) => matchOption(String(item), field.options))
        .filter((item): item is string => Boolean(item));
      value = list.length ? list : null;
    } else if (DATE_TYPES.has(field.type)) {
      const text = String(raw).slice(0, 10);
      value = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
    } else {
      const text = String(raw).trim();
      value = text || null;
    }

    if (value === null) continue;

    fields.push({ field_id: field.id, field_value: value });
    filled.push({
      label: field.label,
      value: Array.isArray(value) ? value.join(", ") : String(value),
    });
  }

  const title = String(parsed.titulo || "").trim() || "Oportunidade sem título";

  return { title, fields, filled, ignored };
}
