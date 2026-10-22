import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** The top bar's 40px icon buttons (menu, search, close): track fill on hover, 18px icon. */
export function IconButton({ className, ...rest }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-10 flex-none place-items-center rounded-[9px] text-ink outline-none",
        "transition-colors duration-[var(--dur-fast)] ease-app enabled:hover:bg-track focus-visible:shadow-focus",
        "disabled:cursor-default [&_svg]:size-[18px]",
        className,
      )}
      {...rest}
    />
  );
}
