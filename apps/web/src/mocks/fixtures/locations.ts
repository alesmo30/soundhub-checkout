import type { Department, Municipality } from '@checkout/shared/contracts';

export const departments: Department[] = [
  { code: '05', name: 'Antioquia' },
  { code: '11', name: 'Bogotá D.C.' },
  { code: '76', name: 'Valle del Cauca' },
];

export const municipalitiesByDepartment: Record<string, Municipality[]> = {
  '05': [
    { code: '05001', name: 'Medellín', isMetroArea: true },
    { code: '05266', name: 'Envigado', isMetroArea: true },
    { code: '05615', name: 'Rionegro', isMetroArea: false },
  ],
  '11': [{ code: '11001', name: 'Bogotá', isMetroArea: false }],
  '76': [{ code: '76001', name: 'Cali', isMetroArea: false }],
};
