import { LucideIcon } from "lucide-react";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: LucideIcon;
  className?: string;
  disabled?: boolean;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  icon: Icon,
  className = "",
  disabled = false,
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const variantStyles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-gray-700 hover:bg-gray-100",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}
