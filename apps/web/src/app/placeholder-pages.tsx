import { useParams } from 'react-router';

export function CatalogPlaceholderPage() {
  return <div>Catálogo (placeholder)</div>;
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
