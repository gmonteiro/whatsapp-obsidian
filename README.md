# whatsapp-obsidian

Duas capturas por WhatsApp, no mesmo processo:

1. **Link → Obsidian** (o original): você manda um link para si mesmo no WhatsApp Web,
   o app raspa a página, resume com Claude e grava a nota no vault.
2. **Áudio → card no Pipefy** (novo): você manda um áudio para o chip da Z-API contando
   como foi a reunião, e sai um card no pipe de CRM com os campos preenchidos.

As duas são independentes. Faltando as variáveis da Z-API/Pipefy, o CRM fica desligado
e o resto sobe normal.

## Áudio → Pipefy

```
áudio no WhatsApp
   → webhook da Z-API (POST /webhook/zapi)
   → transcrição na Groq (whisper-large-v3, pt)
   → extração com Claude, num schema montado a partir dos campos reais do pipe
   → createCard no Pipefy + transcrição completa como comentário
   → resposta no WhatsApp com o link do card e o que ficou em branco
```

O card é criado direto, sem confirmação. O que o áudio não disser fica em branco:
o prompt proíbe inferir, e campo em branco é corrigível no Pipefy, campo inventado não.

### Variáveis

Ver `.env.example`. As sete obrigatórias para o CRM: `ZAPI_INSTANCE`, `ZAPI_TOKEN`,
`ZAPI_CLIENT_TOKEN`, `OWNER_PHONE`, `GROQ_API_KEY`, `PIPEFY_TOKEN`, `PIPEFY_PIPE_ID`.
Na subida o log diz quais faltam.

### Configurar o webhook na Z-API

No painel da Z-API, em **Ao receber**, aponte para `https://<seu-host>/webhook/zapi`.

⚠️ **A Z-API aceita um único webhook de recebimento por instância.** Este chip também
atende o projeto do Zona Sul: apontar o webhook para cá desliga o outro. Por isso existe
`ZAPI_FORWARD_URL` — preencha com o endpoint atual do Zona Sul e este app repassa o
payload intacto antes de decidir o que fazer com ele.

### O que vira card e o que não vira

Só entra no pipeline áudio que passe por todos estes filtros (`shouldHandle`, em `src/crm.ts`):

| Condição | Motivo |
|---|---|
| tem `audio` | texto no chip não é entrada de CRM |
| `phone` == `OWNER_PHONE` | o chip é compartilhado — áudio de cliente não pode virar card |
| `fromMe` falso | a resposta do próprio bot volta como callback |
| `isGroup` falso | grupo do chip não é canal de CRM |
| `momment` < `MAX_MESSAGE_AGE_MINUTES` | a Z-API reentrega pendências ao reconectar |
| `messageId` inédito | reentrega por timeout viraria um segundo card |

`npm run check:routing` roda esses casos sem rede e sem credencial.

### Mapeamento de campos

O schema de extração é montado na hora a partir de `start_form_fields` do pipe
(`src/crm-extractor.ts`), então o modelo só pode preencher campo que existe:

- texto, e-mail, telefone, CPF/CNPJ → string
- `number`, `currency` → número ("três milhões" vira `3000000`)
- `date`, `due_date`, `datetime` → ISO, resolvidos contra a data de hoje
- `select`, `radio_*` → uma das opções do próprio campo
- `checklist_*` → lista de opções
- `connector`, `assignee_select`, `attachment`, `label_select`, `statement`, `time` → ignorados,
  não dá para preencher com confiança a partir de narração

Valor de opção que não bate exatamente é descartado antes de chegar ao Pipefy (a API
recusa opção desconhecida); a comparação ignora acento e caixa.

## Rodar

```bash
npm install
cp .env.example .env   # preencha
npm run dev
```

Painel em `http://localhost:3000` — QR code do WhatsApp Web e última atividade.
Para testar só o CRM, sem escanear QR: `ENABLE_WHATSAPP_WEB=false`.
