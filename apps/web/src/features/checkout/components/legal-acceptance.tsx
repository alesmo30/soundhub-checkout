import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';

export interface LegalAcceptanceProps {
  isLoading: boolean;
  isError: boolean;
  onRefetch: () => void;
  termsUrl: string | undefined;
  personalDataUrl: string | undefined;
  acceptedTerms: boolean;
  onAcceptedTermsChange: (checked: boolean) => void;
  acceptedPersonalData: boolean;
  onAcceptedPersonalDataChange: (checked: boolean) => void;
}

// The acceptance tokens are single-use, so the query that backs this is
// refetched fresh every time 2b mounts (see specs/07-web-checkout.md
// #endpoints); this component only renders what that query returned.
export function LegalAcceptance({
  isLoading,
  isError,
  onRefetch,
  termsUrl,
  personalDataUrl,
  acceptedTerms,
  onAcceptedTermsChange,
  acceptedPersonalData,
  onAcceptedPersonalDataChange,
}: LegalAcceptanceProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  if (isError || !termsUrl || !personalDataUrl) {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-sm font-semibold text-danger">
          No pudimos cargar los términos y condiciones.
        </p>
        <Button type="button" variant="secondary" size="compact" onClick={onRefetch} className="self-start">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* `aria-labelledby` (not `<label htmlFor>`) on purpose: a native
          label forwards a click anywhere in it — link included — to its
          control, which would toggle the checkbox on top of the link
          navigating. This still gives the checkbox its full accessible
          name without that double click. */}
      <div className="flex items-start gap-3">
        <Checkbox
          id="accept-terms"
          aria-labelledby="accept-terms-label"
          className="mt-0.5"
          checked={acceptedTerms}
          onCheckedChange={(checked) => onAcceptedTermsChange(checked === true)}
        />
        <span id="accept-terms-label" className="text-sm text-text">
          Acepto los{' '}
          <a
            href={termsUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-forest underline underline-offset-4"
          >
            términos y condiciones
          </a>
        </span>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="accept-personal-data"
          aria-labelledby="accept-personal-data-label"
          className="mt-0.5"
          checked={acceptedPersonalData}
          onCheckedChange={(checked) => onAcceptedPersonalDataChange(checked === true)}
        />
        <span id="accept-personal-data-label" className="text-sm text-text">
          Autorizo el{' '}
          <a
            href={personalDataUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-forest underline underline-offset-4"
          >
            tratamiento de mis datos personales
          </a>
        </span>
      </div>
    </div>
  );
}
