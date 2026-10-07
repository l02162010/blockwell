<script setup lang="ts">
defineProps<{ num: string; zh: string; en: string }>();
</script>

<template>
  <div class="section-head">
    <div class="num">{{ num }}</div>
    <h2>{{ zh }} <span>{{ en }}</span></h2>
    <p v-if="$slots.default"><slot /></p>
  </div>
</template>
