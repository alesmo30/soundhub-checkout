import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from './button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './form';
import { Input } from './input';

const schema = z.object({
  email: z.string().min(1, 'Ingresa un correo válido'),
});

function TestForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void form.handleSubmit(() => undefined)(event)} noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Enviar</Button>
      </form>
    </Form>
  );
}

describe('Form', () => {
  it('shows the validation message linked to the input via aria-describedby on submit', async () => {
    const user = userEvent.setup();
    render(<TestForm />);

    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const message = await screen.findByText('Ingresa un correo válido');
    const input = screen.getByLabelText('Correo');

    expect(input.getAttribute('aria-describedby')).toContain(message.id);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
