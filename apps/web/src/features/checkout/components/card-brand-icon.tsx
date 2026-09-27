import { CardBrand } from '@checkout/shared/enums';

interface CardBrandIconProps {
  brand: CardBrand | null;
}

// Minimal recognizable shapes, not a pixel-perfect logo reproduction (see
// specs/07-web-checkout.md#scope, Part 2). Driven by `detectCardBrand`, so
// nothing renders until enough digits place the number in a known range.
export function CardBrandIcon({ brand }: CardBrandIconProps) {
  if (brand === CardBrand.VISA) {
    return (
      <svg
        role="img"
        aria-label="VISA"
        viewBox="0 0 32 20"
        className="h-5 w-8"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="20" rx="3" fill="#1A1F71" />
        <text
          x="16"
          y="14"
          textAnchor="middle"
          fontSize="9"
          fontStyle="italic"
          fontWeight="700"
          fill="#FFFFFF"
        >
          VISA
        </text>
      </svg>
    );
  }

  if (brand === CardBrand.MASTERCARD) {
    return (
      <svg
        role="img"
        aria-label="Mastercard"
        viewBox="0 0 32 20"
        className="h-5 w-8"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="20" rx="3" fill="#FFFFFF" stroke="#CACACA" />
        <circle cx="13" cy="10" r="6" fill="#EB001B" />
        <circle cx="19" cy="10" r="6" fill="#F79E1B" fillOpacity="0.8" />
      </svg>
    );
  }

  return null;
}
