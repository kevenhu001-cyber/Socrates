import { Input as V3Input, type InputProps } from '../v3';

function Input({ className, ...props }: InputProps) {
  return <V3Input data-slot="input" className={className} {...props} />;
}

export { Input };
