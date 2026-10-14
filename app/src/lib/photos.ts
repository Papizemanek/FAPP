import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Vybere fotku z galerie a připraví ji k odeslání: zmenší ji a znovu zakóduje do JPEGu.
 * Překódováním zmizí EXIF včetně GPS souřadnic (server je navíc odstraňuje i sám).
 */
export async function pickPhotoBase64({ square = false }: { square?: boolean } = {}): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: square ? [1, 1] : [3, 4],
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const rendered = await ImageManipulator.manipulate(result.assets[0].uri).resize({ width: 1080 }).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
  return saved.base64 ?? null;
}
