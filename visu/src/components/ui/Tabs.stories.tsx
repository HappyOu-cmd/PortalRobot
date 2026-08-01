import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

const meta = {
  title: 'Базовые элементы/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  render: () => (
    <Tabs defaultValue="status" className="w-[520px]">
      <TabsList>
        <TabsTrigger value="status">Состояние</TabsTrigger>
        <TabsTrigger value="commands">Команды</TabsTrigger>
        <TabsTrigger value="diagnostics">Диагностика</TabsTrigger>
      </TabsList>
      <TabsContent value="status" className="text-sm text-[#52697b]">Приводы включены, робот готов.</TabsContent>
      <TabsContent value="commands" className="text-sm text-[#52697b]">Ручные команды оборудования.</TabsContent>
      <TabsContent value="diagnostics" className="text-sm text-[#52697b]">Активных ошибок нет.</TabsContent>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;
export const ОсновныеРазделы: Story = {};
