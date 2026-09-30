import {expect,test} from 'vitest';
import {textSizes,textSizeStyles,normalizeTextSize} from '@/lib/reading/textScale';

test('reading content grows faster than UI and large headwords at each enlarged setting',()=>{
 const base=textSizeStyles('standard');
 for(const size of textSizes.slice(1)){
  const vars=textSizeStyles(size.id);
  const ratio=(key:`--${string}`)=>parseFloat(vars[key])/parseFloat(base[key]);
  expect(ratio('--practice-reading-small')).toBeGreaterThan(ratio('--practice-text-body'));
  expect(ratio('--practice-text-body')).toBeGreaterThan(ratio('--practice-text-display'));
  expect(ratio('--practice-reading-small')).toBeCloseTo(ratio('--practice-definition-size'));
 }
 expect(textSizeStyles('extra')['--practice-reading-small']).toBe('1.625rem');
});
test('legacy and invalid values have explicit migration behavior',()=>{
 expect(normalizeTextSize('normal')).toBe('standard');
 expect(normalizeTextSize('largest')).toBe('large');
 expect(normalizeTextSize('extra')).toBe('extra');
 expect(normalizeTextSize(null)).toBe('standard');
});

test('stored size IDs adapt explicitly and propagate through nested theme aliases', async()=>{
 const {accountTextSize,accountTextSizeStyles}=await import('@/lib/reading/textScale');
 expect(accountTextSize).toEqual({normal:'standard',large:'larger',largest:'large',extra:'extra'});
 const styles=accountTextSizeStyles('largest');
 expect(styles['--account-practice-text-body']).toBe(styles['--practice-text-body']);
 expect(styles['--account-practice-reading-definition']).toBe('1.875rem');
});
