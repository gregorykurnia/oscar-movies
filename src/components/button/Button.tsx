import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "sm";

// Guide §7 Buttons: 40px (small 32px), radius 9, 14px 500 (small 13px), 16px icon, 8px gap.
const base =
  "relative inline-flex items-center justify-center gap-2 rounded-[9px] font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color] duration-[var(--dur-fast)] ease-app " +
  "outline-none focus-visible:shadow-focus [&_svg]:size-4 [&_svg]:shrink-0 " +
  "disabled:cursor-default disabled:border-transparent disabled:bg-track disabled:text-ink-faint";

const sizes: Record<ButtonSize, string> = {
  md: "h-10 text-small",
  sm: "h-8 text-caption",
};

// Sides: 16px (small 12px); ghost buttons sit closer to their text (10px).
function padding(variant: ButtonVariant, size: ButtonSize): string {
  if (variant === "ghost") return "px-2.5";
  return size === "md" ? "px-4" : "px-3";
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-gold-ink text-on-gold enabled:hover:bg-gold-ink-hover",
  secondary: "border border-line bg-surface text-ink enabled:hover:border-line-strong",
  ghost: "text-ink enabled:hover:bg-track",
};

// Loading: the label goes transparent (keeping the width) and a 16px ring spins in its place.
// The ring's right side keeps currentColor, which is transparent here: that's the gap that turns.
const spinner =
  "!text-transparent after:absolute after:size-4 after:rounded-full after:border-2 " +
  "after:animate-spin after:content-['']";
const spinnerColour: Record<ButtonVariant, string> = {
  primary: "after:border-t-on-gold after:border-b-on-gold after:border-l-on-gold",
  secondary: "after:border-t-ink after:border-b-ink after:border-l-ink",
  ghost: "after:border-t-ink after:border-b-ink after:border-l-ink",
};

/** Class names for a button look, for links that act as buttons ("Go to the race"). */
export function buttonClasses({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
} = {}): string {
  return cn(
    base,
    sizes[size],
    padding(variant, size),
    variants[variant],
    loading && spinner,
    loading && spinnerColour[variant],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the spinner, hides the label (still read out) and blocks clicks. */
  loading?: boolean;
};

/** Primary (at most one per screen), secondary or ghost button. Labels are verbs (guide §11). */
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  type = "button",
  disabled,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={buttonClasses({ variant, size, loading, className })}
      {...rest}
    >
      {children}
    </button>
  );
}
