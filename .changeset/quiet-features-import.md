---
"@devlusoft/veer": minor
---

Stop auto-importing what lives in `app/features`. The composables in `app/features/*/composables` are no longer auto-imported and the components in `app/features` are no longer registered globally, so a feature can no longer use another feature's code without declaring it. Everything else is still imported automatically: `app/components`, `app/composables`, `shared/utils`, `shared/types` and `.veer/`. The types generated in `.veer/` no longer list anything from `app/features`.

To migrate, import what you use from its feature with the `@/` alias. A component used in a template without an import is no longer rendered and Vue warns that it can't resolve it, and a composable used without an import throws a reference error. Before:

    <script setup lang="ts">
    const {items} = useCarrito()
    </script>
    <template><ProductCard :id="1" /></template>

After:

    <script setup lang="ts">
    import ProductCard from '@/features/catalogo/components/ProductCard.vue'
    import {useCarrito} from '@/features/carrito/composables/useCarrito'
    const {items} = useCarrito()
    </script>
    <template><ProductCard :id="1" /></template>

This relies on the `@/` alias. If your project doesn't have the `@/*` path in its `tsconfig.json` yet, add it as described in the release notes of the `@/` alias.