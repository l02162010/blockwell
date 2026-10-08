<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { keepFocus, useBlockwell, visibleRect } from '../composables.js';
import BwIcon from './BwIcon.vue';
import Popover from './Popover.vue';

/** Column and row handles for the cell holding the caret, and their menus. */
const ctx = useBlockwell();
const m = ctx.messages;
const ed = () => ctx.editor.value;
const tick = ref(0);
const bump = () => tick.value++;
onMounted(() => {
  window.addEventListener('scroll', bump, true);
  window.addEventListener('resize', bump);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', bump, true);
  window.removeEventListener('resize', bump);
});

const table = computed(() => {
  void ctx.version.value;
  if (!ctx.active.value?.inTable || !ed().isEditable) return null;
  return ed().tableContext();
});
const focus = computed(() => ctx.active.value?.focusBlock ?? null);
const cells = () => {
  const t = table.value;
  const tableEl = t && ed().blockElement(t.table);
  if (!t || !tableEl) return null;
  const rows = Array.from(tableEl.querySelectorAll(':scope tr')) as HTMLTableRowElement[];
  const colCells = rows.map((r) => r.cells[t.col]).filter(Boolean) as HTMLElement[];
  const rowEl = rows[t.row];
  return { colCells, rowEl, tableEl: tableEl.querySelector('table') as HTMLElement };
};
const geometry = computed(() => {
  void tick.value;
  void ctx.version.value;
  const c = cells();
  if (!c || !c.rowEl || c.colCells.length === 0) return null;
  const top = c.colCells[0]!.getBoundingClientRect();
  const bottom = c.colCells[c.colCells.length - 1]!.getBoundingClientRect();
  const row = c.rowEl.getBoundingClientRect();
  const tbl = c.tableEl.getBoundingClientRect();
  const clip = visibleRect(ed());
  if (!clip || top.top - 16 < clip.top || row.bottom > clip.bottom) return null;
  return {
    col: { left: top.left, width: top.width, top: top.top, height: bottom.bottom - top.top },
    row: { top: row.top, height: row.height, left: tbl.left },
  };
});
const colOpen = computed(() => ctx.ui.popover === 'tableColumn');
const rowOpen = computed(() => ctx.ui.popover === 'tableRow');
const anchorOf = (e: MouseEvent) => {
  const el = e.currentTarget as HTMLElement;
  return () => (el.isConnected ? el.getBoundingClientRect() : null);
};
const run = (fn: (id: string) => void) => {
  const id = focus.value;
  ctx.close();
  if (id) fn(id);
  ed().focus();
};
</script>

<template>
  <template v-if="table && geometry">
    <div
      v-if="colOpen && !ctx.narrow.value"
      class="bw-col-highlight"
      :style="{ top: `${geometry.col.top}px`, left: `${geometry.col.left}px`, width: `${geometry.col.width}px`, height: `${geometry.col.height}px` }"
    />
    <!-- Phones use the bar above the keyboard instead of these handles. -->
    <button
      v-if="!ctx.narrow.value"
      type="button"
      class="bw-col-handle"
      :class="{ 'bw-open': colOpen }"
      :style="{ top: `${geometry.col.top - 16}px`, left: `${geometry.col.left + geometry.col.width / 2 - 14}px` }"
      :aria-label="m.tableMenus.column"
      aria-haspopup="menu"
      :aria-expanded="colOpen"
      @mousedown="keepFocus"
      @click="ctx.toggle('tableColumn', anchorOf($event))"
    >
      <BwIcon name="more_horiz" :size="14" />
    </button>
    <button
      v-if="!ctx.narrow.value"
      type="button"
      class="bw-row-handle"
      :class="{ 'bw-open': rowOpen }"
      :style="{ top: `${geometry.row.top + geometry.row.height / 2 - 12}px`, left: `${geometry.row.left - 18}px` }"
      :aria-label="m.tableMenus.row"
      aria-haspopup="menu"
      :aria-expanded="rowOpen"
      @mousedown="keepFocus"
      @click="ctx.toggle('tableRow', anchorOf($event))"
    >
      <BwIcon name="more_vert" :size="12" />
    </button>

    <Popover v-if="colOpen" role="menu">
      <div class="bw-menu bw-table-menu">
        <button type="button" role="menuitem" class="bw-menu-item" @mousedown="keepFocus" @click="run((id) => ed().addColumn(id, 'before'))">
          <BwIcon name="west" :size="17" class="bw-muted" />{{ m.tableCol.left[0] }}<span class="bw-menu-en">{{ m.tableCol.left[1] }}</span>
        </button>
        <button type="button" role="menuitem" class="bw-menu-item" @mousedown="keepFocus" @click="run((id) => ed().addColumn(id, 'after'))">
          <BwIcon name="east" :size="17" class="bw-muted" />{{ m.tableCol.right[0] }}<span class="bw-menu-en">{{ m.tableCol.right[1] }}</span>
        </button>
        <div class="bw-menu-item bw-menu-split">
          <BwIcon name="swap_horiz" :size="17" class="bw-muted" />{{ m.tableCol.move[0] }}
          <span class="bw-menu-en">
            <button type="button" class="bw-mini" :disabled="table.col === 0" aria-label="←" @mousedown="keepFocus" @click="focus && ed().moveColumn(focus, -1)"><BwIcon name="chevron_left" :size="16" /></button>
            <button type="button" class="bw-mini" :disabled="table.col >= table.cols - 1" aria-label="→" @mousedown="keepFocus" @click="focus && ed().moveColumn(focus, 1)"><BwIcon name="chevron_right" :size="16" /></button>
          </span>
        </div>
        <div class="bw-menu-sep" />
        <button type="button" role="menuitem" class="bw-menu-item bw-danger" @mousedown="keepFocus" @click="run((id) => ed().deleteColumn(id))">
          <BwIcon name="delete" :size="17" />{{ m.tableCol.delete[0] }}<span class="bw-menu-en">{{ m.tableCol.delete[1] }}</span>
        </button>
      </div>
    </Popover>
    <Popover v-if="rowOpen" role="menu">
      <div class="bw-menu bw-table-menu">
        <button type="button" role="menuitem" class="bw-menu-item" @mousedown="keepFocus" @click="run((id) => ed().addRow(id, 'before'))">
          <BwIcon name="north" :size="17" class="bw-muted" />{{ m.tableRow.above[0] }}<span class="bw-menu-en">{{ m.tableRow.above[1] }}</span>
        </button>
        <button type="button" role="menuitem" class="bw-menu-item" @mousedown="keepFocus" @click="run((id) => ed().addRow(id, 'after'))">
          <BwIcon name="south" :size="17" class="bw-muted" />{{ m.tableRow.below[0] }}<span class="bw-menu-en">{{ m.tableRow.below[1] }}</span>
        </button>
        <div class="bw-menu-sep" />
        <button type="button" role="menuitem" class="bw-menu-item bw-danger" @mousedown="keepFocus" @click="run((id) => ed().deleteRow(id))">
          <BwIcon name="delete" :size="17" />{{ m.tableRow.delete[0] }}<span class="bw-menu-en">{{ m.tableRow.delete[1] }}</span>
        </button>
        <!-- On a phone the bar's 更多 holds the column actions too (there are no column handles). -->
        <template v-if="ctx.narrow.value">
          <div class="bw-menu-sep" />
          <button type="button" role="menuitem" class="bw-menu-item" @mousedown="keepFocus" @click="run((id) => ed().addColumn(id, 'before'))">
            <BwIcon name="west" :size="17" class="bw-muted" />{{ m.tableCol.left[0] }}<span class="bw-menu-en">{{ m.tableCol.left[1] }}</span>
          </button>
          <button type="button" role="menuitem" class="bw-menu-item" @mousedown="keepFocus" @click="run((id) => ed().addColumn(id, 'after'))">
            <BwIcon name="east" :size="17" class="bw-muted" />{{ m.tableCol.right[0] }}<span class="bw-menu-en">{{ m.tableCol.right[1] }}</span>
          </button>
          <button type="button" role="menuitem" class="bw-menu-item bw-danger" @mousedown="keepFocus" @click="run((id) => ed().deleteColumn(id))">
            <BwIcon name="delete" :size="17" />{{ m.tableCol.delete[0] }}<span class="bw-menu-en">{{ m.tableCol.delete[1] }}</span>
          </button>
        </template>
      </div>
    </Popover>
  </template>
</template>
