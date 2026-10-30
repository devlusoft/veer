---
"@devlusoft/veer": minor
---

Add `@devlusoft/veer/h3`, which re-exports the full h3 API, so server routes can use any h3 utility without installing `h3` separately. veer now uses the same h3 instance as Nitro, so projects no longer ship two copies of h3.
