import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { cardSchema, detectCardBrand, type CardFormValues } from '@checkout/shared/validation';
import { INSTALLMENTS_MAX, INSTALLMENTS_MIN } from '@checkout/shared/constants';

import { useAppDispatch } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { goToStep } from '../checkout.slice';
import { TEST_MODE_NOTE } from '../checkout.constants';
import { useCardTokenization } from '../hooks/use-card-tokenization';
import { CardBrandIcon } from './card-brand-icon';
import { GatewayError } from './gateway-error';
import { LegalAcceptance } from './legal-acceptance';
import { digitsOnly, formatCardNumber, formatExpiry } from '../lib/masks';

const CVC_MAX_DIGITS = 3;
const EMPTY_CARD: CardFormValues = {
  holder: '',
  number: '',
  expiry: '',
  cvc: '',
  installments: INSTALLMENTS_MIN,
};

function installmentLabel(count: number): string {
  return count === 1 ? '1 cuota' : `${count} cuotas`;
}

const INSTALLMENT_OPTIONS = Array.from(
  { length: INSTALLMENTS_MAX - INSTALLMENTS_MIN + 1 },
  (_, index) => INSTALLMENTS_MIN + index,
);

// The typed card lives in this component's own local form state and is
// lost once it unmounts, which is what leaving CARD does today (see
// checkout-dialog.tsx's step switch) — the spec's own wording ("it keeps
// the typed card only while 2b stays mounted") already expects that. The
// number and CVC never leave this local state: `tokenization.submit` calls
// `tokenizeCard` (a plain fetch, never RTK Query) and only its `{ token,
// brand, last4 }` result is ever dispatched (see
// specs/07-web-checkout.md#decisions, Gateway).
export function CardForm() {
  const dispatch = useAppDispatch();
  const form = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: EMPTY_CARD,
    mode: 'all',
  });
  const tokenization = useCardTokenization();

  const numberValue = useWatch({ control: form.control, name: 'number' });
  const brand = detectCardBrand(digitsOnly(numberValue ?? ''));

  function handleVolver() {
    dispatch(goToStep('CONTACT'));
  }

  function onSubmit(values: CardFormValues) {
    // `form.handleSubmit` only re-checks `cardSchema`; the legal checkboxes
    // and the terms load are a separate gate a keyboard submit could
    // otherwise bypass (the button itself is only one way to fire this).
    if (!tokenization.canSubmit || tokenization.isTokenizing) {
      return;
    }

    void tokenization.submit(values);
  }

  const canSubmit = form.formState.isValid && tokenization.canSubmit && !tokenization.isTokenizing;

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-6"
        noValidate
      >
        <h2 className="font-heading text-xl font-bold text-text-strong">Datos de tu tarjeta</h2>

        <p className="rounded-panel border border-border-subtle bg-canvas p-3 text-xs text-text">
          {TEST_MODE_NOTE}
        </p>

        <FormField
          control={form.control}
          name="number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de tarjeta</FormLabel>
              <div className="relative">
                <FormControl>
                  <Input
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="Ingresa el número de tu tarjeta"
                    className="pr-14"
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) => field.onChange(formatCardNumber(event.target.value))}
                  />
                </FormControl>
                {brand && (
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <CardBrandIcon brand={brand} />
                  </span>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="holder"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre en la tarjeta</FormLabel>
              <FormControl>
                <Input placeholder="Ingresa el nombre como aparece en la tarjeta" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="expiry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>MM/AA</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/AA"
                    maxLength={5}
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) => field.onChange(formatExpiry(event.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cvc"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CVC</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    maxLength={CVC_MAX_DIGITS}
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) =>
                      field.onChange(digitsOnly(event.target.value).slice(0, CVC_MAX_DIGITS))
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="installments"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cuotas</FormLabel>
              <Select
                value={String(field.value)}
                onValueChange={(value) => field.onChange(Number(value))}
              >
                <FormControl>
                  <SelectTrigger className="w-full" onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {INSTALLMENT_OPTIONS.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {installmentLabel(count)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <LegalAcceptance
          isLoading={tokenization.isTermsLoading}
          isError={tokenization.isTermsError}
          onRefetch={tokenization.refetchTerms}
          termsUrl={tokenization.termsUrl}
          personalDataUrl={tokenization.personalDataUrl}
          acceptedTerms={tokenization.acceptedTerms}
          onAcceptedTermsChange={tokenization.setAcceptedTerms}
          acceptedPersonalData={tokenization.acceptedPersonalData}
          onAcceptedPersonalDataChange={tokenization.setAcceptedPersonalData}
        />

        <GatewayError reason={tokenization.gatewayError} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="secondary" onClick={handleVolver}>
            Volver
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {tokenization.isTokenizing ? 'Validando tarjeta…' : 'Continuar'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
