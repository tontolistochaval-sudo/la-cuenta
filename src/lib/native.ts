/**
 * Puente con el móvil (Capacitor). En la app de Android usa los plugins nativos;
 * en el navegador cae a las APIs web, así la misma base sirve para las dos.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Geolocation } from '@capacitor/geolocation';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { compressImage } from './image';

export const isNative = Capacitor.isNativePlatform();

/* ─────────── Vibración ─────────── */

export const haptic = {
  tap: () => isNative && Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}),
  select: () => isNative && Haptics.selectionStart().then(() => Haptics.selectionChanged()).then(() => Haptics.selectionEnd()).catch(() => {}),
  success: () => isNative && Haptics.notification({ type: NotificationType.Success }).catch(() => {}),
  warning: () => isNative && Haptics.notification({ type: NotificationType.Warning }).catch(() => {}),
};

/* ─────────── Ubicación ─────────── */

const round5 = (n: number) => Number(n.toFixed(5));

export async function currentPosition(): Promise<[number, number]> {
  if (isNative) {
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (req.location !== 'granted') throw new Error('Sin permiso de ubicación. Actívalo en Ajustes del móvil → Apps → La Cuenta.');
      }
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
      return [round5(p.coords.latitude), round5(p.coords.longitude)];
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (/permiso|permission|denied/i.test(msg)) throw new Error(msg.startsWith('Sin permiso') ? msg : 'Sin permiso de ubicación.');
      if (/location.*(disabled|off)|services/i.test(msg)) throw new Error('Activa la ubicación del móvil y vuelve a probar.');
      throw new Error('No se pudo obtener la ubicación.');
    }
  }
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Este navegador no da la ubicación.'));
    if (!window.isSecureContext) return reject(new Error('La ubicación solo funciona con https (o en localhost).'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([round5(p.coords.latitude), round5(p.coords.longitude)]),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Sin permiso de ubicación.' : 'No se pudo obtener la ubicación.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}

/* ─────────── Portapapeles ─────────── */

export async function readClipboard(): Promise<string> {
  try {
    if (isNative) return (await Clipboard.read()).value ?? '';
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

export async function writeClipboard(text: string) {
  if (isNative) return Clipboard.write({ string: text });
  return navigator.clipboard.writeText(text);
}

/* ─────────── Compartir ─────────── */

/** Devuelve 'shared' | 'copied' | 'cancelled'. */
export async function shareText(text: string, title?: string): Promise<'shared' | 'copied' | 'cancelled'> {
  try {
    if (isNative) {
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text });
      return 'shared';
    }
    await writeClipboard(text);
    return 'copied';
  } catch {
    return 'cancelled';
  }
}

/** Guarda un archivo de texto y lo comparte (móvil) o lo descarga (web). */
export async function exportFile(name: string, content: string, mime = 'application/json') {
  if (isNative) {
    const res = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [res.uri], dialogTitle: 'Guardar o enviar la copia' }).catch(() => {});
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ─────────── Fotos ─────────── */

/** Cámara o galería (móvil) / selector de archivos (web). Devuelve la foto ya comprimida, o nada si se cancela. */
export async function pickPhoto(): Promise<string | undefined> {
  if (isNative) {
    try {
      const p = await Camera.getPhoto({
        source: CameraSource.Prompt,
        resultType: CameraResultType.DataUrl,
        quality: 80,
        width: 1200,
        correctOrientation: true,
        promptLabelHeader: 'Foto',
        promptLabelPhoto: 'Elegir de la galería',
        promptLabelPicture: 'Hacer foto',
        promptLabelCancel: 'Cancelar',
      });
      if (!p.dataUrl) return undefined;
      const blob = await (await fetch(p.dataUrl)).blob();
      return compressImage(new File([blob], 'foto.jpg', { type: blob.type || 'image/jpeg' }));
    } catch {
      return undefined; // cancelado
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await compressImage(f) : undefined);
    };
    input.click();
  });
}

/* ─────────── Recordatorio semanal ─────────── */

const REMINDER_ID = 1001;

export async function setWeeklyReminder(on: boolean): Promise<boolean> {
  if (!isNative) return false;
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => {});
  if (!on) return true;
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return false;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: 'La Cuenta.',
        body: 'Es viernes. ¿Dónde cenamos hoy? 🍽️',
        // Viernes (domingo = 1) a las 19:00. Sin alarma exacta: no hace falta un permiso extra.
        schedule: { on: { weekday: 6, hour: 19, minute: 0 } },
      },
    ],
  });
  return true;
}
