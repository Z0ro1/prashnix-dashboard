'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  Trash2,
  Sparkles,
} from 'lucide-react';

export type DialogType = 'success' | 'error' | 'warning' | 'danger' | 'info';

export interface ToastItem {
  id: string;
  type: DialogType;
  title: string;
  message?: string;
}

export interface DialogOptions {
  type?: DialogType;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface FeedbackContextType {
  toast: (type: DialogType, title: string, message?: string) => void;
  confirm: (options: DialogOptions) => void;
  alert: (title: string, message: string | React.ReactNode, type?: DialogType) => void;
}

const FeedbackContext = createContext<FeedbackContextType | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  // Show a floating toast (auto closes after 4s)
  const toast = useCallback((type: DialogType, title: string, message?: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Show a confirm dialog
  const confirm = useCallback((options: DialogOptions) => {
    setDialog(options);
  }, []);

  // Show a modal alert (single OK button)
  const alertModal = useCallback(
    (title: string, message: string | React.ReactNode, type: DialogType = 'info') => {
      setDialog({
        title,
        message,
        type,
        confirmText: 'Got It',
        cancelText: undefined,
      });
    },
    []
  );

  const handleConfirm = async () => {
    if (!dialog) return;
    if (dialog.onConfirm) {
      try {
        setDialogLoading(true);
        await dialog.onConfirm();
      } finally {
        setDialogLoading(false);
      }
    }
    setDialog(null);
  };

  const handleCancel = () => {
    if (dialog?.onCancel) {
      dialog.onCancel();
    }
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm, alert: alertModal }}>
      {children}

      {/* --- FLOATING TOAST NOTIFICATIONS (Top-Right) --- */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error' || t.type === 'danger';
          const isWarning = t.type === 'warning';

          return (
            <div
              key={t.id}
              className={`pointer-events-auto p-4 rounded-2xl shadow-xl border flex items-start gap-3 transition-all duration-300 animate-in slide-in-from-top-3 fade-in bg-white ${
                isSuccess
                  ? 'border-emerald-200 text-emerald-950'
                  : isError
                  ? 'border-red-200 text-red-950'
                  : isWarning
                  ? 'border-amber-200 text-amber-950'
                  : 'border-indigo-200 text-indigo-950'
              }`}
            >
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  isSuccess
                    ? 'bg-emerald-100 text-emerald-700'
                    : isError
                    ? 'bg-red-100 text-red-700'
                    : isWarning
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {isSuccess && <CheckCircle2 size={18} />}
                {isError && <AlertCircle size={18} />}
                {isWarning && <AlertTriangle size={18} />}
                {!isSuccess && !isError && !isWarning && <Info size={18} />}
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                <div className="font-bold text-sm text-gray-900 leading-snug">{t.title}</div>
                {t.message && (
                  <div className="text-xs text-gray-500 mt-0.5 leading-relaxed break-words">
                    {t.message}
                  </div>
                )}
              </div>

              <button
                onClick={() => removeToast(t.id)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors shrink-0"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* --- PROPER CUSTOM MODAL DIALOG (Replaces window.confirm & alert) --- */}
      {dialog && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center flex flex-col items-center">
              {/* Animated Top Icon Circle */}
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-sm ${
                  dialog.isDestructive || dialog.type === 'danger' || dialog.type === 'error'
                    ? 'bg-red-100 text-red-600 ring-8 ring-red-50'
                    : dialog.type === 'success'
                    ? 'bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50'
                    : dialog.type === 'warning'
                    ? 'bg-amber-100 text-amber-600 ring-8 ring-amber-50'
                    : 'bg-indigo-100 text-indigo-600 ring-8 ring-indigo-50'
                }`}
              >
                {dialog.isDestructive || dialog.type === 'danger' || dialog.type === 'error' ? (
                  <Trash2 size={26} />
                ) : dialog.type === 'success' ? (
                  <Sparkles size={26} />
                ) : dialog.type === 'warning' ? (
                  <AlertTriangle size={26} />
                ) : (
                  <Info size={26} />
                )}
              </div>

              {/* Title & Body */}
              <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">
                {dialog.title}
              </h3>

              <div className="mt-2 text-sm text-gray-600 leading-relaxed max-h-60 overflow-y-auto px-1">
                {typeof dialog.message === 'string' ? (
                  <p className="whitespace-pre-line">{dialog.message}</p>
                ) : (
                  dialog.message
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3">
              {dialog.cancelText !== undefined && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={dialogLoading}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-colors shadow-sm"
                >
                  {dialog.cancelText || 'Cancel'}
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirm}
                disabled={dialogLoading}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-md ${
                  dialog.isDestructive || dialog.type === 'danger' || dialog.type === 'error'
                    ? 'bg-red-600 hover:bg-red-700 shadow-red-200'
                    : dialog.type === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                }`}
              >
                {dialogLoading ? 'Processing...' : dialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
}
