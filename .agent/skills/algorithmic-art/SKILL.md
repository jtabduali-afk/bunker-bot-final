---
name: algorithmic-art
description: Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration. Use this when users request creating art using code, generative art, algorithmic art, flow fields, or particle systems. Create original algorithmic art rather than copying existing artists' work to avoid copyright violations.
license: Complete terms in LICENSE.txt
---

Algorithmic philosophies are computational aesthetic movements that are then expressed through code. Output .md files (philosophy), .html files (interactive viewer), and .js files (generative algorithms).

This happens in two steps:
1. Algorithmic Philosophy Creation (.md file)
2. Express by creating p5.js generative art (.html + .js files)

First, undertake this task:

To begin, create an ALGORITHMIC PHILOSOPHY (not static images or templates) that will be interpreted through:
- Computational processes, emergent behavior, mathematical beauty
- Seeded randomness, noise fields, organic systems
- Particles, flows, fields, forces
- Parametric variation and controlled chaos

### THE CRITICAL UNDERSTANDING
- What is received: Some subtle input or instructions by the user to take into account, but use as a foundation; it should not constrain creative freedom.
- What is created: An algorithmic philosophy/generative aesthetic movement.
- What happens next: The same version receives the philosophy and EXPRESSES IT IN CODE - creating p5.js sketches that are 90% algorithmic generation, 10% essential parameters.

### HOW TO GENERATE AN ALGORITHMIC PHILOSOPHY
**Name the movement** (1-2 words): "Organic Turbulence" / "Quantum Harmonics" / "Emergent Stillness"

**Articulate the philosophy** (4-6 paragraphs - concise but complete).

**CRITICAL GUIDELINES:**
- **Avoid redundancy**: Each algorithmic aspect should be mentioned once.
- **Emphasize craftsmanship**: The philosophy MUST stress multiple times that the final algorithm should appear as though it took countless hours to develop.
- **Leave creative space**: Be specific about the algorithmic direction, but concise enough that the next Claude has room to make interpretive implementation choices.

### ESSENTIAL PRINCIPLES
- **ALGORITHMIC PHILOSOPHY**: Creating a computational worldview to be expressed through code
- **PROCESS OVER PRODUCT**: Always emphasize that beauty emerges from the algorithm's execution
- **PARAMETRIC EXPRESSION**: Ideas communicate through mathematical relationships
- **EXPERT CRAFTSMANSHIP**: Repeatedly emphasize the final algorithm must feel meticulously crafted

### P5.JS IMPLEMENTATION
With the philosophy AND conceptual framework established, express it through code.

**Seeded Randomness**:
```javascript
// ALWAYS use a seed for reproducibility
let seed = 12345;
randomSeed(seed);
noiseSeed(seed);
```

**Canvas Setup**:
```javascript
function setup() {
  createCanvas(1200, 1200);
}

function draw() {
}
```

### CRAFTSMANSHIP REQUIREMENTS
- **Balance**: Complexity without visual noise
- **Color Harmony**: Thoughtful palettes
- **Composition**: Visual hierarchy and flow
- **Reproducibility**: Same seed ALWAYS produces identical output

**Deliverables**:
1. **Algorithmic Philosophy** - Markdown file
2. **Interactive Artifact** - Self-contained HTML with p5.js
