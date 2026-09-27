import { contactFormSchema, toDeliveryValues, type ContactDetails } from './contact-details';

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

describe('toDeliveryValues', () => {
  it('copies the customer name and phone into the recipient fields', () => {
    expect(toDeliveryValues(CONTACT)).toEqual({
      departmentCode: '05',
      municipalityCode: '05001',
      addressLine: 'Calle 1 # 2-3',
      recipientName: 'Ada Lovelace',
      phone: '3001234567',
    });
  });

  it('keeps an optional address detail', () => {
    const withDetail: ContactDetails = {
      ...CONTACT,
      address: { ...CONTACT.address, addressDetail: 'Apto 402' },
    };

    expect(toDeliveryValues(withDetail).addressDetail).toBe('Apto 402');
  });
});

describe('contactFormSchema', () => {
  it('accepts a valid contact', () => {
    expect(contactFormSchema.safeParse(CONTACT).success).toBe(true);
  });

  it('rejects an invalid document number', () => {
    const invalid = { ...CONTACT, customer: { ...CONTACT.customer, documentNumber: 'abc' } };

    expect(contactFormSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects an invalid municipality code', () => {
    const invalid = { ...CONTACT, address: { ...CONTACT.address, municipalityCode: '1' } };

    expect(contactFormSchema.safeParse(invalid).success).toBe(false);
  });

  it('has no recipientName or phone fields in the address section', () => {
    expect(contactFormSchema.shape.address.shape).not.toHaveProperty('recipientName');
    expect(contactFormSchema.shape.address.shape).not.toHaveProperty('phone');
  });
});
