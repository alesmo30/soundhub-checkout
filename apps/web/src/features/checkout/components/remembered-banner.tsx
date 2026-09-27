import { Button } from '@/components/ui/button';

interface RememberedBannerProps {
  fullName: string;
  onForget: () => void;
}

// Shown only when the form was pre-filled from `customer.remembered`, not
// from an in-progress session already holding `contact` this same visit
// (see specs/07-web-checkout.md, UI rules > Remembered banner).
export function RememberedBanner({ fullName, onForget }: RememberedBannerProps) {
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-border-subtle bg-paper px-4 py-3 text-sm text-text">
      <span>Hola, {firstName}. ¿No eres tú?</span>
      <Button type="button" variant="link" size="compact" onClick={onForget}>
        Olvidar mis datos
      </Button>
    </div>
  );
}
