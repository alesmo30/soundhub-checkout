import {
  customerReducer,
  forgetDetails,
  rememberDetails,
  selectRememberedDetails,
  type CustomerState,
  type RememberedContactDetails,
} from './customer.slice';

const DETAILS: RememberedContactDetails = {
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

function reduce(...actions: Parameters<typeof customerReducer>[1][]): CustomerState {
  return actions.reduce(customerReducer, customerReducer(undefined, { type: '@@init' }));
}

describe('customer slice', () => {
  it('starts with nothing remembered', () => {
    expect(reduce()).toEqual({ remembered: null });
  });

  it('rememberDetails stores the contact details', () => {
    expect(reduce(rememberDetails(DETAILS))).toEqual({ remembered: DETAILS });
  });

  it('forgetDetails clears the remembered contact details', () => {
    const state = reduce(rememberDetails(DETAILS), forgetDetails());

    expect(state).toEqual({ remembered: null });
  });
});

describe('customer selectors', () => {
  it('selectRememberedDetails returns what was remembered', () => {
    const customer = reduce(rememberDetails(DETAILS));

    expect(selectRememberedDetails({ customer })).toEqual(DETAILS);
  });

  it('selectRememberedDetails returns null when nothing was remembered', () => {
    expect(selectRememberedDetails({ customer: reduce() })).toBeNull();
  });
});
