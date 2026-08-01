import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Dialog, DialogClose } from './Dialog';

const meta = {
  title: 'Базовые элементы/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  render: (args) => (
    <Dialog
      {...args}
      trigger={<Button>Открыть диагностику</Button>}
      footer={<><DialogClose asChild><Button>Отмена</Button></DialogClose><Button variant="primary">Подтвердить</Button></>}
    >
      <div className="grid gap-3 text-sm text-[#52697b]">
        <p className="m-0">Активных ошибок нет.</p>
        <p className="m-0">Связь с контроллером установлена.</p>
      </div>
    </Dialog>
  ),
  args: { title: 'Диагностика станка', description: 'Текущее состояние оборудования', children: null },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;
export const ОсновноеОкно: Story = {};
