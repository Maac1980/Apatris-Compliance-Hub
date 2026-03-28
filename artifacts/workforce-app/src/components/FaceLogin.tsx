import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Loader2, CheckCircle2, AlertCircle, ScanFace } from "lucide-react";
import { cn } from "@/lib/utils";
import * as faceapi from "face-api.js";

const API_BASE = "/api";

interface FaceLoginProps {
  onSuccess: (data: { name: string; role: string; jwt: string }) => void;
  onCancel: () => void;
}

type Status = "loading-models" | "ready" | "scanning" | "verifying" | "success" | "error";

export function FaceLogin({ onSuccess, onCancel }: FaceLoginProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("loading-models");
  const [message, setMessage] = useState("Loading face detection models…");
  const [matchedName, setMatchedName] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const scanIntervalRef = useRef<number | null>(null);

  // Load face-api models
  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      try {
        const modelPath = `${import.meta.env.BASE_URL}models`;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
          faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
          faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
        ]);
        if (!cancelled) {
          setStatus("ready");
          setMessage("Position your face in the frame");
          startCamera();
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Failed to load face detection models");
        }
      }
    }

    loadModels();
    return () => { cancelled = true; };
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setStatus("error");
      setMessage("Camera access denied. Please allow camera permissions.");
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Start scanning for faces once camera is ready
  const handleVideoPlay = useCallback(() => {
    if (status !== "ready") return;
    setStatus("scanning");
    setMessage("Looking for your face…");

    scanIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;

      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) return;

      // Draw face detection overlay
      const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
      const resized = faceapi.resizeResults(detection, dims);
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        // Draw face box with a cyan glow
        const box = resized.detection.box;
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#06b6d4";
        ctx.shadowBlur = 10;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.shadowBlur = 0;
      }

      // Stop scanning and verify
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }

      setStatus("verifying");
      setMessage("Verifying identity…");

      try {
        const descriptor = Array.from(detection.descriptor);
        const res = await fetch(`${API_BASE}/face/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descriptor }),
        });
        const data = await res.json();

        if (data.matched && data.jwt) {
          setStatus("success");
          setMatchedName(data.worker?.name ?? "Worker");
          setConfidence(data.confidence);
          setMessage(`Welcome back, ${data.worker?.name}!`);
          stopCamera();
          // Slight delay for the success animation
          setTimeout(() => {
            onSuccess({ name: data.worker?.name ?? "Worker", role: data.role ?? "Professional", jwt: data.jwt });
          }, 1500);
        } else {
          setStatus("error");
          if (data.noEnrollments) {
            setMessage("No faces registered yet. Ask your administrator to enroll your face first.");
            // Don't restart scanning — enrollment is needed
          } else {
            setMessage("Face not recognized. Try again or use PIN login.");
            setTimeout(() => {
              setStatus("scanning");
              setMessage("Looking for your face…");
              scanIntervalRef.current = window.setInterval(() => {}, 500);
              startCamera();
            }, 2500);
          }
        }
      } catch {
        setStatus("error");
        setMessage("Verification failed. Check your connection.");
      }
    }, 800);
  }, [status, onSuccess, stopCamera, startCamera]);

  const handleClose = () => {
    stopCamera();
    onCancel();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all z-10"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-6"
      >
        <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 flex items-center justify-center mx-auto mb-3">
          <ScanFace className="w-7 h-7 text-cyan-400" />
        </div>
        <h2 className="text-lg font-black text-white font-heading tracking-wide">Face Login</h2>
        <p className="text-xs text-white/40 mt-1">Powered by AI face detection</p>
      </motion.div>

      {/* Camera viewport */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="relative w-full max-w-[320px] aspect-[3/4] rounded-3xl overflow-hidden bg-[#0a0a0f] border-2 border-white/10"
      >
        {/* Scanning animation overlay */}
        {status === "scanning" && (
          <motion.div
            className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent z-20"
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        )}

        {/* Corner brackets */}
        <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-cyan-400/60 rounded-tl-lg z-10" />
        <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-cyan-400/60 rounded-tr-lg z-10" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-cyan-400/60 rounded-bl-lg z-10" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-cyan-400/60 rounded-br-lg z-10" />

        {/* Video feed */}
        <video
          ref={videoRef}
          onPlay={handleVideoPlay}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover scale-x-[-1]"
        />

        {/* Detection overlay canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full scale-x-[-1]"
        />

        {/* Success overlay */}
        <AnimatePresence>
          {status === "success" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-emerald-500/20 backdrop-blur-sm flex flex-col items-center justify-center z-30"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 15 }}
              >
                <CheckCircle2 className="w-16 h-16 text-emerald-400" />
              </motion.div>
              <p className="text-white font-bold mt-3 text-lg">{matchedName}</p>
              <p className="text-emerald-300 text-sm font-semibold">{Math.round(confidence * 100)}% match</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading overlay */}
        {status === "loading-models" && (
          <div className="absolute inset-0 bg-[#0a0a0f] flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-white/40 text-xs mt-3">Loading AI models…</p>
          </div>
        )}
      </motion.div>

      {/* Status bar */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-5 text-center"
      >
        <div className={cn(
          "flex items-center justify-center gap-2 text-sm font-semibold",
          status === "success" ? "text-emerald-400" :
          status === "error" ? "text-red-400" :
          status === "verifying" ? "text-amber-400" :
          "text-white/60"
        )}>
          {status === "scanning" && <Loader2 className="w-4 h-4 animate-spin" />}
          {status === "verifying" && <Loader2 className="w-4 h-4 animate-spin" />}
          {status === "success" && <CheckCircle2 className="w-4 h-4" />}
          {status === "error" && <AlertCircle className="w-4 h-4" />}
          {message}
        </div>
      </motion.div>

      {/* Cancel / fallback */}
      {status !== "success" && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          onClick={handleClose}
          className="mt-6 text-white/30 text-xs font-semibold hover:text-white/50 transition-colors"
        >
          Use PIN login instead
        </motion.button>
      )}
    </motion.div>
  );
}
