import React from 'react';

const BackgroundFX = ({ activeEvent }) => {
  return (
    <div className={`fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-black`}>
      {/* Scanline Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-50"></div>
      
      {/* Dust Particles */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-amber-500/30 blur-[1px]"
            style={{
              width: Math.random() * 4 + 1 + 'px',
              height: Math.random() * 4 + 1 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animation: `float ${Math.random() * 10 + 10}s linear infinite`,
              animationDelay: `${Math.random() * -20}s`
            }}
          />
        ))}
      </div>

      {/* Extreme Glitch for Events */}
      {activeEvent && (
        <div className={`absolute inset-0 z-40 mix-blend-overlay opacity-30 animate-pulse bg-red-900/40`}>
           <div className="absolute inset-0 bg-white/5 animate-glitch transform translate-x-1"></div>
        </div>
      )}

      <style jsx>{`
        @keyframes float {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translate(${Math.random() * 100 - 50}px, -100vh) rotate(360deg); opacity: 0; }
        }
        @keyframes glitch {
            0% { clip-path: inset(80% 0 0 0); transform: translate(-5px); }
            20% { clip-path: inset(20% 0 50% 0); transform: translate(5px); }
            40% { clip-path: inset(50% 0 30% 0); transform: translate(-5px); }
            60% { clip-path: inset(10% 0 70% 0); transform: translate(5px); }
            80% { clip-path: inset(60% 0 10% 0); transform: translate(-5px); }
            100% { clip-path: inset(80% 0 0 0); transform: translate(5px); }
        }
      `}</style>
    </div>
  );
};

export default BackgroundFX;
