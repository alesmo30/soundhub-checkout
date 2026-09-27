import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LegalAcceptance, type LegalAcceptanceProps } from './legal-acceptance';

const BASE_PROPS: LegalAcceptanceProps = {
  isLoading: false,
  isError: false,
  onRefetch: jest.fn(),
  termsUrl: 'https://example.test/terms-and-conditions',
  personalDataUrl: 'https://example.test/personal-data-auth',
  acceptedTerms: false,
  onAcceptedTermsChange: jest.fn(),
  acceptedPersonalData: false,
  onAcceptedPersonalDataChange: jest.fn(),
};

describe('LegalAcceptance', () => {
  it('renders both checkboxes linking to termsUrl and personalDataUrl in a new tab', () => {
    render(<LegalAcceptance {...BASE_PROPS} />);

    expect(screen.getByRole('checkbox', { name: /términos y condiciones/ })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /tratamiento de mis datos personales/ }),
    ).toBeInTheDocument();

    const termsLink = screen.getByRole('link', { name: 'términos y condiciones' });
    expect(termsLink).toHaveAttribute('href', BASE_PROPS.termsUrl);
    expect(termsLink).toHaveAttribute('target', '_blank');

    const personalDataLink = screen.getByRole('link', {
      name: 'tratamiento de mis datos personales',
    });
    expect(personalDataLink).toHaveAttribute('href', BASE_PROPS.personalDataUrl);
    expect(personalDataLink).toHaveAttribute('target', '_blank');
  });

  it('shows a skeleton while loading', () => {
    render(<LegalAcceptance {...BASE_PROPS} isLoading />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows an error and calls onRefetch from "Reintentar"', async () => {
    const onRefetch = jest.fn();
    const user = userEvent.setup();
    render(
      <LegalAcceptance
        {...BASE_PROPS}
        isError
        termsUrl={undefined}
        personalDataUrl={undefined}
        onRefetch={onRefetch}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No pudimos cargar los términos y condiciones.',
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it('clicking a link does not toggle its checkbox', async () => {
    const onAcceptedTermsChange = jest.fn();
    const onAcceptedPersonalDataChange = jest.fn();
    const user = userEvent.setup();
    render(
      <LegalAcceptance
        {...BASE_PROPS}
        onAcceptedTermsChange={onAcceptedTermsChange}
        onAcceptedPersonalDataChange={onAcceptedPersonalDataChange}
      />,
    );

    await user.click(screen.getByRole('link', { name: 'términos y condiciones' }));
    await user.click(screen.getByRole('link', { name: 'tratamiento de mis datos personales' }));

    expect(onAcceptedTermsChange).not.toHaveBeenCalled();
    expect(onAcceptedPersonalDataChange).not.toHaveBeenCalled();
  });

  it('reports each checkbox toggle through its own callback', async () => {
    const onAcceptedTermsChange = jest.fn();
    const onAcceptedPersonalDataChange = jest.fn();
    const user = userEvent.setup();
    render(
      <LegalAcceptance
        {...BASE_PROPS}
        onAcceptedTermsChange={onAcceptedTermsChange}
        onAcceptedPersonalDataChange={onAcceptedPersonalDataChange}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /términos y condiciones/ }));
    expect(onAcceptedTermsChange).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('checkbox', { name: /tratamiento de mis datos personales/ }));
    expect(onAcceptedPersonalDataChange).toHaveBeenCalledWith(true);
  });
});
