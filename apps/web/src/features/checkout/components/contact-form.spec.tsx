import { screen, waitFor } from '@testing-library/react';
import { VALIDATION_MESSAGES } from '@checkout/shared/validation';

import { renderWithProviders } from '@/test/render-with-providers';

import { ContactForm } from './contact-form';

beforeAll(() => {
  // Radix Select needs these in jsdom (see components/ui/select.spec.tsx).
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.scrollIntoView = jest.fn();
});

function renderContactForm() {
  return renderWithProviders(<ContactForm />);
}

async function selectOption(
  user: ReturnType<typeof renderContactForm>['user'],
  label: string,
  optionName: string,
) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

describe('ContactForm', () => {
  it('shows one validation message per field, linked with aria-describedby', async () => {
    const { user } = renderContactForm();

    // Tabbing into and out of each field, leaving it empty, is enough to
    // surface its own message: the form validates onBlur as well as
    // onChange, so a field a user visited and left blank is flagged even
    // without typing in it.
    screen.getByLabelText('Nombre completo').focus();
    const fieldsInTabOrder = [
      ['Nombre completo', VALIDATION_MESSAGES.FULL_NAME_REQUIRED],
      ['Cédula', VALIDATION_MESSAGES.DOCUMENT_NUMBER_INVALID],
      ['Correo', VALIDATION_MESSAGES.EMAIL_INVALID],
      ['Celular', VALIDATION_MESSAGES.PHONE_INVALID],
      ['Departamento', VALIDATION_MESSAGES.DEPARTMENT_REQUIRED],
      // The municipality select is disabled (no department chosen), so it
      // is skipped in tab order; it is not part of this pass.
      ['Dirección', VALIDATION_MESSAGES.ADDRESS_LINE_REQUIRED],
    ] as const;

    for (const [label] of fieldsInTabOrder) {
      expect(screen.getByLabelText(label)).toHaveFocus();
      await user.tab();
    }

    for (const [label, message] of fieldsInTabOrder) {
      const field = screen.getByLabelText(label);
      const describedBy = field.getAttribute('aria-describedby') ?? '';
      const messageId = describedBy.split(' ').find((id) => id.endsWith('-form-item-message'));

      expect(messageId).toBeDefined();
      await waitFor(() => expect(document.getElementById(messageId!)).toHaveTextContent(message));
    }
  });

  it("disables the municipality select until a department is chosen, then loads that department's list", async () => {
    const { user } = renderContactForm();

    expect(screen.getByRole('combobox', { name: 'Municipio' })).toBeDisabled();

    await selectOption(user, 'Departamento', 'Antioquia');

    expect(screen.getByRole('combobox', { name: 'Municipio' })).toBeEnabled();

    await user.click(screen.getByRole('combobox', { name: 'Municipio' }));

    expect(await screen.findByRole('option', { name: 'Medellín' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Envigado' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rionegro' })).toBeInTheDocument();
  });

  it('resets the municipality when the department changes', async () => {
    const { user } = renderContactForm();

    await selectOption(user, 'Departamento', 'Antioquia');
    await selectOption(user, 'Municipio', 'Medellín');

    expect(screen.getByRole('combobox', { name: 'Municipio' })).toHaveTextContent('Medellín');

    await selectOption(user, 'Departamento', 'Bogotá D.C.');

    expect(screen.getByRole('combobox', { name: 'Municipio' })).not.toHaveTextContent('Medellín');

    await user.click(screen.getByRole('combobox', { name: 'Municipio' }));
    expect(await screen.findByRole('option', { name: 'Bogotá' })).toBeInTheDocument();
  });

  it('dispatches setQuoteMunicipality when a municipality is chosen', async () => {
    const { user, store } = renderContactForm();

    await selectOption(user, 'Departamento', 'Antioquia');
    await selectOption(user, 'Municipio', 'Medellín');

    expect(store.getState().checkoutSession.quoteMunicipalityCode).toBe('05001');
  });

  it('disables "Continuar" until the form is valid', async () => {
    const { user } = renderContactForm();
    const submit = screen.getByRole('button', { name: 'Continuar' });

    await waitFor(() => expect(submit).toBeDisabled());

    await user.type(screen.getByLabelText('Nombre completo'), 'Juana Pérez');
    await user.type(screen.getByLabelText('Cédula'), '1020304050');
    await user.type(screen.getByLabelText('Correo'), 'juana@example.com');
    await user.type(screen.getByLabelText('Celular'), '3001234567');
    await user.type(screen.getByLabelText('Dirección'), 'Calle 10 # 20-30');
    await selectOption(user, 'Departamento', 'Antioquia');
    await selectOption(user, 'Municipio', 'Medellín');

    await waitFor(() => expect(submit).toBeEnabled());
  });

  it('saves the contact details on submit', async () => {
    const { user, store } = renderContactForm();

    await user.type(screen.getByLabelText('Nombre completo'), 'Juana Pérez');
    await user.type(screen.getByLabelText('Cédula'), '1020304050');
    await user.type(screen.getByLabelText('Correo'), 'juana@example.com');
    await user.type(screen.getByLabelText('Celular'), '3001234567');
    await user.type(screen.getByLabelText('Dirección'), 'Calle 10 # 20-30');
    await selectOption(user, 'Departamento', 'Antioquia');
    await selectOption(user, 'Municipio', 'Medellín');

    const submit = screen.getByRole('button', { name: 'Continuar' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(store.getState().checkoutSession.contact).toEqual({
      customer: {
        documentNumber: '1020304050',
        fullName: 'Juana Pérez',
        email: 'juana@example.com',
        phone: '3001234567',
      },
      address: {
        departmentCode: '05',
        municipalityCode: '05001',
        addressLine: 'Calle 10 # 20-30',
        addressDetail: '',
      },
    });
  });
});
