import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing
} from 'remotion';

interface CuePoint {
  id: string;
  stepNum: string;
  stepTotal: string;
  category: string;
  icon: string;
  title: string;
  subtitle: string;
  startSec: number;
  endSec: number;
  focusX: number;
  focusY: number;
  zoom: number;
}

const CUES: CuePoint[] = [
  {
    id: 'raw_materials',
    stepNum: '01',
    stepTotal: '06',
    category: 'RAW INVENTORY',
    icon: '🏷️',
    title: 'Smart Raw Material Inwarding',
    subtitle: 'Real-time purchase unit costs & plant stock valuation',
    startSec: 4.1,
    endSec: 19.0,
    focusX: 560,
    focusY: 380,
    zoom: 1.24
  },
  {
    id: 'cell_testing',
    stepNum: '02',
    stepTotal: '06',
    category: 'QUALITY CONTROL',
    icon: '🧪',
    title: 'Automated Cell Grading & QC',
    subtitle: 'Precision IR (mΩ), voltage & capacity sorting before pack assembly',
    startSec: 19.0,
    endSec: 28.5,
    focusX: 780,
    focusY: 440,
    zoom: 1.22
  },
  {
    id: 'wip_assembly',
    stepNum: '03',
    stepTotal: '06',
    category: 'PRODUCTION LINE',
    icon: '⚙️',
    title: 'WIP Assembly & Production Runs',
    subtitle: 'Automated BOM inventory deduction per battery pack in real-time',
    startSec: 28.5,
    endSec: 37.3,
    focusX: 620,
    focusY: 380,
    zoom: 1.25
  },
  {
    id: 'bom_costing',
    stepNum: '04',
    stepTotal: '06',
    category: 'FINANCIAL ENGINE',
    icon: '🧮',
    title: 'Live BOM Costing & Margin Engine',
    subtitle: 'Instant raw material cost roll-up, dealer & retail margin tiers with GST',
    startSec: 37.3,
    endSec: 50.2,
    focusX: 960,
    focusY: 460,
    zoom: 1.26
  },
  {
    id: 'finished_goods',
    stepNum: '05',
    stepTotal: '06',
    category: 'FINISHED GOODS',
    icon: '📦',
    title: 'Finished Goods & Serial Traceability',
    subtitle: 'End-to-end genealogy search from raw cell serial to finished pack',
    startSec: 50.2,
    endSec: 65.9,
    focusX: 680,
    focusY: 420,
    zoom: 1.22
  },
  {
    id: 'commercial_erp',
    stepNum: '06',
    stepTotal: '06',
    category: 'PLANT ERP',
    icon: '💼',
    title: 'Complete Plant ERP Operations',
    subtitle: 'GST Invoice Maker, Supplier Directory, Tasks & Expenses',
    startSec: 65.9,
    endSec: 96.5,
    focusX: 960,
    focusY: 520,
    zoom: 1.20
  }
];

export const ShowcaseVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const currentSec = frame / fps;

  // Active cue detection
  const activeCueIndex = CUES.findIndex(
    (c) => currentSec >= c.startSec && currentSec < c.endSec
  );
  const activeCue = activeCueIndex !== -1 ? CUES[activeCueIndex] : null;

  // Camera Zoom & Pan Calculation (Screen Studio style)
  let scale = 1.0;
  let originX = '50%';
  let originY = '50%';

  if (activeCue) {
    const elapsedInCue = currentSec - activeCue.startSec;
    const remainingInCue = activeCue.endSec - currentSec;
    const transitionWindow = 0.8; // seconds

    let zoomProgress = 1.0;
    if (elapsedInCue < transitionWindow) {
      zoomProgress = elapsedInCue / transitionWindow;
    } else if (remainingInCue < transitionWindow) {
      zoomProgress = remainingInCue / transitionWindow;
    }

    const ease = Math.sin((zoomProgress * Math.PI) / 2);
    scale = interpolate(ease, [0, 1], [1.0, activeCue.zoom], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    });

    const oXPercent = (activeCue.focusX / width) * 100;
    const oYPercent = (activeCue.focusY / height) * 100;
    originX = `${oXPercent}%`;
    originY = `${oYPercent}%`;
  }

  // Subtitle Animation
  let subtitleOpacity = 0;
  let subtitleY = 40;

  if (activeCue) {
    const cueStartFrame = activeCue.startSec * fps;
    const cueEndFrame = activeCue.endSec * fps;
    const framesIntoCue = frame - cueStartFrame;
    const framesLeftInCue = cueEndFrame - frame;

    const enterSpring = spring({
      frame: framesIntoCue,
      fps,
      config: { damping: 18, mass: 0.8 }
    });

    let exitFade = 1.0;
    if (framesLeftInCue < 15) {
      exitFade = framesLeftInCue / 15;
    }

    subtitleOpacity = Math.min(enterSpring, exitFade);
    subtitleY = interpolate(enterSpring, [0, 1], [30, 0]);
  }

  // Top progress bar calculation
  const totalProgress = frame / durationInFrames;

  // Outro screen (last 4.9 seconds: 96.5s -> 101.4s)
  const isOutro = currentSec >= 96.5;
  const outroProgress = isOutro
    ? spring({
        frame: Math.max(0, frame - 96.5 * fps),
        fps,
        config: { damping: 15 }
      })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0D0D0D', overflow: 'hidden' }}>
      {/* 1. SCREEN RECORDING VIDEO LAYER WITH CAMERA ZOOM */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${originX} ${originY}`,
          transition: 'transform 0.08s ease-out'
        }}
      >
        <OffthreadVideo
          src={staticFile('raw-showcase.webm')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* 2. SUBTLE VIGNETTE & INDUSTRIAL AMBIENT SHADOW */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 100px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      />

      {/* 3. TOP PROGRESS STRIP */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${totalProgress * 100}%`,
          height: '4px',
          background: 'linear-gradient(90deg, #8EBF45 0%, #658C3E 100%)',
          boxShadow: '0 0 12px rgba(142, 191, 69, 0.9)',
          zIndex: 100
        }}
      />

      {/* 4. TOP-LEFT LIVE MODULE PILL BADGE */}
      {activeCue && (
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 28,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(13, 13, 13, 0.85)',
            border: '1px solid rgba(142, 191, 69, 0.35)',
            borderRadius: '9999px',
            padding: '6px 14px',
            backdropFilter: 'blur(12px)',
            opacity: subtitleOpacity,
            zIndex: 90
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 900,
              color: '#8EBF45'
            }}
          >
            {activeCue.stepNum} / {activeCue.stepTotal}
          </span>
          <span
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: '#8EBF45'
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.1em',
              color: '#E5E7EB',
              textTransform: 'uppercase'
            }}
          >
            {activeCue.category}
          </span>
        </div>
      )}

      {/* 5. KINETIC GLASSMORPHIC SUBTITLE CALLOUT AT BOTTOM */}
      {activeCue && (
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: '50%',
            transform: `translateX(-50%) translateY(${subtitleY}px)`,
            opacity: subtitleOpacity,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            backgroundColor: 'rgba(13, 13, 13, 0.92)',
            border: '1px solid rgba(142, 191, 69, 0.45)',
            borderRadius: '20px',
            padding: '14px 28px',
            maxWidth: '820px',
            boxShadow:
              '0 15px 35px rgba(0, 0, 0, 0.65), 0 0 25px rgba(142, 191, 69, 0.15)',
            backdropFilter: 'blur(16px)',
            zIndex: 95
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '4px'
            }}
          >
            <span style={{ fontSize: '18px' }}>{activeCue.icon}</span>
            <span
              style={{
                fontSize: '17px',
                fontWeight: 800,
                color: '#FFFFFF',
                fontFamily: 'system-ui, sans-serif',
                letterSpacing: '-0.01em'
              }}
            >
              {activeCue.title}
            </span>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: '#9CA3AF',
              fontWeight: 500,
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            {activeCue.subtitle}
          </p>
        </div>
      )}

      {/* 6. OUTRO TITLE CARD (82s -> 86.5s) */}
      {isOutro && (
        <AbsoluteFill
          style={{
            backgroundColor: 'rgba(13, 13, 13, 0.96)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: outroProgress,
            transform: `scale(${interpolate(outroProgress, [0, 1], [0.95, 1])})`,
            zIndex: 200,
            backdropFilter: 'blur(20px)'
          }}
        >
          <img
            src="https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Full_battery_black_bg.png"
            alt="Datlion Cnergy Logo"
            style={{ height: '72px', width: 'auto', marginBottom: '24px' }}
          />

          <h1
            style={{
              fontSize: '44px',
              fontWeight: 900,
              color: '#FFFFFF',
              fontFamily: 'system-ui, sans-serif',
              letterSpacing: '-0.02em',
              margin: '0 0 10px 0'
            }}
          >
            Datlion Cnergy Plant OS
          </h1>

          <p
            style={{
              fontSize: '18px',
              color: '#8EBF45',
              fontWeight: 700,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              margin: '0 0 36px 0'
            }}
          >
            The Operating System for Battery Manufacturers
          </p>

          <div
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center'
            }}
          >
            <span
              style={{
                backgroundColor: 'rgba(142, 191, 69, 0.15)',
                border: '1px solid rgba(142, 191, 69, 0.5)',
                color: '#8EBF45',
                fontSize: '13px',
                fontWeight: 700,
                padding: '8px 20px',
                borderRadius: '9999px'
              }}
            >
              ⚡ Smart Inwarding & Valuation
            </span>
            <span
              style={{
                backgroundColor: 'rgba(142, 191, 69, 0.15)',
                border: '1px solid rgba(142, 191, 69, 0.5)',
                color: '#8EBF45',
                fontSize: '13px',
                fontWeight: 700,
                padding: '8px 20px',
                borderRadius: '9999px'
              }}
            >
              🧪 Cell Testing & QC
            </span>
            <span
              style={{
                backgroundColor: 'rgba(142, 191, 69, 0.15)',
                border: '1px solid rgba(142, 191, 69, 0.5)',
                color: '#8EBF45',
                fontSize: '13px',
                fontWeight: 700,
                padding: '8px 20px',
                borderRadius: '9999px'
              }}
            >
              🧮 Live BOM Costing
            </span>
            <span
              style={{
                backgroundColor: 'rgba(142, 191, 69, 0.15)',
                border: '1px solid rgba(142, 191, 69, 0.5)',
                color: '#8EBF45',
                fontSize: '13px',
                fontWeight: 700,
                padding: '8px 20px',
                borderRadius: '9999px'
              }}
            >
              📦 Full Traceability
            </span>
            <span
              style={{
                backgroundColor: 'rgba(142, 191, 69, 0.15)',
                border: '1px solid rgba(142, 191, 69, 0.5)',
                color: '#8EBF45',
                fontSize: '13px',
                fontWeight: 700,
                padding: '8px 20px',
                borderRadius: '9999px'
              }}
            >
              💼 Complete Plant ERP
            </span>
          </div>
        </AbsoluteFill>
      )}

      {/* 7. UPBEAT SYNTH SOUNDTRACK */}
      <Audio src={staticFile('background-track.wav')} volume={0.65} />
    </AbsoluteFill>
  );
};
