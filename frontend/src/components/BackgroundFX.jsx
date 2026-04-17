import React, { useMemo } from 'react';

const BackgroundFX = () => {
  // Memoize particles to prevent re-renders jittering
  const particles = useMemo(() => {
    return [...Array(15)].map((_, i) => ({
      id: i,
      left: Math.random() * 100 + '%',
      top: Math.random() * 100 + '%',
      size: Math.random() * 3 + 1 + 'px',
      duration: Math.random() * 10 + 15 + 's',
      delay: Math.random() * -20 + 's'
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-black">
      {/* Dust Particles */}
      <div className="absolute inset-0 opacity-10">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-amber-500/20 blur-[1px]"
            style={{
              width: p.size,
              height: p.size,
              left: p.left,
              top: p.top,
              animation: `float ${p.duration} linear infinite`,
              animationDelay: p.delay
            }}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes float {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default BackgroundFX;
