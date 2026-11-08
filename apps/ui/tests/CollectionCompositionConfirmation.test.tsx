import React from 'react';
import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CollectionCompositionConfirmation} from '@/components/library/sharing/CollectionCompositionConfirmation';
import type {useCollectionComposition} from '@/components/library/sharing/useCollectionComposition';
it('does not invent a zero-reader audience while a restored confirmation is being retried',()=>{
 const controller:ReturnType<typeof useCollectionComposition>={state:{key:'owner:collection',userId:'owner',collectionId:'11111111-1111-4111-8111-111111111111',status:'confirming',plan:null,intent:{userId:'owner',collectionId:'11111111-1111-4111-8111-111111111111',planId:'22222222-2222-4222-8222-222222222222',action:'add'},error:null},save:vi.fn(),confirm:vi.fn(),check:vi.fn(),resume:vi.fn(),cancel:vi.fn()};
 render(<CollectionCompositionConfirmation controller={controller} collectionName="Lesson" locale="en"/>);
 expect(screen.getByText('You confirmed this change, but its result could not be verified.')).toBeInTheDocument();
 expect(screen.queryByText(/Subscribers affected:/)).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Retry the confirmed change'})).toBeDisabled();
});
