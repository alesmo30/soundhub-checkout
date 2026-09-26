import { catalogHandlers } from './catalog.handlers';
import { locationsHandlers } from './locations.handlers';
import { quotesHandlers } from './quotes.handlers';

export const handlers = [...catalogHandlers, ...locationsHandlers, ...quotesHandlers];
