# create-veer

## 0.1.1

### Patch Changes

- 5ca8c65: Add the `@/` alias, which resolves to `app/` in dev, build and SSR, so a project can write `import ProductCard from '@/features/catalogo/components/ProductCard.vue'` instead of a relative path. Imports that start with `@` but not with `@/`, such as `@vue/...` or `@devlusoft/veer`, still resolve from `node_modules`. `#veer` and `#shared` are unchanged.

  New projects from `create-veer` already include the `@/*` path in their `tsconfig.json`, and their `include` now covers the files inside `app/` instead of the project root. In an existing project, the editor needs the path added by hand in `compilerOptions.paths`, next to any entries you already have:

      "paths": {
        "@/*": ["./app/*"]
      }

  Also make sure the `include` of that `tsconfig.json` lists the files inside `app/` (for example `app/**/*.vue` and `app/**/*.ts`), or the editor will keep reporting type errors on `@/` imports.

## 0.1.0

### Minor Changes

- a5a066c: rename to veer

---

Versiones anteriores publicadas como `create-nuxe`.

## 0.2.6

### Patch Changes

- fbab89c: feat: add shared directory with utils and types, update auto-imports and aliases

## 0.2.5

### Patch Changes

- f054895: -

## 0.2.4

### Patch Changes

- ae7dc37: update workflow

## 0.2.3

### Patch Changes

- 49bb641: update template

## 0.2.2

### Patch Changes

- 52ad148: add repo

## 0.2.1

### Patch Changes

- 28e5c62: update changeset

## 0.2.0

### Minor Changes

- dc0b4da: create nuxe
- cd3b40e: consola and create nuxe
- d70df26: update changeset
