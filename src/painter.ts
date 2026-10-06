// Procedural creature painter: draw big with canvas shapes, downsample,
// posterize to a 5-level palette per channel, and add a 1px dark outline —
// the Doom sprite pipeline.
export function paint(
  w: number,
  h: number,
  fn: (g: CanvasRenderingContext2D, W: number, H: number) => void,
): HTMLCanvasElement {
  const S = 4;
  const big = document.createElement('canvas');
  big.width = w * S;
  big.height = h * S;
  const g = big.getContext('2d')!;
  g.scale(S, S);
  fn(g, w, h);
  // Nearest-neighbour downsample to final size.
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const og = out.getContext('2d')!;
  og.imageSmoothingEnabled = false;
  og.drawImage(big, 0, 0, w, h);
  return polish(out);
}

// Posterize + outline pass — also usable on existing row-drawn art.
export function polish(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const W = c.width;
  const H = c.height;
  const opaque = (i: number) => d[i + 3] > 40;
  // Posterize every opaque pixel to 5 levels per channel.
  for (let i = 0; i < d.length; i += 4) {
    if (!opaque(i)) continue;
    d[i] = Math.round(d[i] / 51) * 51;
    d[i + 1] = Math.round(d[i + 1] / 51) * 51;
    d[i + 2] = Math.round(d[i + 2] / 51) * 51;
  }
  // Outline: opaque pixel touching transparency → 45% darker.
  const dark: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!opaque(i)) continue;
      const edge =
        (x > 0 && !opaque(i - 4)) ||
        (x < W - 1 && !opaque(i + 4)) ||
        (y > 0 && !opaque(i - W * 4)) ||
        (y < H - 1 && !opaque(i + W * 4));
      if (edge) dark.push(i);
    }
  }
  for (const i of dark) {
    d[i] *= 0.55;
    d[i + 1] *= 0.55;
    d[i + 2] *= 0.55;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// 3-tone shaded ellipse (light from upper-left).
export function blob(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  base: string,
  light: string,
  dark: string,
  lightDir = -0.35,
) {
  g.fillStyle = base;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = light;
  g.beginPath();
  g.ellipse(x + rx * lightDir, y - Math.abs(ry * lightDir), rx * 0.62, ry * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = base;
  g.beginPath();
  g.ellipse(x + rx * lightDir * 0.5, y - Math.abs(ry * lightDir) * 0.5, rx * 0.55, ry * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = dark;
  g.beginPath();
  g.ellipse(x - rx * lightDir * 0.8, y + Math.abs(ry * lightDir) * 0.9, rx * 0.55, ry * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = base;
  g.beginPath();
  g.ellipse(x - rx * lightDir * 0.3, y + Math.abs(ry * lightDir) * 0.4, rx * 0.45, ry * 0.42, 0, 0, Math.PI * 2);
  g.fill();
}

// Capsule limb with dark underside.
export function limb(
  g: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  th: number,
  base: string,
  light: string,
  dark: string,
) {
  const cap = (x: number, y: number, c: string) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, th / 2, 0, Math.PI * 2);
    g.fill();
  };
  g.lineCap = 'round';
  g.strokeStyle = dark;
  g.lineWidth = th;
  g.beginPath();
  g.moveTo(x1, y1 + 0.4);
  g.lineTo(x2, y2 + 0.4);
  g.stroke();
  g.strokeStyle = base;
  g.lineWidth = th * 0.82;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  g.strokeStyle = light;
  g.lineWidth = th * 0.34;
  g.beginPath();
  g.moveTo(x1 - 0.15, y1 - 0.25);
  g.lineTo(x2 - 0.15, y2 - 0.25);
  g.stroke();
  cap(x1, y1, base);
  cap(x2, y2, base);
}

export function spike(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  th: number,
  color: string,
) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - dy * th, y + dx * th);
  g.lineTo(x + dx * len, y + dy * len);
  g.lineTo(x + dy * th, y - dx * th);
  g.fill();
}

export function eye(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  glow = 0.7,
) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = glow;
  g.fillStyle = gr;
  g.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
  g.restore();
  g.fillStyle = '#fff8f0';
  g.beginPath();
  g.arc(x, y, r * 0.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

export function teeth(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  n: number,
  color = '#e8e0d0',
  down = true,
) {
  g.fillStyle = color;
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const tx = x + i * sw;
    g.beginPath();
    if (down) {
      g.moveTo(tx, y);
      g.lineTo(tx + sw * 0.5, y + h * (0.7 + ((i * 7) % 3) * 0.15));
      g.lineTo(tx + sw, y);
    } else {
      g.moveTo(tx, y + h);
      g.lineTo(tx + sw * 0.5, y + h * 0.3);
      g.lineTo(tx + sw, y + h);
    }
    g.fill();
  }
}
