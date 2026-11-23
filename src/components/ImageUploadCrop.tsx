'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Crop,
  RotateCcw,
  Maximize2,
  ZoomIn,
  Move,
  Link as LinkIcon,
  Check,
  Sparkles,
  Layers,
} from 'lucide-react';

export type AspectRatioOption = 'original' | '1:1' | '4:5' | '16:9';
export type FitMode = 'cover' | 'contain';

interface ImageUploadCropProps {
  initialImageUrl?: string;
  initialFitMode?: FitMode;
  onImageChange: (data: {
    blob: Blob | null;
    previewUrl: string;
    fitMode: FitMode;
  }) => void;
}

export default function ImageUploadCrop({
  initialImageUrl = '',
  initialFitMode = 'cover',
  onImageChange,
}: ImageUploadCropProps) {
  const [sourceType, setSourceType] = useState<'upload' | 'url'>('upload');
  const [rawImageSrc, setRawImageSrc] = useState<string>(initialImageUrl);
  const [croppedPreview, setCroppedPreview] = useState<string>(initialImageUrl);
  const [urlInput, setUrlInput] = useState<string>(initialImageUrl.startsWith('http') ? initialImageUrl : '');
  const [fileName, setFileName] = useState<string>('');

  // Editing controls
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('4:5');
  const [fitMode, setFitMode] = useState<FitMode>(initialFitMode);
  const [zoom, setZoom] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Sync initial URL if provided
  useEffect(() => {
    if (initialImageUrl && !rawImageSrc) {
      setRawImageSrc(initialImageUrl);
      setCroppedPreview(initialImageUrl);
    }
  }, [initialImageUrl]);

  // Handle local computer file pick
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WebP).');
      return;
    }

    setFileName(`${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setRawImageSrc(result);
      setCroppedPreview(result);
      setZoom(1);
      setPanX(0);
      setPanY(0);
      setIsCropping(true);

      onImageChange({
        blob: file,
        previewUrl: result,
        fitMode,
      });
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setFileName(`${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setRawImageSrc(result);
        setCroppedPreview(result);
        setZoom(1);
        setPanX(0);
        setPanY(0);
        setIsCropping(true);

        onImageChange({
          blob: file,
          previewUrl: result,
          fitMode,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle URL input
  const handleApplyUrl = () => {
    if (!urlInput.trim()) return;
    setRawImageSrc(urlInput.trim());
    setCroppedPreview(urlInput.trim());
    setFileName('Web Image URL');
    setZoom(1);
    setPanX(0);
    setPanY(0);

    onImageChange({
      blob: null,
      previewUrl: urlInput.trim(),
      fitMode,
    });
  };

  // Apply Crop to Canvas and emit Blob
  const applyCrop = useCallback(() => {
    if (!rawImageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;

      // Calculate target aspect ratio
      let targetRatio = imgWidth / imgHeight;
      if (aspectRatio === '1:1') targetRatio = 1.0;
      else if (aspectRatio === '4:5') targetRatio = 4 / 5;
      else if (aspectRatio === '16:9') targetRatio = 16 / 9;

      // Base dimensions for output canvas
      const maxDim = 1200;
      let outWidth = maxDim;
      let outHeight = Math.round(maxDim / targetRatio);

      if (targetRatio > 1) {
        outWidth = maxDim;
        outHeight = Math.round(maxDim / targetRatio);
      } else {
        outHeight = maxDim;
        outWidth = Math.round(maxDim * targetRatio);
      }

      canvas.width = outWidth;
      canvas.height = outHeight;

      // Fill background (neutral slate-900)
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, outWidth, outHeight);

      // Calculate source crop rectangle factoring in zoom and pan
      const srcRatio = imgWidth / imgHeight;
      let drawW = outWidth;
      let drawH = outHeight;

      if (srcRatio > targetRatio) {
        drawH = outHeight * zoom;
        drawW = drawH * srcRatio;
      } else {
        drawW = outWidth * zoom;
        drawH = drawW / srcRatio;
      }

      // Center offset + user pan
      const offsetX = (outWidth - drawW) / 2 + (panX / 100) * (outWidth * 0.4);
      const offsetY = (outHeight - drawH) / 2 + (panY / 100) * (outHeight * 0.4);

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const objectUrl = URL.createObjectURL(blob);
          setCroppedPreview(objectUrl);
          setIsCropping(false);

          onImageChange({
            blob,
            previewUrl: objectUrl,
            fitMode,
          });
        },
        'image/jpeg',
        0.92
      );
    };
    img.src = rawImageSrc;
  }, [rawImageSrc, aspectRatio, zoom, panX, panY, fitMode, onImageChange]);

  // Reset adjustments
  const handleResetCrop = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setAspectRatio('original');
    setCroppedPreview(rawImageSrc);
    setIsCropping(false);
  };

  // Toggle Fit Mode
  const handleFitModeChange = (mode: FitMode) => {
    setFitMode(mode);
    onImageChange({
      blob: null,
      previewUrl: croppedPreview || rawImageSrc,
      fitMode: mode,
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      {/* Header Tabs: Upload File vs Image URL */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
          <Upload size={15} className="text-indigo-600" />
          Select Image / Festival Poster
        </span>

        <div className="flex rounded-lg bg-slate-200/80 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setSourceType('upload')}
            className={`px-3 py-1 rounded-md transition-all ${
              sourceType === 'upload'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            From Computer
          </button>
          <button
            type="button"
            onClick={() => setSourceType('url')}
            className={`px-3 py-1 rounded-md transition-all ${
              sourceType === 'url'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Image Link
          </button>
        </div>
      </div>

      {/* SOURCE 1: COMPUTER FILE PICKER & DROP ZONE */}
      {sourceType === 'upload' && (
        <div>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/70 scale-[0.99]'
                : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="mx-auto w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 shadow-inner">
              <Upload size={22} />
            </div>
            <p className="text-xs font-bold text-slate-800">
              Click to browse image from computer or drag & drop here
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Supports JPG, PNG, WebP up to 15MB • Perfect for Festival Greetings & Motivational Posts
            </p>
            {fileName && (
              <span className="inline-block mt-2.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                ✓ Selected: {fileName}
              </span>
            )}
          </div>
        </div>
      )}

      {/* SOURCE 2: URL INPUT */}
      {sourceType === 'url' && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon size={14} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="url"
              placeholder="https://images.unsplash.com/photo-..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={handleApplyUrl}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
          >
            <Check size={14} />
            Load
          </button>
        </div>
      )}

      {/* CROP & FIT TOOLBAR (Visible when an image is loaded) */}
      {rawImageSrc && (
        <div className="space-y-3 pt-2 border-t border-slate-200">
          {/* Controls toggle bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Crop size={14} className="text-indigo-600" />
              Aspect Ratio & Crop Options
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsCropping(!isCropping)}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-all ${
                  isCropping
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Crop size={13} />
                {isCropping ? 'Adjusting' : 'Crop Image'}
              </button>

              <button
                type="button"
                onClick={handleResetCrop}
                className="text-xs px-2 py-1 rounded-lg font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-all flex items-center gap-1"
                title="Reset adjustments"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>
          </div>

          {/* Aspect Ratio Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Ratio:</span>
            {[
              { id: '4:5', label: '4:5 Portrait' },
              { id: '1:1', label: '1:1 Square' },
              { id: '16:9', label: '16:9 Banner' },
              { id: 'original', label: 'Original' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAspectRatio(opt.id as AspectRatioOption)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  aspectRatio === opt.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Interactive Zoom & Pan Sliders (When isCropping is active) */}
          {isCropping && (
            <div className="bg-white p-3 rounded-xl border border-indigo-100 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                <span className="flex items-center gap-1">
                  <ZoomIn size={13} className="text-indigo-600" />
                  Zoom: {zoom.toFixed(1)}x
                </span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-40 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                <span className="flex items-center gap-1">
                  <Move size={13} className="text-indigo-600" />
                  Pan Vertical: {panY > 0 ? `+${panY}%` : `${panY}%`}
                </span>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={panY}
                  onChange={(e) => setPanY(parseInt(e.target.value))}
                  className="w-40 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                <span className="flex items-center gap-1">
                  <Move size={13} className="text-indigo-600" />
                  Pan Horizontal: {panX > 0 ? `+${panX}%` : `${panX}%`}
                </span>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={panX}
                  onChange={(e) => setPanX(parseInt(e.target.value))}
                  className="w-40 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={applyCrop}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Check size={14} />
                  Apply Crop to Preview
                </button>
              </div>
            </div>
          )}

          {/* FIT MODE TOGGLE (Fit vs Fill) */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Layers size={14} className="text-indigo-600" />
                Image Fit Mode in App Feed
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Controls how the mobile app frames this greeting/poster
              </p>
            </div>

            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleFitModeChange('cover')}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                  fitMode === 'cover'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Maximize2 size={13} />
                Fill / Cover
              </button>

              <button
                type="button"
                onClick={() => handleFitModeChange('contain')}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                  fitMode === 'contain'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles size={13} />
                Fit / Contain
              </button>
            </div>
          </div>

          {/* PREVIEW CONTAINER (Mimics Mobile Feed) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Feed Preview ({fitMode.toUpperCase()} mode)
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {aspectRatio.toUpperCase()} aspect
              </span>
            </div>

            <div
              className={`relative rounded-xl border border-slate-200 overflow-hidden bg-slate-950 flex items-center justify-center transition-all ${
                aspectRatio === '1:1'
                  ? 'h-64'
                  : aspectRatio === '4:5'
                  ? 'h-80'
                  : aspectRatio === '16:9'
                  ? 'h-44'
                  : 'h-64'
              }`}
            >
              <img
                src={croppedPreview || rawImageSrc}
                alt="Feed Preview"
                className={`w-full h-full transition-all ${
                  fitMode === 'contain' ? 'object-contain' : 'object-cover'
                }`}
              />

              {/* Mode indicator badge */}
              <div className="absolute bottom-2.5 right-2.5 bg-black/60 backdrop-blur-md text-white text-[10px] font-semibold px-2 py-0.5 rounded-md border border-white/20">
                Mode: {fitMode === 'cover' ? 'Full Cover' : 'Entire Poster (Contain)'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
