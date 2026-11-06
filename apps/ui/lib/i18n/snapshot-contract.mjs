// Shared by publishing tools, the server and the browser. No Node dependencies.
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const parameters = text => [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map(match => match[1]).sort().join(',');
export function catalogShape(value) {
  if (typeof value === 'string') return ['text', !!value.trim(), parameters(value)];
  if (Array.isArray(value)) return value.map(catalogShape);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, catalogShape(value[key])]));
  return value;
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function catalogErrors(source, target, prefix = '', errors = []) {
  if (typeof source === 'string') {
    if (typeof target !== 'string') errors.push({key:prefix,status:'missing'});
    else if (target.length > 32768) errors.push({key:prefix,status:'oversized'});
    else if (source.trim() && !target.trim()) errors.push({key:prefix,status:'blank'});
    else if (parameters(source) !== parameters(target)) errors.push({key:prefix,status:'parameters'});
  } else if (source === null || typeof source !== 'object') {
    if (source !== target) errors.push({key:prefix,status:'shape'});
  } else if (!target || typeof target !== 'object' || Array.isArray(source) !== Array.isArray(target)) errors.push({key:prefix,status:'shape'});
  else {
    for (const [key, value] of Object.entries(source)) {
      if (!own(target,key)) errors.push({key:prefix ? `${prefix}.${key}` : key,status:'missing'});
      else catalogErrors(value,target[key],prefix ? `${prefix}.${key}` : key,errors);
    }
    for (const key of Object.keys(target)) if (!own(source,key) || ['__proto__','constructor','prototype'].includes(key)) errors.push({key:prefix ? `${prefix}.${key}` : key,status:'extra'});
  }
  return errors;
}
export function validRegistry(registry) {
  if (!record(registry) || !own(registry,'en') || Object.keys(registry).length > 32) return false;
  return Object.entries(registry).every(([code, value]) => {
    if (!/^[a-z]{2,3}$/.test(code) || !record(value) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || !['ltr','rtl'].includes(value.direction)) return false;
    if (Object.keys(value).some(key => !['name','direction','formatLocale'].includes(key))) return false;
    try { return value.formatLocale === undefined || (typeof value.formatLocale === 'string' && value.formatLocale.length < 80 && Intl.getCanonicalLocales(value.formatLocale).length === 1); } catch { return false; }
  });
}
export function snapshotPayload(snapshot) {
  return {formatVersion:snapshot.formatVersion,contract:snapshot.contract,registry:snapshot.registry,catalogs:snapshot.catalogs};
}
export function validSnapshot(value, source, contract) {
  if (!record(value) || value.formatVersion !== 1 || value.contract !== contract || !/^[a-f0-9]{64}$/.test(value.revision) || !validRegistry(value.registry) || !record(value.catalogs)) return false;
  if (Object.keys(value).some(key => !['formatVersion','contract','revision','registry','catalogs'].includes(key))) return false;
  const codes = Object.keys(value.registry);
  return Object.keys(value.catalogs).length === codes.length && codes.every(code => own(value.catalogs,code) && catalogErrors(source,value.catalogs[code]).length === 0);
}
