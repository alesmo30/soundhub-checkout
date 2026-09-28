import {
  checkoutReducer,
  closeCheckout,
  goToStep,
  resetCheckout,
  selectCheckoutProductId,
  selectCheckoutStep,
  selectIsCheckoutOpen,
  selectQuantityFor,
  setQuantity,
  startCheckout,
  type CheckoutState,
} from './checkout.slice';

const PRODUCT_ID = 'product-a';
const OTHER_PRODUCT_ID = 'product-b';

function reduce(...actions: Parameters<typeof checkoutReducer>[1][]): CheckoutState {
  return actions.reduce(checkoutReducer, checkoutReducer(undefined, { type: '@@init' }));
}

describe('checkout slice', () => {
  it('starts with no product, quantity 1, the dialog closed and step CONTACT', () => {
    expect(reduce()).toEqual({
      productId: null,
      quantity: 1,
      isDialogOpen: false,
      step: 'CONTACT',
    });
  });

  it('setQuantity stores the product and quantity without opening the dialog', () => {
    expect(reduce(setQuantity({ productId: PRODUCT_ID, quantity: 3 }))).toEqual({
      productId: PRODUCT_ID,
      quantity: 3,
      isDialogOpen: false,
      step: 'CONTACT',
    });
  });

  it.each([0, -2, 0.5])('never stores a quantity below 1 (got %p)', (quantity) => {
    expect(reduce(setQuantity({ productId: PRODUCT_ID, quantity })).quantity).toBe(1);
    expect(reduce(startCheckout({ productId: PRODUCT_ID, quantity })).quantity).toBe(1);
  });

  it('startCheckout stores the product and quantity and opens the dialog', () => {
    expect(reduce(startCheckout({ productId: PRODUCT_ID, quantity: 2 }))).toEqual({
      productId: PRODUCT_ID,
      quantity: 2,
      isDialogOpen: true,
      step: 'CONTACT',
    });
  });

  it('closeCheckout closes the dialog but keeps the product, quantity and step', () => {
    const state = reduce(
      startCheckout({ productId: PRODUCT_ID, quantity: 4 }),
      goToStep('CARD'),
      closeCheckout(),
    );

    expect(state).toEqual({
      productId: PRODUCT_ID,
      quantity: 4,
      isDialogOpen: false,
      step: 'CARD',
    });
  });

  it('goToStep moves the persisted step', () => {
    expect(reduce(goToStep('CARD')).step).toBe('CARD');
    expect(reduce(goToStep('CARD'), goToStep('SUMMARY')).step).toBe('SUMMARY');
  });

  it('resetCheckout returns to the initial state', () => {
    const state = reduce(
      startCheckout({ productId: PRODUCT_ID, quantity: 4 }),
      goToStep('SUMMARY'),
      resetCheckout(),
    );

    expect(state).toEqual({
      productId: null,
      quantity: 1,
      isDialogOpen: false,
      step: 'CONTACT',
    });
  });
});

describe('checkout selectors', () => {
  it('selectQuantityFor returns the saved quantity for the same product', () => {
    const checkout = reduce(setQuantity({ productId: PRODUCT_ID, quantity: 5 }));

    expect(selectQuantityFor({ checkout }, PRODUCT_ID)).toBe(5);
  });

  it('selectQuantityFor returns 1 for another product', () => {
    const checkout = reduce(setQuantity({ productId: PRODUCT_ID, quantity: 5 }));

    expect(selectQuantityFor({ checkout }, OTHER_PRODUCT_ID)).toBe(1);
  });

  it('selectIsCheckoutOpen follows startCheckout and closeCheckout', () => {
    const opened = reduce(startCheckout({ productId: PRODUCT_ID, quantity: 1 }));

    expect(selectIsCheckoutOpen({ checkout: opened })).toBe(true);
    expect(selectIsCheckoutOpen({ checkout: reduce() })).toBe(false);
  });

  it('selectCheckoutProductId returns the product the checkout belongs to', () => {
    const started = reduce(startCheckout({ productId: PRODUCT_ID, quantity: 1 }));

    expect(selectCheckoutProductId({ checkout: started })).toBe(PRODUCT_ID);
    expect(selectCheckoutProductId({ checkout: reduce() })).toBeNull();
  });

  it('selectCheckoutStep returns the persisted step', () => {
    expect(selectCheckoutStep({ checkout: reduce() })).toBe('CONTACT');
    expect(selectCheckoutStep({ checkout: reduce(goToStep('CARD')) })).toBe('CARD');
  });
});
