import type { Preview } from '@storybook/react-vite';
import '../src/tailwind.css';
import '../src/theme.css';
import '../src/styles.css';

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
