<script setup lang="ts">
import HelloAuth from '@/features/auth/components/hello-auth.vue'

const now = ref(new Date())
const mounted = ref(false)

onMounted(() => {
  mounted.value = true
  setInterval(() => { now.value = new Date() }, 1000)
})
</script>

<template>
  <h1>Hello from pages/index.vue</h1>
  <p v-if="mounted">Current time: {{ now.toLocaleString() }}</p>
  <p v-else>Current time: --</p>
  <Hello name="veer" />
  <FormsInput label="Test" />
  <HelloAuth />
</template>