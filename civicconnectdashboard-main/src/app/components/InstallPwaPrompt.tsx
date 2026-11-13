import { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare, Smartphone, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 1. Detect if already installed as PWA
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    // 2. Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isAppleDevice);

    // 3. Check localStorage for dismissal
    const wasDismissed = sessionStorage.getItem('cc_pwa_dismissed');
    if (wasDismissed) {
      setDismissed(true);
    }

    // 4. Capture beforeinstallprompt for Android / Chrome / Edge
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Make sure banner shows if prompt is available
      setDismissed(false);
    };

    // 5. App installed listener
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      toast.success('🎉 App installed successfully! You can now launch it from your home screen.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Trigger installation
  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        toast.success('Installing CivicConnect App...');
      }
      setDeferredPrompt(null);
    } else {
      // Fallback instructions for unsupported or desktop browsers
      toast.info('To install: Tap your browser menu (⋮ or Share) and select "Install app" or "Add to Home Screen".');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('cc_pwa_dismissed', 'true');
  };

  // If already standalone or user dismissed, don't show the sticky banner
  if (isStandalone || dismissed) {
    return (
      <AnimatePresence>
        {showIOSModal && (
          <IOSInstallModal onClose={() => setShowIOSModal(false)} />
        )}
      </AnimatePresence>
    );
  }

  return (
    <>
      <motion.div
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -80, opacity: 0 }}
        className="fixed top-2 left-2 right-2 max-w-md mx-auto z-50 pointer-events-auto"
      >
        <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-3 shadow-2xl border border-slate-700/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-white shrink-0 shadow-sm font-black text-xs">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black tracking-tight text-white flex items-center gap-1.5 truncate">
                Install Mobile App
                <span className="px-1.5 py-0.2 bg-emerald-500 text-slate-950 text-[9px] font-black rounded-full uppercase">PWA</span>
              </h4>
              <p className="text-[11px] text-slate-300 truncate">Add to phone home screen for offline & fast alerts</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showIOSModal && (
          <IOSInstallModal onClose={() => setShowIOSModal(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

function IOSInstallModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 50, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 50, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100"
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center text-white">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-black text-base">Install on iPhone</h3>
              <p className="text-xs text-gray-400 font-medium">Add to your Home Screen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs text-gray-700">
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold">
              1
            </div>
            <div className="flex-1">
              <p className="font-bold text-black mb-0.5">Tap the Share button</p>
              <p className="text-gray-500 flex items-center gap-1">
                At the bottom of your Safari screen, tap the <Share className="w-3.5 h-3.5 text-blue-600 inline" /> icon.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold">
              2
            </div>
            <div className="flex-1">
              <p className="font-bold text-black mb-0.5">Select "Add to Home Screen"</p>
              <p className="text-gray-500 flex items-center gap-1">
                Scroll down and tap <PlusSquare className="w-3.5 h-3.5 text-black inline" /> <b>Add to Home Screen</b>.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-2xl">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold">
              3
            </div>
            <div className="flex-1">
              <p className="font-bold text-black mb-0.5">Confirm & Launch</p>
              <p className="text-gray-500">
                Tap <b>Add</b> in the top right. The app will install onto your home screen!
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 py-3 bg-black hover:bg-zinc-800 text-white rounded-xl font-bold text-xs transition-colors"
        >
          Got It
        </button>
      </motion.div>
    </motion.div>
  );
}
