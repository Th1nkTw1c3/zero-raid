// DOM overlay for the reply spell — a real text box over the frozen dungeon.
import type { UnreadMsg } from './types';

const CANNED = ['On it.', 'Got it, thanks.', 'No thanks.', 'Can we push to next week?', 'Done.'];

export function showReplyOverlay(msg: UnreadMsg, demo: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.style.cssText = `
      position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.72);z-index:10;font-family:'Courier New',monospace;
    `;
    const box = document.createElement('div');
    box.style.cssText = `
      width:min(560px,90vw);background:#120c0c;border:3px solid #8c2820;
      box-shadow:0 0 40px #000;padding:14px;color:#e8e0d0;
    `;
    box.innerHTML = `
      <div style="color:#c090ff;font-size:12px;letter-spacing:2px;margin-bottom:8px">
        ⚡ HELLFIRE SPELL — REPLY REQUIRED ${demo ? '(DEMO — simulated send)' : ''}
      </div>
      <div style="font-size:13px;color:#ffd040;margin-bottom:2px" id="zr-subj"></div>
      <div style="font-size:11px;color:#908880;margin-bottom:10px" id="zr-from"></div>
      <textarea id="zr-body" rows="4" style="
        width:100%;box-sizing:border-box;background:#0a0a0a;color:#e8e0d0;
        border:1px solid #503028;font-family:inherit;font-size:13px;padding:8px;
        resize:vertical;outline:none;
      " placeholder="Type a real reply — this sends through Gmail…"></textarea>
      <div id="zr-chips" style="margin:8px 0;display:flex;gap:6px;flex-wrap:wrap"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px">
        <button id="zr-cancel" style="${btn('#403830')}">ESC — SHEATHE</button>
        <button id="zr-send" style="${btn('#8c2820')}">CTRL+ENTER — CAST (SEND)</button>
      </div>
      <div id="zr-status" style="font-size:11px;color:#908880;margin-top:6px"></div>
    `;
    root.appendChild(box);
    document.body.appendChild(root);

    function btn(bg: string): string {
      return `background:${bg};color:#e8e0d0;border:1px solid #000;font-family:inherit;
        font-size:12px;padding:6px 10px;cursor:pointer;letter-spacing:1px;`;
    }

    const subj = box.querySelector<HTMLDivElement>('#zr-subj')!;
    const from = box.querySelector<HTMLDivElement>('#zr-from')!;
    const ta = box.querySelector<HTMLTextAreaElement>('#zr-body')!;
    const chips = box.querySelector<HTMLDivElement>('#zr-chips')!;
    const status = box.querySelector<HTMLDivElement>('#zr-status')!;
    subj.textContent = msg.subject;
    from.textContent = `from ${msg.from}`;

    for (const c of CANNED) {
      const chip = document.createElement('button');
      chip.textContent = c;
      chip.style.cssText = btn('#241f1c') + 'font-size:10px;padding:3px 8px;';
      chip.onclick = () => {
        ta.value = c;
        ta.focus();
      };
      chips.appendChild(chip);
    }

    const done = (val: string | null) => {
      cleanup();
      resolve(val);
    };
    const cleanup = () => {
      document.removeEventListener('keydown', onKey, true);
      root.remove();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(null);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.stopPropagation();
        const val = ta.value.trim();
        if (!val) {
          status.textContent = 'The spell fizzles — write something first.';
          return;
        }
        status.textContent = 'CASTING…';
        done(val);
      }
    };
    box.querySelector<HTMLButtonElement>('#zr-cancel')!.onclick = () => done(null);
    box.querySelector<HTMLButtonElement>('#zr-send')!.onclick = () => {
      const val = ta.value.trim();
      if (val) {
        status.textContent = 'CASTING…';
        done(val);
      }
    };
    document.addEventListener('keydown', onKey, true);
    ta.focus();
  });
}
