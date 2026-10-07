<script setup lang="ts">
/** Material Symbols Rounded glyph. The host page loads the font (see README). */
defineProps<{ name: string; size?: number }>();
</script>

<template>
  <span class="bw-icon material-symbols-rounded" aria-hidden="true" :style="{ fontSize: `${size ?? 20}px` }">{{ name }}</span>
</template>
