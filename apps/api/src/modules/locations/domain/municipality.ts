export interface Municipality {
  readonly code: string;
  readonly name: string;
  readonly departmentCode: string;
  readonly departmentName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly isMetroArea: boolean;
}
