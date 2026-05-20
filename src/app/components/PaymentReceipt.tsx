import { CheckCircle, Download, X } from "lucide-react";
import { Button } from "./Button";

interface PaymentReceiptProps {
  isOpen: boolean;
  onClose: () => void;
  transactionData: {
    transactionId: string;
    amount: number;
    method: string;
    customer: string;
    date: string;
    invoiceNumber: string;
  };
}

export function PaymentReceipt({ isOpen, onClose, transactionData }: PaymentReceiptProps) {
  if (!isOpen) return null;

  const handleDownload = () => {
    alert("Receipt download feature - would generate PDF in production");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-gray-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Payment Receipt</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Success Icon */}
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h4 className="text-xl font-semibold text-gray-900 mb-2">Payment Successful!</h4>
          <p className="text-gray-600">Your payment has been processed successfully.</p>
        </div>

        {/* Transaction Details */}
        <div className="px-6 pb-6 space-y-3">
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Transaction ID:</span>
              <span className="font-medium text-gray-900">{transactionData.transactionId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Invoice Number:</span>
              <span className="font-medium text-gray-900">{transactionData.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Customer:</span>
              <span className="font-medium text-gray-900">{transactionData.customer}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Payment Method:</span>
              <span className="font-medium text-gray-900">{transactionData.method}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Date:</span>
              <span className="font-medium text-gray-900">{transactionData.date}</span>
            </div>
            <div className="flex justify-between pt-3 border-t border-gray-200">
              <span className="text-gray-900 font-semibold">Amount Paid:</span>
              <span className="text-xl font-bold text-green-600">৳{transactionData.amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <Button variant="secondary" className="flex-1" icon={Download} onClick={handleDownload}>
            Download Receipt
          </Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
