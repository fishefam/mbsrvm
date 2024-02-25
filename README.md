# Mobius Revamp

Implement a new user interface for Mobius's editor

## Prerequisite

- node (>=20)
- pnpm (>=8)
- firefox & chrome (>=120)

## Main Dependencies

- React
- Slate
- Codemirror-react
- Shadcn/Radix-ui
- Lucid-react

## Style Rules

- Use pnpm when adding packages
- Yarn and npm can be used for non-installing scripts
- Naming (directories, variables) is in singular form. Exception: components.json
- Only use plural when naming array variables

## Install

```
pnpm install
```

## Scripts

- Development: build and open a firefox window at http://localhost:[port]

```
pnpm run dev / npm run dev / yarn dev
```

- Production: build optimized and minified distribution

```
pnpm run build / npm run build / yarn build
```

## `src` Directory Hierarchy

```
|—— app
|   |—— App.tsx
|   |—— component
|       |—— ui
|           |—— * Shadcn components *
|       |—— * Main app components *
|   |—— main.tsx
|   |—— store
|       |—— * Root context *
|   |—— style.scss
|—— injection.ts
|—— lib
|   |—— * Helper functions and custom libraries *
|—— manifest.json
|—— typing
```

## License

- MIT
