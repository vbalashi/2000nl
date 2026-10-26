import contract from "../../../../packages/shared/deployment/db-contract.json";

type ContractMetadata = {
  contractId: string;
  baseline: { migrationId: number };
  migrations: ReadonlyArray<{ migrationId: number }>;
};

/** A fresh public baseline may have no forward migrations yet. */
export function resolveExpectedDbContract(metadata: ContractMetadata) {
  const migrationId = metadata.migrations.at(-1)?.migrationId ?? metadata.baseline.migrationId;
  if (!Number.isSafeInteger(migrationId) || migrationId < 1) {
    throw new Error("The checked-out DB contract has no expected migration");
  }
  return Object.freeze({ contractId: metadata.contractId, migrationId });
}

export const expectedDbContract = resolveExpectedDbContract(contract);
