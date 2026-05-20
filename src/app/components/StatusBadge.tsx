interface StatusBadgeProps {
  status: "active" | "disabled" | "expired" | "paid" | "pending" | "overdue";
  children?: React.ReactNode;
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const styles = {
    active: "bg-green-100 text-green-700 border-green-200",
    disabled: "bg-gray-100 text-gray-700 border-gray-200",
    expired: "bg-red-100 text-red-700 border-red-200",
    paid: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    overdue: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}
    >
      {children || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
