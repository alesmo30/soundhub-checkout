import {
  customerReducer,
  rememberDetails,
  type RememberedContactDetails,
} from '@/features/customer';

import { checkoutSessionReducer, saveContact, setQuoteMunicipality } from './checkout-session.slice';
import { selectContactDetails, selectQuoteMunicipality } from './checkout.selectors';
import type { ContactDetails } from './lib/contact-details';

const CONTACT: ContactDetails = {
  customer: {
    documentNumber: '1234567890',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '3001234567',
  },
  address: {
    departmentCode: '05',
    municipalityCode: '05001',
    addressLine: 'Calle 1 # 2-3',
  },
};

const REMEMBERED: RememberedContactDetails = {
  customer: {
    documentNumber: '9876543210',
    fullName: 'Grace Hopper',
    email: 'grace@example.com',
    phone: '3009876543',
  },
  address: {
    departmentCode: '11',
    municipalityCode: '11001',
    addressLine: 'Carrera 9 # 10-11',
  },
};

const EMPTY_SESSION = checkoutSessionReducer(undefined, { type: '@@init' });
const EMPTY_CUSTOMER = customerReducer(undefined, { type: '@@init' });

describe('selectContactDetails', () => {
  it('returns null when there is neither a session contact nor a remembered one', () => {
    expect(selectContactDetails({ checkoutSession: EMPTY_SESSION, customer: EMPTY_CUSTOMER })).toBeNull();
  });

  it('falls back to the remembered customer when the session has no contact yet', () => {
    const customer = customerReducer(EMPTY_CUSTOMER, rememberDetails(REMEMBERED));

    expect(selectContactDetails({ checkoutSession: EMPTY_SESSION, customer })).toEqual(REMEMBERED);
  });

  it('prefers the in-progress session contact over the remembered one', () => {
    const checkoutSession = checkoutSessionReducer(EMPTY_SESSION, saveContact(CONTACT));
    const customer = customerReducer(EMPTY_CUSTOMER, rememberDetails(REMEMBERED));

    expect(selectContactDetails({ checkoutSession, customer })).toEqual(CONTACT);
  });
});

describe('selectQuoteMunicipality', () => {
  it('returns null with nothing chosen yet', () => {
    expect(
      selectQuoteMunicipality({ checkoutSession: EMPTY_SESSION, customer: EMPTY_CUSTOMER }),
    ).toBeNull();
  });

  it('prefers the municipality explicitly chosen for the quote', () => {
    const checkoutSession = checkoutSessionReducer(
      checkoutSessionReducer(EMPTY_SESSION, saveContact(CONTACT)),
      setQuoteMunicipality('05001'),
    );

    expect(
      selectQuoteMunicipality({ checkoutSession, customer: EMPTY_CUSTOMER }),
    ).toBe('05001');
  });

  it('falls back to the contact details address when no municipality was explicitly chosen', () => {
    const checkoutSession = checkoutSessionReducer(EMPTY_SESSION, saveContact(CONTACT));

    expect(
      selectQuoteMunicipality({ checkoutSession, customer: EMPTY_CUSTOMER }),
    ).toBe(CONTACT.address.municipalityCode);
  });
});
