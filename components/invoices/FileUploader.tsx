
import React, { useRef, useState } from 'react';
import { UploadCloud } from './Icons';

interface FileUploaderProps {
  onFilesSelect: (files: File[]) => void;
  isProcessing: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelect, isProcessing }) => {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelect(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelect(Array.from(e.target.files));
    }
  };

  const onButtonClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl transition-all duration-300 ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-white hover:bg-slate-50"
        } ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
          <div className="mb-4 p-4 rounded-full bg-blue-100 text-blue-600">
            <UploadCloud size={32} />
          </div>
          <p className="mb-2 text-lg font-semibold text-slate-700">
            Click to upload or drag and drop
          </p>
          <p className="text-sm text-slate-500 font-medium">
            You can select multiple files at once.
          </p>
          <p className="text-sm text-slate-400 mt-1">
            PDF, PNG, JPG or WEBP (Max 10MB)
          </p>
          <p className="mt-4 text-xs text-slate-400 bg-slate-100 py-1 px-3 rounded-full">
            Supports Indian GST Invoices
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf"
          onChange={handleChange}
          disabled={isProcessing}
          multiple
        />
        <button
          onClick={onButtonClick}
          className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none"
        />
      </div>
    </div>
  );
};

export default FileUploader;
