import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from 'cn';

function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default';
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch relative inline-flex shrink-0 items-center rounded-full border-0 p-0 transition-colors duration-150 after:absolute after:inset-x-[calc((100%-var(--ui-control-touch))/2)] after:inset-y-[calc((100%-var(--ui-control-touch))/2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive h-(--ui-control-badge) data-[size=default]:w-(--ui-switch-width) data-[size=sm]:w-(--ui-switch-width-sm) data-checked:bg-primary data-unchecked:bg-input data-unchecked:hover:bg-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none absolute start-(--ui-switch-inset) top-(--ui-switch-inset) size-(--ui-switch-thumb) rounded-full bg-background ring-0 transition-transform duration-150 group-data-[size=default]/switch:data-checked:translate-x-[calc(var(--ui-switch-width)-var(--ui-switch-thumb)-2*var(--ui-switch-inset))] group-data-[size=sm]/switch:data-checked:translate-x-[calc(var(--ui-switch-width-sm)-var(--ui-switch-thumb)-2*var(--ui-switch-inset))] rtl:group-data-[size=default]/switch:data-checked:-translate-x-[calc(var(--ui-switch-width)-var(--ui-switch-thumb)-2*var(--ui-switch-inset))] rtl:group-data-[size=sm]/switch:data-checked:-translate-x-[calc(var(--ui-switch-width-sm)-var(--ui-switch-thumb)-2*var(--ui-switch-inset))] motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
