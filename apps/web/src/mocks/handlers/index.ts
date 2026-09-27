import { catalogHandlers } from './catalog.handlers';
import { customersHandlers } from './customers.handlers';
import { deliveriesHandlers } from './deliveries.handlers';
import { locationsHandlers } from './locations.handlers';
import { paymentGatewayHandlers } from './payment-gateway.handlers';
import { quotesHandlers } from './quotes.handlers';
import { transactionsHandlers } from './transactions.handlers';

export const handlers = [
  ...catalogHandlers,
  ...locationsHandlers,
  ...quotesHandlers,
  ...customersHandlers,
  ...transactionsHandlers,
  ...deliveriesHandlers,
  ...paymentGatewayHandlers,
];
