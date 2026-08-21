import { SECTOR_GROUPS, STANDALONE_SECTORS } from "./navigation";

export interface SectorOption {
  label: string;
  subsectors: readonly string[];
}

/**
 * Hierarquia usada no cadastro de usuários.
 * Derivada da navegação para não duplicar a estrutura: incluir um setor
 * ou subsetor em `navigation.ts` já o disponibiliza aqui.
 */
export const SECTOR_TREE: readonly SectorOption[] = [
  ...SECTOR_GROUPS.map((group) => ({
    label: group.label,
    subsectors: group.items.map((item) => item.label),
  })),
  ...STANDALONE_SECTORS.map((sector) => ({
    label: sector.label,
    subsectors: [] as readonly string[],
  })),
];

export const SECTOR_LABELS: readonly string[] = SECTOR_TREE.map((sector) => sector.label);

export function getSubsectors(sectorLabel: string): readonly string[] {
  return SECTOR_TREE.find((sector) => sector.label === sectorLabel)?.subsectors ?? [];
}
