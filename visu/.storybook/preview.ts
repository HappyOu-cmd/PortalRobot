import type { Preview } from '@storybook/react-vite';
import '../src/styles/tailwind.css';
import '../src/styles/theme.css';
import '../src/styles/global.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: { expanded: true },
    a11y: { test: 'todo' },
    backgrounds: {
      default: 'Панель HMI',
      values: [
        { name: 'Панель HMI', value: '#f3f7fa' },
        { name: 'Белый', value: '#ffffff' },
      ],
    },
  },
};

export default preview;
