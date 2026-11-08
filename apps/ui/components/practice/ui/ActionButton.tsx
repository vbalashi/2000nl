'use client';
import React from 'react';
import s from './actionButton.module.css';
/** Compact dialog actions; visual height and touch target are independent. */
export function ActionButton({variant='quiet',className='',type='button',...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'quiet'}){
 return <button {...props} type={type} className={`${s.button} ${variant==='primary'?s.primary:s.quiet} ${className}`}/>;
}
