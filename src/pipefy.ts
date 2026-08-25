import { crmConfig } from "./config.js";

export interface PipefyField {
  id: string;
  label: string;
  type: string;
  description: string | null;
  help: string | null;
  required: boolean;
  options: string[];
}

export interface PipefyPipe {
  id: string;
  name: string;
  fields: PipefyField[];
}

export interface CardFieldValue {
  field_id: string;
  field_value: string | number | string[];
}

export interface CreatedCard {
  id: string;
  title: string;
  url: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch("https://api.pipefy.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${crmConfig.pipefy.token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await res.json().catch(() => ({}))) as GraphQLResponse<T>;

  // O Pipefy devolve 200 com "errors" preenchido; checar só o status esconde a falha.
  if (payload.errors?.length) {
    throw new Error(
      `Pipefy: ${payload.errors.map((e) => e.message).join("; ")}`
    );
  }
  if (!res.ok || !payload.data) {
    throw new Error(`Pipefy respondeu ${res.status} sem dados.`);
  }
  return payload.data;
}

const PIPE_QUERY = `
  query ($id: ID!) {
    pipe(id: $id) {
      id
      name
      start_form_fields {
        id
        label
        type
        description
        help
        required
        options
      }
    }
  }
`;

let cachedPipe: PipefyPipe | null = null;

/**
 * Os campos do formulário inicial são a fonte do schema de extração — o modelo
 * nunca inventa um campo, ele preenche os que o pipe realmente tem.
 * Em cache: a estrutura do pipe muda raramente e cada card faria uma ida a mais.
 */
export async function fetchPipe(force = false): Promise<PipefyPipe> {
  if (cachedPipe && !force) return cachedPipe;

  const data = await graphql<{
    pipe: {
      id: string;
      name: string;
      start_form_fields: {
        id: string;
        label: string;
        type: string;
        description: string | null;
        help: string | null;
        required: boolean;
        options: string[] | null;
      }[];
    };
  }>(PIPE_QUERY, { id: crmConfig.pipefy.pipeId });

  cachedPipe = {
    id: data.pipe.id,
    name: data.pipe.name,
    fields: data.pipe.start_form_fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      description: f.description,
      help: f.help,
      required: f.required,
      options: f.options ?? [],
    })),
  };
  return cachedPipe;
}

const CREATE_CARD = `
  mutation ($input: CreateCardInput!) {
    createCard(input: $input) {
      card {
        id
        title
        url
      }
    }
  }
`;

export async function createCard(
  title: string,
  fields: CardFieldValue[]
): Promise<CreatedCard> {
  const data = await graphql<{ createCard: { card: CreatedCard } }>(
    CREATE_CARD,
    {
      input: {
        pipe_id: crmConfig.pipefy.pipeId,
        title,
        fields_attributes: fields,
      },
    }
  );
  return data.createCard.card;
}

const CREATE_COMMENT = `
  mutation ($input: CreateCommentInput!) {
    createComment(input: $input) {
      comment {
        id
      }
    }
  }
`;

export async function commentOnCard(
  cardId: string,
  text: string
): Promise<void> {
  await graphql(CREATE_COMMENT, { input: { card_id: cardId, text } });
}
