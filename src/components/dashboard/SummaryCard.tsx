import { Loader2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SummaryCardProps {
  title: string;
  value: number;
  subtitle?: string;
  secondaryText?: string;
  icon: LucideIcon;
  variant?: "default" | "success" | "warning" | "danger";
  trend?: {
    value: number;
    label: string;
  };
  isLoading?: boolean;
}

const variantStyles = {
  default: "gradient-primary",
  success: "gradient-success",
  warning: "gradient-warning",
  danger: "gradient-danger",
};

export function SummaryCard({
  title,
  value,
  subtitle,
  secondaryText,
  icon: Icon,
  variant = "default",
  trend,
  isLoading = false,
}: SummaryCardProps) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-card shadow-card animate-fade-in">
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <div className="mt-2 flex h-9 items-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <p className="mt-2 text-3xl font-bold tracking-tight text-card-foreground">
                {value.toLocaleString()}
              </p>
            )}
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            {secondaryText ? (
              <p className="mt-2 text-xs font-medium text-muted-foreground">{secondaryText}</p>
            ) : null}
            {trend ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {trend.value > 0 ? "+" : ""}
                {trend.value} {trend.label}
              </p>
            ) : null}
          </div>
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-lg",
              variantStyles[variant],
            )}
          >
            <Icon className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
      </div>
      <div className={cn("absolute bottom-0 left-0 h-1 w-full", variantStyles[variant])} />
    </div>
  );
}
