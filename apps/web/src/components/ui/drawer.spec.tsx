import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer';

function renderDrawer() {
  return render(
    <Drawer>
      <DrawerTrigger asChild>
        <Button>Abrir</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Título</DrawerTitle>
          <DrawerDescription>Descripción</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button>Cerrar</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>,
  );
}

describe('Drawer', () => {
  it('opens on trigger click and closes on Escape', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Descripción')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
