---
"@devlusoft/veer": patch
---

Fix `useAsyncData` and `useFetch` showing the data of the previous page when two pages use the same key. A consumer that mounts in a new client navigation now requests its own data even if the entry already exists, consumers of the same navigation still share one request, and a consumer that stays mounted across navigations, such as a layout, sees the new data without requesting. Each request now uses the retry options of the consumer that makes it, not those of the first consumer of the entry.
