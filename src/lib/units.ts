export interface UnitAddress {
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  /** Complemento, quando houver. */
  complement?: string;
}

export interface UnitRecord {
  label: string;
  address: UnitAddress | null;
}

/**
 * Unidades e lojas da empresa, com endereço vinculado.
 * Fonte única: cadastro de usuários, ponto de partida dos chamados
 * de Motoristas e filtros do dashboard de TI.
 */
export const UNIT_RECORDS: readonly UnitRecord[] = [
  {
    label: "Unidade 1",
    address: {
      street: "Rua 58",
      number: "700 C",
      district: "Prefeito José Walter",
      city: "Fortaleza",
      state: "CE",
    },
  },
  {
    label: "Unidade 2",
    address: {
      street: "Rua 87",
      number: "280",
      district: "Prefeito José Walter",
      city: "Fortaleza",
      state: "CE",
    },
  },
  {
    label: "Unidade 3",
    address: {
      street: "Avenida E",
      number: "780",
      district: "Prefeito José Walter",
      city: "Fortaleza",
      state: "CE",
    },
  },
  {
    label: "Unidade 4",
    address: {
      street: "Avenida N",
      number: "1251",
      district: "Prefeito José Walter",
      city: "Fortaleza",
      state: "CE",
    },
  },
  // Sem endereço cadastrado: cai em preenchimento manual.
  { label: "Refeitório", address: null },
  {
    label: "OKEY Store (Iguatemi)",
    address: {
      street: "Av. Washington Soares",
      number: "85",
      district: "Edson Queiroz",
      city: "Fortaleza",
      state: "CE",
    },
  },
  {
    label: "Lov Club (Centro Fashion)",
    address: {
      street: "Av. Filomeno Gomes",
      number: "430",
      district: "Jacarecanga",
      city: "Fortaleza",
      state: "CE",
    },
  },
  {
    label: "OKEY Store (São Paulo)",
    address: {
      street: "Rua Ribeiro de Lima",
      number: "681",
      district: "Bom Retiro",
      city: "São Paulo",
      state: "SP",
      complement: "Sala 42, 4º Andar",
    },
  },
];

export const UNITS: readonly string[] = UNIT_RECORDS.map((unit) => unit.label);

/** Valor sentinela do ponto de partida livre. */
export const OTHER_OPTION = "Outro";

/** Lista de partida: unidades cadastradas + opção manual ao final. */
export const DEPARTURE_OPTIONS: readonly string[] = [...UNITS, OTHER_OPTION];

export function getUnitAddress(label: string): UnitAddress | null {
  return UNIT_RECORDS.find((unit) => unit.label === label)?.address ?? null;
}

/** Endereço em uma linha, para exibição. */
export function formatAddress(address: UnitAddress): string {
  const base = `${address.street}, nº ${address.number}`;
  const extra = address.complement ? `, ${address.complement}` : "";
  return `${base}${extra} — ${address.district}, ${address.city} - ${address.state}`;
}
