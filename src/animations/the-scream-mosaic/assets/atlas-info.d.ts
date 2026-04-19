interface AtlasPhotoEntry {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AtlasInfo {
  atlasWidth: number;
  atlasHeight: number;
  photoSize: number;
  cols: number;
  rows: number;
  photos: AtlasPhotoEntry[];
}

declare const atlasInfo: AtlasInfo;
export default atlasInfo;
