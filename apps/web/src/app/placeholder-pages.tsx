import { useParams } from 'react-router';

import { useGetTempProductsQuery } from './temp-catalog-endpoint';

export function CatalogPlaceholderPage() {
  const { data } = useGetTempProductsQuery();

  return (
    <div>
      <p>Catálogo (placeholder)</p>
      {data ? <p>{data.meta.totalItems} products (mock)</p> : null}
    </div>
  );
}

export function ProductPlaceholderPage() {
  const { id } = useParams<{ id: string }>();

  return <div>Producto {id} (placeholder)</div>;
}

export function TransactionPlaceholderPage() {
  const { id } = useParams<{ id: string }>();

  return <div>Transacción {id} (placeholder)</div>;
}

export function NotFoundPage() {
  return <div>404 - Página no encontrada</div>;
}
