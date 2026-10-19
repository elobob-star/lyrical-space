import { Capacitor } from '@capacitor/core';
import { say } from '../store/ui';

const native = () => Capacitor.isNativePlatform();

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* */ }
    ta.remove();
    return ok;
  }
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const toBase64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

/** Share a file (txt / json / cho / md). On a phone this opens the system share sheet. True once it went somewhere. */
export async function shareFile(name: string, blob: Blob, title: string): Promise<boolean> {
  try {
    if (native()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const w = await Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: Directory.Cache });
      await Share.share({ title, url: w.uri, dialogTitle: title });
      return true;
    }
    const file = new File([blob], name, { type: blob.type });
    if ((navigator as any).canShare?.({ files: [file] })) { await (navigator as any).share({ files: [file], title }); return true; }
    download(name, blob);
    return true;
  } catch (e: any) {
    if (e?.name === 'AbortError' || /cancel/i.test(String(e?.message))) return false;
    say('SHARE FAILED — SAVED TO DOWNLOADS INSTEAD');
    download(name, blob);
    return true;
  }
}

export async function shareText(title: string, text: string): Promise<void> {
  try {
    if (native()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: title });
      return;
    }
    if ((navigator as any).share) { await (navigator as any).share({ title, text }); return; }
    if (await copyText(text)) say('COPIED TO CLIPBOARD');
  } catch (e: any) {
    if (e?.name === 'AbortError' || /cancel/i.test(String(e?.message))) return;
    if (await copyText(text)) say('COPIED TO CLIPBOARD');
  }
}

export function saveBlobLocal(name: string, blob: Blob): void { download(name, blob); }
