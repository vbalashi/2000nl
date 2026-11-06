export const MAX_SNAPSHOT_BYTES: number;
export function canonicalJson(value: unknown): string;
export function parameters(text: string): string;
export function catalogShape(value: unknown): unknown;
export function catalogErrors(source: unknown, target: unknown, prefix?: string): Array<{key:string;status:string}>;
export function validRegistry(registry: unknown): boolean;
export function snapshotPayload(snapshot: {formatVersion: number; contract: string; registry: unknown; catalogs: unknown}): unknown;
export function validSnapshot(value: unknown, source: unknown, contract: string): boolean;
