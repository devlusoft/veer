<script setup>
import { useHead } from '@devlusoft/veer'

definePage({
  routeRules: { prerender: true },
})

useHead({
  title: 'Static | veer',
})
</script>

<template>
  <div>
    <h1>Static Page</h1>
    <p>This page is prerendered at build time.</p>
  </div>
</template>
