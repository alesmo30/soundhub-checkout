import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DesignShowcasePage() {
  return (
    <div className="mx-auto max-w-content space-y-8 p-4 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-text-strong">Design showcase</h1>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold text-text-strong">Button</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button size="default">Default (56px)</Button>
          <Button size="compact">Compact (44px)</Button>
          <Button size="icon" aria-label="Icon button">
            +
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold text-text-strong">Badge</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant="success">En stock</Badge>
          <Badge variant="danger">Agotado</Badge>
          <Badge variant="neutral">Neutral</Badge>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold text-text-strong">Card</h2>
        <Card>
          <CardHeader>
            <CardTitle>WH-1000XM5</CardTitle>
          </CardHeader>
          <CardContent>Tarjeta de ejemplo con radio 16 y sombra card.</CardContent>
        </Card>
      </section>
    </div>
  );
}
