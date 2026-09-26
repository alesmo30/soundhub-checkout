export interface UpsertCustomerRequest {
  documentNumber: string;
  fullName: string;
  email: string;
  phone: string;
}

export interface Customer extends UpsertCustomerRequest {
  id: string;
}
