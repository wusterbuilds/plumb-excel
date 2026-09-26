# Contributing to Plumb for Excel

Thanks for helping make spreadsheet review safer and more useful.

## Before opening a change

- Use synthetic, public-domain, or properly licensed workbook and document fixtures.
- Do not commit client data, credentials, API responses containing personal data, or proprietary provider documentation.
- Open an issue before a large architectural change.

## Development

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Keep pull requests focused, explain the user workflow being improved, and include tests for tool or workbook behavior. Changes that write to Excel should document their undo or recovery behavior.
