import React from 'react';
import {expect,test,vi} from 'vitest';
import {render,screen,within} from '@testing-library/react';
import {PersonalCollectionRow} from '@/components/library/organization/PersonalCollections';
import type {WordListSummary} from '@/lib/types';

const collection:WordListSummary={id:'75600000-0000-4000-8000-000000000001',name:'My lesson',type:'user',item_count:2};
const actions={onOpen:vi.fn(),onDetails:vi.fn(),onMore:vi.fn()};

test('a private owned row exposes personal access without a redundant metadata line',()=>{
 render(<PersonalCollectionRow collection={{...collection,ownership:'owned',isShared:false}} locale="en" {...actions}/>);
 const row=screen.getByRole('article');
 expect(within(row).getByRole('button',{name:'My lesson'})).toBeInTheDocument();
 const access=within(row).getByLabelText('Personal');
 expect(access).toHaveAttribute('title','Personal');
 expect(access.querySelector('svg')).toHaveAttribute('aria-hidden','true');
 expect(row.querySelector('p')).toHaveTextContent(/^2 meanings$/);
 expect(within(row).queryByText('From another author')).not.toBeInTheDocument();
});

test('a shared owned row says shared by you rather than suggesting an incoming author',()=>{
 render(<PersonalCollectionRow collection={{...collection,ownership:'owned',isShared:true}} locale="en" {...actions}/>);
 const row=screen.getByRole('article');
 expect(within(row).getByLabelText('Shared by you')).toHaveAttribute('title','Shared by you');
 expect(row.querySelector('p')).toHaveTextContent(/^2 meanings$/);
 expect(within(row).queryByLabelText('From another author')).not.toBeInTheDocument();
});

test('a received row identifies another author without treating material or label names as that author',()=>{
 render(<PersonalCollectionRow collection={{...collection,name:'PR115 QA source',description:'A material description',ownership:'received',isShared:true}} names={['My label']} locale="en" {...actions}/>);
 const row=screen.getByRole('article');
 const access=within(row).getByLabelText('From another author');
 expect(access).toHaveAttribute('title','From another author');
 expect(access.querySelector('svg')).toHaveAttribute('aria-hidden','true');
 expect(within(row).getByRole('button',{name:'PR115 QA source'})).toBeInTheDocument();
 expect(row.querySelector('p')).toHaveTextContent(/^2 meanings · From another author · My label$/);
 expect(within(row).queryByLabelText('Shared by you')).not.toBeInTheDocument();
 expect(within(row).queryByLabelText('Personal')).not.toBeInTheDocument();
 expect(within(row).queryByText('A material description')).not.toBeInTheDocument();
});
