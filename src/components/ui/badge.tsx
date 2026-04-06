import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary/15 text-primary",
        secondary: "border-white/10 bg-white/5 text-muted-foreground",
        destructive: "border-destructive/20 bg-destructive/15 text-destructive",
        outline: "border-white/10 text-foreground",
        success: "border-success/20 bg-success/15 text-success",
        warning: "border-warning/20 bg-warning/15 text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
