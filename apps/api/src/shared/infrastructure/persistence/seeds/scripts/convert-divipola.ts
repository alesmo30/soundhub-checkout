import { writeFileSync } from 'node:fs';

import { parse } from 'csv-parse/sync';

// DIVIPOLA geolocated municipalities, DANE via datos.gov.co (Socrata).
// $limit is required: Socrata caps unbounded requests at 1000 rows, and
// this dataset has ~1,122.
const DATASET_URL = 'https://www.datos.gov.co/resource/gdxc-w37w.csv?$limit=50000';
const OUTPUT_PATH = 'src/shared/infrastructure/persistence/seeds/data/municipalities.json';

const REQUIRED_COLUMNS = [
  'cod_dpto',
  'dpto',
  'cod_mpio',
  'nom_mpio',
  'longitud',
  'latitud',
] as const;

const METRO_AREA_CODES = new Set([
  '05001', // Medellín
  '05088', // Bello
  '05360', // Itagüí
  '05266', // Envigado
  '05631', // Sabaneta
  '05380', // La Estrella
  '05129', // Caldas
  '05212', // Copacabana
  '05308', // Girardota
  '05079', // Barbosa
]);

interface Municipality {
  code: string;
  name: string;
  departmentCode: string;
  departmentName: string;
  latitude: number;
  longitude: number;
  isMetroArea: boolean;
}

// The dataset uses a comma as the decimal separator.
function toNumber(value: string): number {
  return Number(value.replace(',', '.'));
}

async function fetchCsv(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download the DIVIPOLA dataset: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

function assertRequiredColumns(row: Record<string, string>): void {
  for (const column of REQUIRED_COLUMNS) {
    if (!(column in row)) {
      throw new Error(`DIVIPOLA dataset is missing required column "${column}"`);
    }
  }
}

function requireField(row: Record<string, string>, column: string, rowNumber: number): string {
  const value = row[column];

  if (value === undefined) {
    throw new Error(`Row ${rowNumber}: missing column "${column}"`);
  }

  return value;
}

function toMunicipality(row: Record<string, string>, rowNumber: number): Municipality {
  const code = requireField(row, 'cod_mpio', rowNumber);
  const departmentCode = requireField(row, 'cod_dpto', rowNumber);
  const name = requireField(row, 'nom_mpio', rowNumber);
  const departmentName = requireField(row, 'dpto', rowNumber);
  const rawLatitude = requireField(row, 'latitud', rowNumber);
  const rawLongitude = requireField(row, 'longitud', rowNumber);
  const latitude = toNumber(rawLatitude);
  const longitude = toNumber(rawLongitude);

  if (!/^[0-9]{5}$/.test(code)) {
    throw new Error(`Row ${rowNumber}: invalid municipality code "${code}"`);
  }
  if (!/^[0-9]{2}$/.test(departmentCode)) {
    throw new Error(`Row ${rowNumber}: invalid department code "${departmentCode}"`);
  }
  if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`Row ${rowNumber}: invalid latitude "${rawLatitude}"`);
  }
  if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Row ${rowNumber}: invalid longitude "${rawLongitude}"`);
  }

  return {
    code,
    name,
    departmentCode,
    departmentName,
    latitude,
    longitude,
    isMetroArea: METRO_AREA_CODES.has(code),
  };
}

async function main(): Promise<void> {
  const csv = await fetchCsv(DATASET_URL);
  const rows: Array<Record<string, string>> = parse(csv, { columns: true, skip_empty_lines: true });

  const [firstRow] = rows;
  if (!firstRow) {
    throw new Error('DIVIPOLA dataset returned no rows');
  }
  assertRequiredColumns(firstRow);

  const municipalities = rows
    .map((row, index) => toMunicipality(row, index + 1))
    .sort((a, b) => a.code.localeCompare(b.code));

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(municipalities, null, 2)}\n`);

  const metroCount = municipalities.filter((municipality) => municipality.isMetroArea).length;
  console.log(
    `Wrote ${municipalities.length} municipalities (${metroCount} metro area) to ${OUTPUT_PATH}`,
  );
}

void main();
