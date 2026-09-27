import { Badge } from '@/components/ui/badge';

export function TestModeBanner() {
  return (
    <div
      className="flex items-center justify-center py-1"
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, var(--color-danger), var(--color-danger) 10px, var(--color-surface) 10px, var(--color-surface) 20px)',
      }}
    >
      <Badge variant="danger">MODO DE PRUEBAS</Badge>
    </div>
  );
}
