import { useParams } from 'react-router';

export function TransactionPlaceholderPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="bg-canvas p-4">
      <p className="font-heading text-text-strong">Transacción {id} (placeholder)</p>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="bg-canvas p-4">
      <p className="font-heading text-text-strong">404 - Página no encontrada</p>
    </div>
  );
}
