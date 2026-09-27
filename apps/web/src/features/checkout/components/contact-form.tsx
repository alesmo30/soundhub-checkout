import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { forgetDetails, rememberDetails, selectRememberedDetails } from '@/features/customer';

import {
  clearCheckoutSession,
  saveContact,
  selectSessionContact,
  setQuoteMunicipality,
} from '../checkout-session.slice';
import { selectContactDetails } from '../checkout.selectors';
import { goToStep } from '../checkout.slice';
import { useGetDepartmentsQuery, useGetMunicipalitiesQuery } from '../checkout.api';
import { contactFormSchema, type ContactDetails } from '../lib/contact-details';
import { RememberedBanner } from './remembered-banner';

const EMPTY_CONTACT_DETAILS: ContactDetails = {
  customer: { documentNumber: '', fullName: '', email: '', phone: '' },
  address: { departmentCode: '', municipalityCode: '', addressLine: '', addressDetail: '' },
};

// The recipient is always the customer (see specs/07-web-checkout.md#decisions),
// so this form has no separate recipient section: `contactFormSchema` already
// drops `recipientName`/`phone` from the delivery schema.
export function ContactForm() {
  const dispatch = useAppDispatch();
  const contactDetails = useAppSelector(selectContactDetails);
  const sessionContact = useAppSelector(selectSessionContact);
  const rememberedDetails = useAppSelector(selectRememberedDetails);
  // The banner (and the checkbox's own default) fire only when the form was
  // pre-filled from `customer.remembered`, not from a session that already
  // holds `contact` this same visit (see specs/07-web-checkout.md, UI rules
  // > Remembered banner).
  const isPrefilledFromRemembered = sessionContact === null && rememberedDetails !== null;
  const [rememberMe, setRememberMe] = useState(isPrefilledFromRemembered);
  const form = useForm<ContactDetails>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: contactDetails ?? EMPTY_CONTACT_DETAILS,
    // Both onChange, so "Continuar" reacts as the user types, and onBlur,
    // so leaving a field empty (including a select left untouched) shows
    // its message too.
    mode: 'all',
  });

  const departmentCode = useWatch({ control: form.control, name: 'address.departmentCode' });
  const { data: departments = [] } = useGetDepartmentsQuery();
  const { data: municipalities = [], isFetching: isLoadingMunicipalities } =
    useGetMunicipalitiesQuery(departmentCode, { skip: !departmentCode });

  // Changing department invalidates whatever municipality was chosen (see
  // specs/07-web-checkout.md#ui-rules, Contact form row).
  function handleDepartmentChange(value: string) {
    form.setValue('address.departmentCode', value, { shouldValidate: true });
    form.setValue('address.municipalityCode', '', { shouldValidate: true });
  }

  // This is what feeds the amount box: the quote is fetched as soon as a
  // municipality is chosen (see specs/07-web-checkout.md#endpoints).
  function handleMunicipalityChange(value: string) {
    form.setValue('address.municipalityCode', value, { shouldValidate: true });
    dispatch(setQuoteMunicipality(value));
  }

  // `forgetDetails` also resets the whole `checkoutSession` (see its
  // extraReducers): dispatching it before `saveContact` means an unchecked
  // "Recordarme" clears any previous remembered value without wiping out
  // the contact details this same submit is about to save.
  function onSubmit(values: ContactDetails) {
    if (rememberMe) {
      dispatch(rememberDetails(values));
    } else {
      dispatch(forgetDetails());
    }
    dispatch(saveContact(values));
    dispatch(goToStep('CARD'));
  }

  function handleForget() {
    dispatch(forgetDetails());
    dispatch(clearCheckoutSession());
    form.reset(EMPTY_CONTACT_DETAILS);
    setRememberMe(false);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-6"
        noValidate
      >
        {isPrefilledFromRemembered && (
          <RememberedBanner
            fullName={contactDetails?.customer.fullName ?? ''}
            onForget={handleForget}
          />
        )}

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-xl font-bold text-text-strong">Tus datos</h2>

          <FormField
            control={form.control}
            name="customer.fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre completo</FormLabel>
                <FormControl>
                  <Input placeholder="Ingresa tu nombre completo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="customer.documentNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cédula</FormLabel>
                <FormControl>
                  <Input placeholder="Ingresa tu cédula" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="customer.email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Correo</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Ingresa tu correo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="customer.phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Celular</FormLabel>
                <div className="flex h-11 items-center gap-2 rounded-input border border-input bg-surface px-3 has-[input:disabled]:opacity-40">
                  <span className="shrink-0 text-base text-text">+57</span>
                  <FormControl>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="Ingresa tu celular"
                      className="h-full w-full min-w-0 border-0 bg-transparent p-0 text-base text-ink outline-none placeholder:text-text disabled:cursor-not-allowed"
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-xl font-bold text-text-strong">Entrega</h2>

          <FormField
            control={form.control}
            name="address.departmentCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Departamento</FormLabel>
                <Select value={field.value} onValueChange={handleDepartmentChange}>
                  <FormControl>
                    <SelectTrigger className="w-full" onBlur={field.onBlur}>
                      <SelectValue placeholder="Selecciona un departamento" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {departments.map((department) => (
                      <SelectItem key={department.code} value={department.code}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address.municipalityCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Municipio</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={handleMunicipalityChange}
                  disabled={!departmentCode || isLoadingMunicipalities}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" onBlur={field.onBlur}>
                      <SelectValue placeholder="Selecciona un municipio" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {municipalities.map((municipality) => (
                      <SelectItem key={municipality.code} value={municipality.code}>
                        {municipality.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address.addressLine"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dirección</FormLabel>
                <FormControl>
                  <Input placeholder="Ingresa tu dirección" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address.addressDetail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Complemento (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Ingresa apto, torre o referencia" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <div className="flex items-center gap-3">
          <Checkbox
            id="remember-me"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked === true)}
          />
          <Label htmlFor="remember-me">Recordarme en este dispositivo</Label>
        </div>

        <Button type="submit" disabled={!form.formState.isValid} className="self-end">
          Continuar
        </Button>
      </form>
    </Form>
  );
}
