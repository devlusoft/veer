---
"@devlusoft/veer": patch
---

Drop `@vue/compiler-sfc` from dependencies: pages and `definePage` meta are now parsed with `vue/compiler-sfc` from the project's `vue`, so projects install a single copy of the compiler and page scanning stays in sync with the vue version that compiles the app.
