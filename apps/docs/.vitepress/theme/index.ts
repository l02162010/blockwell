import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import ApiTable from './ApiTable.vue';
import Demo from './Demo.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Demo', Demo);
    app.component('ApiTable', ApiTable);
  },
} satisfies Theme;
