import contract from "../../../../packages/shared/deployment/db-contract.json";

const expectedMigration = contract.migrations.at(-1)?.migrationId;

if (!Number.isSafeInteger(expectedMigration)) {
  throw new Error("The checked-out DB contract has no expected migration");
}

export const expectedDbContract = Object.freeze({
  contractId: contract.contractId,
  migrationId: expectedMigration as number,
});
