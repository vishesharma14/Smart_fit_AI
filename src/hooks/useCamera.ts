import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  cameraUnavailableReason,
  countVideoInputs,
  requestCameraStream,
  stopCameraStream,
  toCameraErrorKind,
} from '../services/camera';
import type { CameraErrorKind, CameraStatus, FacingMode } from '../types/scan';

export interface UseCamera {
  /** Attach to the <video> element that shows the preview. Keep it mounted. */
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: CameraErrorKind | null;
  facingMode: FacingMode;
  /** True when the device reports more than one camera. */
  canSwitch: boolean;
  /** Requests permission (if needed) and starts the preview. Also used for retry. */
  start: () => void;
  /** Stops the stream and turns the camera off. */
  stop: () => void;
  switchCamera: () => void;
}

/**
 * Camera lifecycle: permission request, preview, switching, errors and
 * cleanup. The stream is always stopped when the component unmounts, so the
 * camera never stays on after leaving the page.
 */
export function useCamera(): UseCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Incremented on every start/stop/unmount so a slow permission prompt can't revive a stale stream.
  const requestIdRef = useRef(0);

  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<CameraErrorKind | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [canSwitch, setCanSwitch] = useState(false);

  const release = useCallback(() => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startWith = useCallback(
    async (mode: FacingMode) => {
      const requestId = ++requestIdRef.current;
      release();

      const unavailable = cameraUnavailableReason();
      if (unavailable) {
        setError(unavailable);
        setStatus('error');
        return;
      }

      setError(null);
      setStatus('requesting');
      try {
        const stream = await requestCameraStream(mode);
        if (requestId !== requestIdRef.current) {
          stopCameraStream(stream);
          return;
        }
        streamRef.current = stream;
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          // Camera unplugged, revoked, or taken by another app.
          if (streamRef.current !== stream) return;
          release();
          setError('ended');
          setStatus('error');
        });
        setFacingMode(mode);
        setStatus('active');
        const cameras = await countVideoInputs();
        if (requestId === requestIdRef.current) setCanSwitch(cameras > 1);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(toCameraErrorKind(err));
        setStatus('error');
      }
    },
    [release],
  );

  const start = useCallback(() => void startWith(facingMode), [startWith, facingMode]);

  const switchCamera = useCallback(
    () => void startWith(facingMode === 'user' ? 'environment' : 'user'),
    [startWith, facingMode],
  );

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    release();
    setError(null);
    setStatus('idle');
  }, [release]);

  // Show the stream once both it and the <video> element exist.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (status !== 'active' || !video || !stream || video.srcObject === stream) return;
    video.srcObject = stream;
    video.play().catch(() => {
      // Autoplay can be refused; the muted inline video normally plays, and the stream stays valid either way.
    });
  }, [status, facingMode]);

  // Always turn the camera off when leaving the page.
  useEffect(
    () => () => {
      requestIdRef.current += 1;
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    },
    [],
  );

  return { videoRef, status, error, facingMode, canSwitch, start, stop, switchCamera };
}
