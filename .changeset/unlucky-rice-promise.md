---
"@devlusoft/veer": minor
"create-veer": patch
---

Add the `@/` alias, which resolves to `app/` in dev, build and SSR, so a project can write `import ProductCard from '@/features/catalogo/components/ProductCard.vue'` instead of a relative path. Imports that start with `@` but not with `@/`, such as `@vue/...` or `@devlusoft/veer`, still resolve from `node_modules`. `#veer` and `#shared` are unchanged.

New projects from `create-veer` already include the `@/*` path in their `tsconfig.json`, and their `include` now covers the files inside `app/` instead of the project root. In an existing project, the editor needs the path added by hand in `compilerOptions.paths`, next to any entries you already have:

    "paths": {
      "@/*": ["./app/*"]
    }

Also make sure the `include` of that `tsconfig.json` lists the files inside `app/` (for example `app/**/*.vue` and `app/**/*.ts`), or the editor will keep reporting type errors on `@/` imports.