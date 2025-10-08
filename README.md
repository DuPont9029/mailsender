App Next.js con Google OAuth e invio Gmail, templates (con destinatario per ciascun template) su parquet S3 letti via DuckDB-WASM.

## Getting Started

Setup rapido:

1) Copia `.env.example` in `.env.local` e compila valori (Google OAuth, AWS, bucket e key parquet).
2) Configura OAuth su Google Cloud Console con scope `https://www.googleapis.com/auth/gmail.send` e callback `NEXTAUTH_URL/api/auth/callback/google`.
3) Carica `templates.parquet` nel bucket S3. Campi richiesti:
   - `id` (INT)
   - `name` (STRING)
   - `subject` (STRING)
   - `body` (STRING)
   - `placeholders` (STRING JSON array opzionale, es: `["firstName","orderId"]`)
   - `recipient_email` (STRING)
   - `recipient_name` (STRING opzionale)
4) Avvio sviluppo:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Apri [http://localhost:3000](http://localhost:3000) per vedere l’app.

Homepage con pulsante login Google e link a `/templates`. Dopo login, la pagina `Templates` mostra cards; clic su card apre form segnaposti se presenti, altrimenti invia direttamente al destinatario definito nel template.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
