import { useState } from 'react';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';

/** Server's own disk: a few seconds is already unusual. */
export const DEFAULT_UPLOAD_DELAY_BASE_MS = 5000;
export const DEFAULT_UPLOAD_DELAY_PER_MB_MS = 2000;

export interface UploadDelayNotice {
  baseMs?: number;
  perMbMs?: number;
}

/**
 * How long an upload may take before the delay warning appears.
 *
 * The defaults are tuned for storage on the server's own disk. Object storage
 * puts a second network hop between the request and the stored file, so a
 * deployment on S3-compatible storage can raise these rather than warn about
 * every ordinary upload — a warning that fires routinely stops being read.
 */
export const determineDelay = (fileSize: number, notice?: UploadDelayNotice): number => {
  const baseDelay = notice?.baseMs ?? DEFAULT_UPLOAD_DELAY_BASE_MS;
  const perMb = notice?.perMbMs ?? DEFAULT_UPLOAD_DELAY_PER_MB_MS;
  return baseDelay + Math.floor(fileSize / 1000000) * perMb;
};

export const useDelayedUploadToast = (notice?: UploadDelayNotice) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [uploadTimers, setUploadTimers] = useState<Record<string, NodeJS.Timeout>>({});

  const startUploadTimer = (fileId: string, fileName: string, fileSize: number) => {
    const delay = determineDelay(fileSize, notice);

    if (uploadTimers[fileId]) {
      clearTimeout(uploadTimers[fileId]);
    }

    const timer = setTimeout(() => {
      const message = localize('com_ui_upload_delay', { 0: fileName });
      showToast({
        message,
        status: 'warning',
        duration: 10000,
      });
    }, delay);

    setUploadTimers((prev) => ({ ...prev, [fileId]: timer }));
  };

  const clearUploadTimer = (fileId: string) => {
    if (uploadTimers[fileId]) {
      clearTimeout(uploadTimers[fileId]);
      setUploadTimers((prev) => {
        const { [fileId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  return { startUploadTimer, clearUploadTimer };
};
