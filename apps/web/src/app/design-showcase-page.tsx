import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { DesignShowcaseSampleForm } from './design-showcase-sample-form';

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

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold text-text-strong">Select</h2>
        <Select defaultValue="medellin">
          <SelectTrigger className="w-64" aria-label="Municipio">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="medellin">Medellín</SelectItem>
            <SelectItem value="envigado">Envigado</SelectItem>
            <SelectItem value="rionegro">Rionegro</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold text-text-strong">Checkbox</h2>
        <div className="flex items-center gap-2">
          <Checkbox id="terms" />
          <Label htmlFor="terms">Acepto los términos y condiciones</Label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold text-text-strong">Form</h2>
        <DesignShowcaseSampleForm />
      </section>
    </div>
  );
}
