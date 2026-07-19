"use client";

import { motion } from "framer-motion";

export function Logo({ className = "", size = 48, showText = true }: { className?: string; size?: number; showText?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Night sky */}
        <circle cx="40" cy="40" r="38" fill="#0B1D36" />
        {/* Soft half-moon */}
        <path
          d="M52 18C43 21 36 30 36 40C36 50 43 59 52 62C46 56 42 48 42 40C42 32 46 24 52 18Z"
          fill="#E8D5A3"
        />
        {/* Stars */}
        <circle cx="20" cy="22" r="1.8" fill="#F8F5F0">
          <animate attributeName="opacity" values="1;0.4;1" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="28" cy="16" r="1.2" fill="#F8F5F0" />
        <circle cx="16" cy="32" r="1.4" fill="#F8F5F0">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="24" cy="40" r="1" fill="#F8F5F0" />
        <circle cx="14" cy="48" r="1.3" fill="#F8F5F0" />
        <circle cx="22" cy="55" r="0.9" fill="#F8F5F0" />
        {/* Counting sheep - simple elegant */}
        <g opacity="0.95">
          {/* Sheep body */}
          <ellipse cx="58" cy="54" rx="7" ry="4.5" fill="#F8F5F0" />
          {/* Head */}
          <circle cx="51.5" cy="52" r="3" fill="#F8F5F0" />
          {/* Ears */}
          <ellipse cx="49.5" cy="49.5" rx="1.5" ry="2" fill="#F8F5F0" />
          <ellipse cx="53.5" cy="49.5" rx="1.5" ry="2" fill="#F8F5F0" />
          {/* Legs suggestion */}
          <rect x="54" y="57" width="1.5" height="3" rx="0.5" fill="#F8F5F0" />
          <rect x="59" y="57" width="1.5" height="3" rx="0.5" fill="#F8F5F0" />
        </g>
      </svg>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="text-xl font-semibold tracking-tight text-[#0B1D36]">
            Sleep Lab
          </span>
          <span className="text-[10px] font-medium tracking-[0.2em] text-[#6B7280] uppercase">
            by RAP
          </span>
        </div>
      )}
    </div>
  );
}
