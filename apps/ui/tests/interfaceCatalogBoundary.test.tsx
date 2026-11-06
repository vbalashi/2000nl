import React from 'react';
import {act,render,screen} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {expect,test,vi} from 'vitest';
let ready:()=>void;
const initialization=vi.hoisted(()=>({initialize:vi.fn()}));
vi.mock('@/lib/i18n/clientSnapshot',()=>({initializeInterfaceSnapshot:initialization.initialize}));
import {InterfaceCatalogBoundary} from '@/components/system/InterfaceCatalogBoundary';
import Page from '@/app/page';
test('SSR retains the existing startup shell while runtime language data is unresolved',()=>{
 const html=renderToString(<Page/>);expect(html).toContain('training-bootstrap-shell');expect(html).toContain('aria-label="Preparing training"');
});
test('preference readers mount only after the snapshot is ready and stay mounted across parent renders',async()=>{
 initialization.initialize.mockReturnValue(new Promise<void>(resolve=>{ready=resolve;}));
 const mounted=vi.fn();function Consumer(){React.useEffect(()=>{mounted();},[]);return <button>Current screen</button>;}
 const view=render(<InterfaceCatalogBoundary fallback={<span>Preparing fixture</span>}><Consumer/></InterfaceCatalogBoundary>);
 expect(screen.getByText('Preparing fixture')).toBeInTheDocument();expect(mounted).not.toHaveBeenCalled();
 await act(async()=>ready());expect(screen.getByRole('button',{name:'Current screen'})).toBeInTheDocument();expect(mounted).toHaveBeenCalledOnce();
 view.rerender(<InterfaceCatalogBoundary><Consumer/></InterfaceCatalogBoundary>);expect(mounted).toHaveBeenCalledOnce();
});
