import { NavLink as RouterNavLink, NavLinkProps, Link, useLocation } from "react-router-dom";
import { forwardRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, ...props }, ref) => {
    return (
      <RouterNavLink
        ref={ref}
        to={to}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

// ── Header nav link ─────────────────────────────────────────

interface HeaderNavLinkProps {
  to: string;
  label: string;
  icon?: ReactNode;
}

function HeaderNavLink({ to, label, icon }: HeaderNavLinkProps) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary/20 text-primary-foreground'
          : 'text-secondary-foreground/70 hover:text-secondary-foreground hover:bg-secondary-foreground/10'
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

export { NavLink, HeaderNavLink };
